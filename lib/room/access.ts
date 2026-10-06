import { randomBytes } from "node:crypto";

import { json } from "@/lib/http";
import { RoomEngine, type PersistedRoom } from "@/lib/room/engine";
import type { ActResult, Book, RadioStation, Snapshot } from "@/lib/room/types";
import { flushMail, loadOwner, loadToken } from "@/lib/room/mailbox";
import { OwnerSecretMissing, RoomBusy, RoomOffline, RoomUnavailable } from "@/lib/room/errors";
import { RedisError, redisCommand, redisConfig, redisTimed } from "@/lib/room/redis";
import { roomRpcPrefix, supabaseConfig } from "@/lib/room/store/config";
import { VersionedRoom } from "@/lib/room/store/versioned-room";
import { MemoryPersist } from "@/lib/room/store/memory-persist";

export { RoomBusy, RoomOffline, RoomUnavailable };

const STATE_KEY = "living-room:state";
const LOCK_KEY = "living-room:lock";

/**
 * Redis budget. Upstash counts every command. Each open used to be GET state + HGETALL seen.
 *
 * Before, per watch tab (and the same while the tab was hidden):
 *   SSE every 400ms ≈ 2.5 × 2 = 5/s, plus /api/state every 800ms ≈ 1.25 × 2 = 2.5/s, ≈ 7.5/s.
 *   One active agent looking about every 5s read state twice (door, then look): about 10 cmds/look ≈ 2/s.
 * After:
 *   Idle visible tab: SSE only, every 2s, one shared GET + seen HGETALL ≈ 1/s. Polling runs only if SSE is down.
 *   Hidden tab: stream closed, poll stopped ≈ 0/s.
 *   One active agent: door, look, act, and state share one GET of living-room:state (1s cache).
 *   A look about every 5s is that GET plus seen, token, mail, rate, and HSET ≈ 1.2/s, or ≈ 0.8/s when the cache hits.
 * Door migration is written once; viewer ticks peek and do not SET.
 */
const STATE_CACHE_MS = 1000;
type Cached = { raw: unknown; at: number };
let stateCache: Cached | null = null;
let stateFlight: Promise<unknown> | null = null;
let stateEtag = "";
let seenCache: Cached | null = null;
let seenFlight: Promise<unknown> | null = null;

export function stateCacheEtag() {
  return stateEtag;
}

function rememberState(raw: unknown, at: number) {
  if (stateCache && stateCache.at > at) return stateCache.raw;
  stateCache = { raw, at };
  stateEtag = raw == null ? "0" : typeof raw === "string" ? raw : JSON.stringify(raw);
  return raw;
}

function rememberSeen(raw: unknown, at: number) {
  if (seenCache && seenCache.at > at) return seenCache.raw;
  seenCache = { raw, at };
  return raw;
}

async function readState(fresh: boolean) {
  if (!fresh && stateCache && Date.now() - stateCache.at < STATE_CACHE_MS) return stateCache.raw;
  if (!fresh && stateFlight) return stateFlight;
  const started = Date.now();
  const flight = redisCommand("GET", STATE_KEY).then((raw) => rememberState(raw, started));
  if (fresh) return flight;
  stateFlight = flight.finally(() => {
    stateFlight = null;
  });
  return stateFlight;
}

async function readSeen(fresh: boolean) {
  if (!fresh && seenCache && Date.now() - seenCache.at < STATE_CACHE_MS) return seenCache.raw;
  if (!fresh && seenFlight) return seenFlight;
  const started = Date.now();
  const flight = redisCommand("HGETALL", SEEN_KEY)
    .then((raw) => rememberSeen(raw, started))
    .catch(() => null);
  if (fresh) return flight;
  seenFlight = flight.finally(() => {
    seenFlight = null;
  });
  return seenFlight;
}

function stateAlreadyMigrated(raw: unknown) {
  if (typeof raw !== "string" || !raw) return false;
  try {
    const data = JSON.parse(raw) as { door?: { migrated?: boolean } };
    return data.door?.migrated === true;
  } catch {
    return false;
  }
}
const UNLOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

type RegisterInput = {
  name?: unknown;
  color?: unknown;
  emoji?: unknown;
  ownerKey?: unknown;
  token?: unknown;
  invite?: unknown;
  note?: unknown;
  ip?: unknown;
  seedId?: unknown;
  seedSecret?: unknown;
};
type RegisterResult = ReturnType<RoomEngine["register"]>;
type LookResult = ReturnType<RoomEngine["look"]>;
type LeaveResult = ReturnType<RoomEngine["leave"]>;
type AllowResult = ReturnType<RoomEngine["allow"]>;
type NoteResult = ReturnType<RoomEngine["postNote"]>;
type DogResult = ReturnType<RoomEngine["pokeDog"]>;
type TapResult = ReturnType<RoomEngine["viewerTap"]>;
type RadioResult = ReturnType<RoomEngine["controlRadio"]>;

const globalStore = globalThis as unknown as { __livingRoom?: RoomEngine; __livingRoomRedisWarned?: boolean };

function memoryEngine() {
  warnIfVercelHasNoRedis();
  if (!globalStore.__livingRoom) {
    globalStore.__livingRoom = new RoomEngine();
    globalStore.__livingRoom.start();
  }
  return globalStore.__livingRoom;
}

function warnIfVercelHasNoRedis() {
  if (!process.env.VERCEL || redisConfig() || globalStore.__livingRoomRedisWarned) return;
  globalStore.__livingRoomRedisWarned = true;
  console.warn(
    "Living Room is on Vercel without Redis, so each function instance has its own room. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL and KV_REST_API_TOKEN).",
  );
}

export function usesSharedStore() {
  return redisConfig() !== null;
}

function decodeState(raw: unknown): PersistedRoom | null {
  if (raw == null || raw === "") return null;
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!value || typeof value !== "object") throw new RoomUnavailable();
  return value as PersistedRoom;
}

function boot(raw: unknown) {
  const engine = new RoomEngine();
  const saved = decodeState(raw);
  if (saved) engine.hydrate(saved);
  return engine;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Writers retry the room lock with jitter, then give up. Look never uses this. The HTTP deadline stays 5s. */
const LOCK_WAIT_MS = 3500;
const SEEN_KEY = "living-room:seen";
const RATE_SCRIPT =
  'local n = redis.call("INCR", KEYS[1]) if n == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end local ttl = redis.call("PTTL", KEYS[1]) if ttl < 0 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end return {n, ttl}';

function seenStamps(raw: unknown): [string, number][] {
  if (!Array.isArray(raw)) return [];
  const stamps: [string, number][] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const at = Number(raw[i + 1]);
    if (typeof raw[i] === "string" && Number.isFinite(at)) stamps.push([raw[i], at]);
  }
  return stamps;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const token = randomBytes(16).toString("hex");
  let locked = false;
  const started = Date.now();
  try {
    let pause = 30;
    while (Date.now() - started < LOCK_WAIT_MS) {
      const result = await redisTimed(700, ["SET", LOCK_KEY, token, "NX", "PX", 4000]);
      if (result === "OK") {
        locked = true;
        break;
      }
      const remaining = LOCK_WAIT_MS - (Date.now() - started);
      if (remaining <= 0) break;
      const wait = Math.min(remaining, pause + Math.floor(Math.random() * pause));
      await delay(wait);
      pause = Math.min(Math.floor(pause * 1.8) + 10, 320);
    }
    if (!locked) throw new RoomUnavailable();
    return await fn();
  } catch (error) {
    if (error instanceof RoomUnavailable) throw error;
    if (error instanceof RedisError || error instanceof SyntaxError) throw new RoomUnavailable();
    throw error;
  } finally {
    if (locked) {
      try {
        await redisCommand("EVAL", UNLOCK_SCRIPT, "1", LOCK_KEY, token);
      } catch {
        /* the lock expires on its own */
      }
    }
  }
}

async function commit(engine: RoomEngine, before: string) {
  const after = JSON.stringify(engine.serialize());
  if (after !== before) {
    await redisCommand("SET", STATE_KEY, after);
    rememberState(after, Date.now());
  }
  return after;
}

class MemoryRoom {
  readonly shared = false as const;

  allow(key: string, limit: number, windowMs: number): AllowResult {
    return memoryEngine().allow(key, limit, windowMs);
  }

  register(input: RegisterInput): RegisterResult {
    return memoryEngine().register(input);
  }

  look(token: string): LookResult {
    return memoryEngine().look(token);
  }

  leave(token: string): LeaveResult {
    return memoryEngine().leave(token);
  }

  ownerLeave(ownerKey: string, block = false): LeaveResult {
    return memoryEngine().ownerLeave(ownerKey, block);
  }

  doorHold(token: string) {
    return memoryEngine().doorHold(token);
  }

  doorStatus(token: string) {
    return memoryEngine().doorStatus(token);
  }

  doorView(ownerKey: string) {
    return memoryEngine().doorView(ownerKey);
  }

  doorBrief(ownerKey: string) {
    return memoryEngine().doorBrief(ownerKey);
  }

  doorAct(ownerKey: string, action: string, id = "") {
    return memoryEngine().doorAct(ownerKey, action, id);
  }

  act(token: string, body: unknown): ActResult {
    return memoryEngine().act(token, body);
  }

  postNote(ownerKey: string, message: unknown): NoteResult {
    return memoryEngine().postNote(ownerKey, message);
  }

  pokeDog(): DogResult {
    return memoryEngine().pokeDog();
  }

  viewerTap(raw: unknown): TapResult {
    return memoryEngine().viewerTap(raw);
  }

  stationsStale(): boolean {
    return memoryEngine().stationsStale();
  }

  controlRadio(intent: "on" | "off" | "next", stations?: RadioStation[]): RadioResult {
    return memoryEngine().controlRadio(intent, stations);
  }

  books(): Book[] {
    return memoryEngine().books();
  }

  snapshot(): Snapshot {
    return memoryEngine().snapshot();
  }

  subscribe(listener: (snapshot: Snapshot) => void) {
    return memoryEngine().subscribe(listener);
  }
}

class SharedRoom {
  readonly shared = true as const;

  /** Current room plus lock-free presence stamps. Cached reads share one GET; writers pass fresh. */
  private async open(fresh = false) {
    const state = readState(fresh);
    const seen = readSeen(fresh);
    const [raw, stamps] = await Promise.all([state, seen]);
    const engine = boot(raw);
    engine.absorbSeen(seenStamps(stamps));
    return { engine, raw };
  }

  /** Serve a snapshot. Settle locally and do not write timers. Persist a first-time door migration once. */
  private async peek<T>(fn: (engine: RoomEngine) => T): Promise<T> {
    try {
      const { engine, raw } = await this.open(false);
      engine.settle();
      const value = fn(engine);
      if (!stateAlreadyMigrated(raw)) await this.saveDoorMigration();
      return value;
    } catch (error) {
      if (error instanceof RoomUnavailable) throw error;
      if (error instanceof RedisError || error instanceof SyntaxError) throw new RoomUnavailable();
      throw error;
    }
  }

  /** One locked write when v16 state has not been migrated yet. Later peeks read that save from the 1s cache. */
  private async saveDoorMigration() {
    await withLock(async () => {
      const { engine, raw } = await this.open(true);
      if (stateAlreadyMigrated(raw)) return;
      const before = JSON.stringify(engine.serialize());
      engine.settle();
      await commit(engine, before);
    });
  }

  private async read<T>(fn: (engine: RoomEngine) => T): Promise<T> {
    try {
      const { engine } = await this.open(false);
      const before = JSON.stringify(engine.serialize());
      engine.settle();
      if (JSON.stringify(engine.serialize()) === before) return fn(engine);
    } catch (error) {
      if (error instanceof RoomUnavailable) throw error;
      if (error instanceof RedisError || error instanceof SyntaxError) throw new RoomUnavailable();
      throw error;
    }
    return this.write(fn);
  }

  private async write<T>(fn: (engine: RoomEngine) => T): Promise<T> {
    const result = await withLock(async () => {
      const { engine } = await this.open(true);
      const before = JSON.stringify(engine.serialize());
      engine.settle();
      const value = fn(engine);
      await commit(engine, before);
      return value;
    });
    try {
      await flushMail();
    } catch {
      throw new RoomUnavailable();
    }
    return result;
  }

  allow(key: string, limit: number, windowMs: number) {
    return this.write((engine) => engine.allow(key, limit, windowMs));
  }

  async register(input: RegisterInput) {
    if (typeof input.ownerKey === "string") await loadOwner(input.ownerKey.trim());
    if (typeof input.token === "string") await loadToken(input.token.trim());
    return this.write((engine) => engine.register(input));
  }

  async look(token: string) {
    await loadToken(token);
    const result = await this.peek((engine) => engine.look(token));
    const id = result.ok && "you" in result ? result.you.id : "";
    if (id) {
      try {
        await redisCommand("HSET", SEEN_KEY, id, String(Date.now()));
      } catch {
        /* the next look stamps presence again */
      }
    }
    try {
      await flushMail();
    } catch {
      /* the next write flushes the mailbox again */
    }
    return result;
  }

  async leave(token: string) {
    await loadToken(token);
    return this.write((engine) => engine.leave(token));
  }

  async ownerLeave(ownerKey: string, block = false) {
    await loadOwner(ownerKey.trim());
    return this.write((engine) => engine.ownerLeave(ownerKey, block));
  }

  async doorHold(token: string) {
    return this.peek((engine) => engine.doorHold(token));
  }

  async doorStatus(token: string) {
    await loadToken(token);
    return this.read((engine) => engine.doorStatus(token));
  }

  async doorView(ownerKey: string) {
    return this.peek((engine) => engine.doorView(ownerKey));
  }

  async doorBrief(ownerKey: string) {
    return this.peek((engine) => engine.doorBrief(ownerKey));
  }

  async doorAct(ownerKey: string, action: string, id = "") {
    await loadOwner(ownerKey.trim());
    return this.write((engine) => engine.doorAct(ownerKey, action, id));
  }

  async act(token: string, body: unknown) {
    await loadToken(token);
    return this.write((engine) => engine.act(token, body));
  }

  /** Hold, rate limit, and act share the write's single state read. The door does not GET again. */
  async actLocked(token: string, body: unknown, opts?: unknown) {
    void opts;
    await loadToken(token);
    return this.write((engine) => {
      const held = engine.doorHold(token);
      if (held) return { type: "held" as const, held };
      const limit = engine.allow(`act:${token.slice(0, 12)}`, 30, 60_000);
      if (!limit.ok) return { type: "limit" as const, retryAfter: limit.retryAfter };
      return { type: "act" as const, result: engine.act(token, body) };
    });
  }

  async postNote(ownerKey: string, message: unknown) {
    await loadOwner(ownerKey.trim());
    return this.write((engine) => engine.postNote(ownerKey, message));
  }

  pokeDog() {
    return this.write((engine) => engine.pokeDog());
  }

  viewerTap(raw: unknown) {
    return this.write((engine) => engine.viewerTap(raw));
  }

  stationsStale() {
    return this.read((engine) => engine.stationsStale());
  }

  controlRadio(intent: "on" | "off" | "next", stations?: RadioStation[]) {
    return this.write((engine) => engine.controlRadio(intent, stations));
  }

  books() {
    return this.read((engine) => engine.books());
  }

  snapshot() {
    return this.peek((engine) => engine.snapshot());
  }

  subscribe(listener: (snapshot: Snapshot) => void) {
    void listener;
    return () => {};
  }
}

export type RoomPort = MemoryRoom | SharedRoom | VersionedRoom;

let sharedRoom: SharedRoom | null = null;
let memoryRoom: MemoryRoom | null = null;
let versionedRoom: VersionedRoom | null = null;

/** Look's rate limit. Redis uses a counter. Supabase uses rate_hit. Neither takes the room write. */
export async function allowFast(engine: RoomPort, key: string, limit: number, windowMs: number): Promise<AllowResult> {
  if (!engine.shared) return engine.allow(key, limit, windowMs);
  if (engine instanceof VersionedRoom) return engine.fastAllow(key, limit, windowMs);
  try {
    const raw = await redisCommand("EVAL", RATE_SCRIPT, "1", `living-room:rate:${key}`, String(windowMs));
    const pair = Array.isArray(raw) ? raw : [1, windowMs];
    const count = Number(pair[0]);
    const ttl = Number(pair[1]);
    if (Number.isFinite(count) && count > limit) {
      const wait = Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs;
      return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

/** Act path used by the route: one state read on Redis, door check included. */
export async function actGuarded(engine: RoomPort, token: string, body: unknown, opts: ActOpts = {}) {
  if (!engine.shared) {
    const held = await engine.doorHold(token);
    if (held) return { type: "held" as const, held };
    const limit = await engine.allow(`act:${token.slice(0, 12)}`, 30, 60_000);
    if (!limit.ok) return { type: "limit" as const, retryAfter: limit.retryAfter };
    return { type: "act" as const, result: await engine.act(token, body) };
  }
  return engine.actLocked(token, body, opts);
}

export type ActOpts = { idemKey?: string; deadlineAt?: number };

let storeLogged = false;

function logStore(kind: "supabase" | "redis" | "memory" | "offline") {
  if (storeLogged) return;
  storeLogged = true;
  console.log(`[room] store=${kind}`);
}

function vercelDeploy() {
  const env = process.env.VERCEL_ENV;
  return env === "production" || env === "preview";
}

export function getEngine(): RoomPort {
  // v19: ROOM_STORE=memory keeps a deploy (the private preview) off the shared live room row.
  // Same compare-and-set engine as production, over an in-process store.
  // v19: a preview never touches the live room unless it names a test namespace
  // (ROOM_RPC_PREFIX) or explicitly opts in with ROOM_STORE=live. Production is unaffected.
  const previewOffLive =
    process.env.VERCEL_ENV === "preview" && !roomRpcPrefix() && process.env.ROOM_STORE !== "live";
  if (process.env.ROOM_STORE === "memory" || previewOffLive) {
    logStore("memory");
    versionedRoom ??= new VersionedRoom(new MemoryPersist());
    return versionedRoom;
  }
  if (supabaseConfig()) {
    // v21: rooms are per apartment. Routes resolve the apartment first (lib/apartments/resolve.ts roomFor).
    throw new Error("v21: use roomFor(apartmentId); there is no single shared room.");
  }
  if (usesSharedStore()) {
    logStore("redis");
    sharedRoom ??= new SharedRoom();
    return sharedRoom;
  }
  if (vercelDeploy()) {
    logStore("offline");
    throw new RoomOffline();
  }
  logStore("memory");
  memoryRoom ??= new MemoryRoom();
  return memoryRoom;
}

export function roomFailure(error: unknown) {
  if (error instanceof OwnerSecretMissing) {
    // r2: fail closed. The log line is written once per instance by lib/apartments/identity.ts.
    return json({ ok: false, code: "server_misconfigured", error: "Accounts aren't set up on this server yet. Try again later." }, 503);
  }
  if (error instanceof RoomOffline) {
    return json({ ok: false, error: "room offline", retry: true }, 503, { "Retry-After": "2" });
  }
  if (error instanceof RoomUnavailable || error instanceof RoomBusy) {
    return json({ ok: false, error: error.message, retry: true }, 503, { "Retry-After": "2" });
  }
  return null;
}

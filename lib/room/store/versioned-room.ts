import { RoomEngine, type PersistedRoom } from "@/lib/room/engine";
import { createHash } from "node:crypto";
import { RoomBusy, RoomUnavailable } from "@/lib/room/errors";
import {
  ackMail,
  dirtyMailChanges,
  hydrateMail,
  peekOwner,
  resetMailStore,
  touchBox,
  withMailStore,
  type Mailbox,
} from "@/lib/room/mailbox";
import type { ActResult, Book, RadioStation, Snapshot } from "@/lib/room/types";
import { bindStore } from "@/lib/room/store/active";
import { applySeedBooks } from "@/lib/room/store/seed";
import { mailWrite } from "@/lib/room/store/supabase-store";
import { retryPause, sleep, type RoomPersistence, type RoomRead } from "@/lib/room/store/persist";

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

type MailChange = { ownerKey: string; data: Mailbox; dropTokens: string[] };

const CACHE_MS = 1000;
const ATTEMPTS = 4;
/** v19: don't start a compare-and-set attempt with less than this left before the route deadline. */
const MIN_ATTEMPT_MS = 900;
/** v19: presence is only re-stamped when the stored stamp is older than this. */
const PRESENCE_FRESH_MS = 20_000;
/** v19: per-agent burst limit on acts, checked before any state read. */
const BURST_LIMIT = 4;
const BURST_WINDOW_MS = 2000;
const IDEM_MAX_BYTES = 8 * 1024;

type Idem = { key: string; bodyHash: string };

/** Stored idempotent result: resultJson (exact bytes) or the older parsed result. */
function idemResult(raw: unknown): unknown {
  const r = raw as { resultJson?: unknown; result?: unknown } | null;
  if (typeof r?.resultJson === "string") {
    try { return JSON.parse(r.resultJson); } catch { return null; }
  }
  return r?.result ?? null;
}
type MutateOpts<T> = { deadlineAt?: number; idem?: Idem | null; idemOf?: (value: T) => { response: unknown; status: number } | null };

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

type Cache = { version: number; raw: string | null; seen: RoomRead["seen"]; at: number };

function stateAlreadyMigrated(raw: string | null) {
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as { door?: { migrated?: boolean } };
    return data.door?.migrated === true;
  } catch {
    return false;
  }
}

function doorOf(json: string) {
  try {
    const data = JSON.parse(json) as { door?: { locked?: boolean; knocks?: unknown[] } };
    return {
      locked: data.door?.locked !== false,
      knocking: Array.isArray(data.door?.knocks) && data.door.knocks.length > 0,
    };
  } catch {
    return { locked: true, knocking: false };
  }
}

function knockOwnerKey(raw: string | null, id: string) {
  if (!raw || !id) return "";
  try {
    const data = JSON.parse(raw) as { door?: { knocks?: { id?: string; ownerKey?: string }[] } };
    const knock = data.door?.knocks?.find((item) => item.id === id);
    return typeof knock?.ownerKey === "string" ? knock.ownerKey : "";
  } catch {
    return "";
  }
}

function agentIds(json: string) {
  try {
    const data = JSON.parse(json) as { agents?: { id?: string }[] };
    return (data.agents ?? []).map((agent) => agent.id).filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

/**
 * Room port over compare-and-set. Replaces the Redis lock.
 * Peeks keep the v16.1 one-second cache and do not write timer ticks.
 * The first read of an empty room commits the Poppy and Tester seed once.
 * Each request has its own mailbox, so overlapping notes cannot ack each other.
 */
export class VersionedRoom {
  readonly shared = true as const;
  private cache: Cache | null = null;

  constructor(private readonly store: RoomPersistence) {
    bindStore(store);
  }

  private open(snap: { raw: string | null; seen: RoomRead["seen"] }) {
    const engine = new RoomEngine();
    if (snap.raw) {
      const saved = JSON.parse(snap.raw) as PersistedRoom;
      engine.hydrate(saved);
    } else applySeedBooks(engine);
    engine.absorbSeen(snap.seen);
    return engine;
  }

  private take(snap: RoomRead): Cache {
    // Version 0 means the row is gone (a test reset): start fresh instead of keeping a stale cache.
    if (this.cache && snap.version < this.cache.version && snap.version > 0) {
      this.cache = { ...this.cache, at: Date.now() };
      return this.cache;
    }
    if (snap.unchanged && this.cache) {
      this.cache = { ...this.cache, version: snap.version, seen: snap.seen, at: Date.now() };
      return this.cache;
    }
    this.cache = { version: snap.version, raw: snap.raw, seen: snap.seen, at: Date.now() };
    return this.cache;
  }

  private async readCached(): Promise<Cache> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    return this.take(await this.store.read(this.cache?.version ?? null));
  }

  private async readFresh(): Promise<Cache> {
    return this.take(await this.store.read(this.cache?.version ?? null));
  }

  private remember(raw: string, version: number, seen: RoomRead["seen"]) {
    if (this.cache && version < this.cache.version) return;
    this.cache = { version, raw, seen, at: Date.now() };
  }

  /** Stamp this agent in the cache so a 1s peek still sees a look that just touched presence. */
  private noteSeen(agentId: string, at: number) {
    if (!this.cache) return;
    const seen = this.cache.seen.filter(([id]) => id !== agentId);
    seen.push([agentId, at]);
    this.cache = { ...this.cache, seen, at: Date.now() };
  }

  private async commitEngine(
    engine: RoomEngine,
    expectedVersion: number,
    seen: RoomRead["seen"],
    sent: MailChange[],
    roomChanged: boolean,
    idem: { key: string; response: unknown; status: number } | null = null,
  ): Promise<boolean | { replay: unknown; status: number }> {
    const stateJson = JSON.stringify(engine.serialize());
    const result = await this.store.commit({
      expectedVersion,
      stateJson,
      publicDoor: doorOf(stateJson),
      mail: sent.map(mailWrite),
      agentIds: agentIds(stateJson),
      roomChanged,
      idem,
    });
    if (result.conflict) return false;
    if (result.idempotent) return { replay: result.response, status: Number(result.status ?? 200) };
    ackMail(sent.map((change) => change.ownerKey));
    const raw = roomChanged ? stateJson : (this.cache?.raw ?? stateJson);
    this.remember(raw, result.version, seen);
    return true;
  }

  /** Settle locally. Commit only the first door migration, not idle timers. */
  private async peek<T>(fn: (engine: RoomEngine) => T): Promise<T> {
    const snap = await this.readCached();
    const engine = this.open(snap);
    const migrated = stateAlreadyMigrated(snap.raw);
    engine.settle();
    const value = fn(engine);
    if (migrated) return value;
    const sent = dirtyMailChanges();
    const ok = await this.commitEngine(engine, snap.version, snap.seen, sent, true);
    if (ok) return value;
    this.cache = null;
    const again = await this.readFresh();
    const next = this.open(again);
    next.settle();
    return fn(next);
  }

  private async mutate<T>(fn: (engine: RoomEngine) => T, prepare?: () => Promise<void>, opts: MutateOpts<T> = {}): Promise<T> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      // v19: deadline-aware. Answer 503 before committing rather than commit after the caller gave up.
      if (opts.deadlineAt && Date.now() > opts.deadlineAt - MIN_ATTEMPT_MS) {
        resetMailStore();
        throw new RoomBusy();
      }
      if (attempt > 0) resetMailStore();
      if (prepare) await prepare();
      const snap = await this.readFresh();
      const engine = this.open(snap);
      engine.settle();
      const before = JSON.stringify(engine.serialize());
      let value: T;
      try {
        value = fn(engine);
      } catch (error) {
        resetMailStore();
        throw error;
      }
      const after = JSON.stringify(engine.serialize());
      const sent = dirtyMailChanges();
      if (after === before && sent.length === 0) return value;
      try {
        let idem: { key: string; response: unknown; status: number } | null = null;
        if (opts.idem && opts.idemOf) {
          const stored = opts.idemOf(value);
          if (stored) {
            // Stored as a JSON string: jsonb reorders keys, and a replay must be byte-identical.
            const response = { bodyHash: opts.idem.bodyHash, resultJson: JSON.stringify(stored.response) };
            if (JSON.stringify(response).length <= IDEM_MAX_BYTES) idem = { key: opts.idem.key, response, status: stored.status };
          }
        }
        const ok = await this.commitEngine(engine, snap.version, snap.seen, sent, after !== before, idem);
        if (ok && typeof ok === "object") {
          return (idemResult(ok.replay) ?? value) as T;
        }
        if (ok) return value;
      } catch (error) {
        resetMailStore();
        throw error;
      }
      this.cache = null;
      if (attempt < ATTEMPTS - 1) await sleep(retryPause(attempt));
    }
    throw new RoomUnavailable();
  }

  private inMail<T>(fn: () => Promise<T>): Promise<T> {
    return withMailStore(fn);
  }

  private async pullOwner(ownerKey: string) {
    const box = await this.store.loadOwner(ownerKey);
    if (box) hydrateMail(box);
    return box;
  }

  private async pullToken(token: string) {
    const box = await this.store.loadToken(token);
    if (box) hydrateMail(box);
    return box;
  }

  private async touch(agentId: string) {
    const at = Date.now();
    try {
      await this.store.touchPresence(agentId, at);
    } catch {
      return;
    }
    this.noteSeen(agentId, at);
  }

  async fastAllow(key: string, limit: number, windowMs: number) {
    const hit = await this.store.rateHit(key, limit, windowMs);
    if (!hit.limited) return { ok: true as const, retryAfter: 0 };
    return { ok: false as const, retryAfter: Math.max(1, Math.ceil(hit.retryAfterMs / 1000)) };
  }

  allow(key: string, limit: number, windowMs: number) {
    return this.fastAllow(key, limit, windowMs);
  }

  register(input: RegisterInput) {
    const prepare = async () => {
      if (typeof input.ownerKey === "string" && input.ownerKey.trim()) await this.pullOwner(input.ownerKey.trim());
      if (typeof input.token === "string" && input.token.trim()) await this.pullToken(input.token.trim());
    };
    return this.inMail(() => this.mutate((engine) => engine.register(input), prepare));
  }

  /** v19: skip the presence write when this instance already saw a stamp under 20 s old. */
  private seenFresh(agentId: string) {
    const stamp = this.cache?.seen.find(([id]) => id === agentId)?.[1] ?? 0;
    return Date.now() - stamp < PRESENCE_FRESH_MS;
  }

  async look(token: string) {
    return this.inMail(async () => {
      const box = await this.pullToken(token);
      if (box?.agentId && !this.seenFresh(box.agentId)) await this.touch(box.agentId);
      const result = await this.peek((engine) => engine.look(token));
      const id = result.ok && "you" in result ? result.you.id : "";
      if (id && id !== box?.agentId && !this.seenFresh(id)) await this.touch(id);
      if (dirtyMailChanges().length) await this.mutate((engine) => engine);
      return result;
    });
  }

  leave(token: string) {
    return this.inMail(() => this.mutate((engine) => engine.leave(token), () => this.pullToken(token).then(() => undefined)));
  }

  ownerLeave(ownerKey: string, block = false) {
    const key = ownerKey.trim();
    return this.inMail(() => this.mutate((engine) => engine.ownerLeave(key, block), async () => {
      await this.pullOwner(key);
    }));
  }

  doorHold(token: string) {
    return this.inMail(() => this.peek((engine) => engine.doorHold(token)));
  }

  doorStatus(token: string) {
    return this.inMail(() => this.mutate((engine) => engine.doorStatus(token), () => this.pullToken(token).then(() => undefined)));
  }

  doorView(ownerKey: string) {
    return this.inMail(() => this.peek((engine) => engine.doorView(ownerKey)));
  }

  doorBrief(ownerKey: string) {
    return this.inMail(() => this.peek((engine) => engine.doorBrief(ownerKey)));
  }

  doorAct(ownerKey: string, action: string, id = "") {
    const key = ownerKey.trim();
    return this.inMail(() =>
      this.mutate((engine) => engine.doorAct(key, action, id), async () => {
        await this.pullOwner(key);
        if ((action !== "admit" && action !== "trust") || !id) return;
        const snap = await this.store.read(this.cache?.version ?? null);
        const raw = snap.unchanged ? (this.cache?.raw ?? null) : snap.raw;
        const knocker = knockOwnerKey(raw, id);
        if (knocker) await this.pullOwner(knocker);
      }),
    );
  }

  /** Owner note page. Loads the mailbox from this store, refreshes it, and saves that read. */
  async ownerNotes(ownerKey: string) {
    const key = ownerKey.trim();
    return this.inMail(async () => {
      if (!(await this.store.loadOwner(key))) return null;
      return this.mutate(
        () => {
          touchBox(key);
          return peekOwner(key);
        },
        async () => {
          const box = await this.store.loadOwner(key);
          if (box) hydrateMail(box);
        },
      );
    });
  }

  act(token: string, body: unknown, opts: { deadlineAt?: number; idem?: Idem | null } = {}): Promise<ActResult> {
    return this.inMail(() =>
      this.mutate((engine) => engine.act(token, body), () => this.pullToken(token).then(() => undefined), {
        deadlineAt: opts.deadlineAt,
        idem: opts.idem,
        idemOf: (value) => ({ response: value, status: value.ok ? 200 : value.status }),
      }),
    );
  }

  /**
   * v19: replay a stored Idempotency-Key first, then a cheap per-agent burst limit (no state read),
   * then hold, the minute limit, and one deadline-aware compare-and-set.
   */
  async actLocked(token: string, body: unknown, opts: { idemKey?: string; deadlineAt?: number } = {}) {
    return this.inMail(async () => {
      const tokenHash = sha(token);
      let idem: Idem | null = null;
      if (opts.idemKey) {
        idem = { key: sha(`${tokenHash}:${opts.idemKey}`), bodyHash: sha(JSON.stringify(body ?? null)) };
        const hit = this.store.idemGet ? await this.store.idemGet(idem.key) : null;
        if (hit) {
          const stored = hit.response as { bodyHash?: string } | null;
          if (stored?.bodyHash && stored.bodyHash !== idem.bodyHash) return { type: "idem_mismatch" as const };
          const replayed = idemResult(hit.response) as ActResult | null;
          if (replayed) return { type: "act" as const, result: replayed, replayed: true };
        }
      }
      const burst = await this.fastAllow(`act-burst:${tokenHash.slice(0, 24)}`, BURST_LIMIT, BURST_WINDOW_MS);
      if (!burst.ok) return { type: "slow_down" as const, retryAfter: 1 };
      await this.pullToken(token);
      const held = await this.peek((engine) => engine.doorHold(token));
      if (held) return { type: "held" as const, held };
      const limit = await this.fastAllow(`act:${token.slice(0, 12)}`, 30, 60_000);
      if (!limit.ok) return { type: "limit" as const, retryAfter: limit.retryAfter };
      const result = await this.act(token, body, { deadlineAt: opts.deadlineAt, idem });
      return { type: "act" as const, result };
    });
  }

  postNote(ownerKey: string, message: unknown) {
    const key = ownerKey.trim();
    return this.inMail(() => this.mutate((engine) => engine.postNote(key, message), async () => {
      await this.pullOwner(key);
    }));
  }

  pokeDog() {
    return this.inMail(() => this.mutate((engine) => engine.pokeDog()));
  }

  viewerTap(raw: unknown) {
    return this.inMail(() => this.mutate((engine) => engine.viewerTap(raw)));
  }

  stationsStale() {
    return this.inMail(() => this.peek((engine) => engine.stationsStale()));
  }

  controlRadio(intent: "on" | "off" | "next", stations?: RadioStation[]) {
    return this.inMail(() => this.mutate((engine) => engine.controlRadio(intent, stations)));
  }

  books(): Promise<Book[]> {
    return this.inMail(() => this.peek((engine) => engine.books()));
  }

  snapshot(): Promise<Snapshot> {
    return this.inMail(() => this.peek((engine) => engine.snapshot()));
  }

  subscribe(listener: (snapshot: Snapshot) => void) {
    void listener;
    return () => {};
  }
}

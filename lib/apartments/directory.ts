import { createHash, randomBytes } from "node:crypto";
import type { RoomPersistence } from "@/lib/room/store/persist";
import { encodeState } from "@/lib/room/store/codec";
import { MemoryPersist, type MemoryIndex } from "@/lib/room/store/memory-persist";
import { SupabaseStore, envRpc, type Rpc } from "@/lib/room/store/supabase-store";
import { roomRpcPrefix } from "@/lib/room/store/config";
import { bindStore } from "@/lib/room/store/active";
import type { InviteChanges } from "@/lib/room/store/persist";

/**
 * v21: apartments. One per account (unique owner_id in the database), plus the legacy (pre-v21) room
 * that the first verified sign-in with LEGACY_OWNER_EMAIL claims. Supabase (schema per ROOM_RPC_PREFIX)
 * in deploys; an in-process stand-in for local runs (ROOM_STORE=memory).
 */
export type Apartment = { id: string; kind: "private" | "shared"; legacy: boolean };
export type WatchRedeem = { ok: true; apartmentId: string; expiresMs: number } | { ok: false; code: string };

export interface Directory {
  readonly kind: "supabase" | "memory";
  /** The global (nil-apartment) store: news kv cache and global rate limits. */
  globalStore(): RoomPersistence;
  storeFor(apartmentId: string): RoomPersistence;
  forUser(userId: string): Promise<Apartment | null>;
  create(userId: string, stateJson: string, door: { locked: boolean; knocking: boolean }): Promise<{ id: string; created: boolean }>;
  claimLegacy(userId: string): Promise<Apartment | null>;
  inviteApartment(hash: string): Promise<string | null>;
  agentApartment(tokenHash: string, ownerKey: string): Promise<string | null>;
  /** Global (not per-apartment) rate limits: signups, apartment creation, per-IP door limits. */
  globalHit(key: string, limit: number, windowMs: number): Promise<{ limited: boolean; retryAfterMs: number }>;
  watchMint(apartmentId: string, hash: string, expMs: number, maxUnused: number): Promise<void>;
  watchRedeem(hash: string, sessionHash: string, sessionMs: number): Promise<WatchRedeem>;
  watchSession(sessionHash: string): Promise<string | null>;
  watchRevoke(apartmentId: string, sessions: boolean): Promise<{ codes: number; sessions: number }>;
}

export const GLOBAL_SCOPE = "00000000-0000-0000-0000-000000000000";

function asApartment(raw: unknown): Apartment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { id?: unknown; kind?: unknown; legacy?: unknown };
  if (typeof r.id !== "string" || !r.id) return null;
  return { id: r.id, kind: r.kind === "shared" ? "shared" : "private", legacy: r.legacy === true };
}

class SupabaseDirectory implements Directory {
  readonly kind = "supabase" as const;
  private stores = new Map<string, SupabaseStore>();
  private global: SupabaseStore;
  constructor(private readonly rpc: Rpc) {
    this.global = new SupabaseStore(rpc, GLOBAL_SCOPE);
  }
  globalStore() {
    return this.global;
  }
  storeFor(apartmentId: string) {
    let store = this.stores.get(apartmentId);
    if (!store) {
      store = new SupabaseStore(this.rpc, apartmentId);
      this.stores.set(apartmentId, store);
      if (this.stores.size > 500) this.stores.delete(this.stores.keys().next().value!);
    }
    return store;
  }
  async forUser(userId: string) {
    return asApartment(await this.rpc("for_user", { p_user: userId }));
  }
  async create(userId: string, stateJson: string, door: { locked: boolean; knocking: boolean }) {
    const raw = (await this.rpc("create", { p_user: userId, p_state: encodeState(stateJson), p_public_door: door })) as { id?: string; created?: boolean };
    return { id: String(raw?.id ?? ""), created: raw?.created === true };
  }
  async claimLegacy(userId: string) {
    return asApartment(await this.rpc("claim_legacy", { p_user: userId }));
  }
  async inviteApartment(hash: string) {
    const raw = await this.rpc("invite_lookup", { p_hash: hash });
    return typeof raw === "string" && raw ? raw : null;
  }
  async agentApartment(tokenHash: string, ownerKey: string) {
    const raw = await this.rpc("agent_lookup", { p_token_hash: tokenHash || null, p_owner_key: ownerKey || null });
    return typeof raw === "string" && raw ? raw : null;
  }
  globalHit(key: string, limit: number, windowMs: number) {
    return this.global.rateHit(key, limit, windowMs);
  }
  async watchMint(apartmentId: string, hash: string, expMs: number, maxUnused: number) {
    await this.rpc("watch_mint", { p_apartment: apartmentId, p_hash: hash, p_exp_ms: expMs, p_max_unused: maxUnused });
  }
  async watchRedeem(hash: string, sessionHash: string, sessionMs: number): Promise<WatchRedeem> {
    const raw = (await this.rpc("watch_redeem", { p_hash: hash, p_session_hash: sessionHash, p_session_ms: sessionMs })) as {
      ok?: boolean;
      code?: string;
      apartment?: string;
      expires_ms?: number;
    };
    if (raw?.ok && typeof raw.apartment === "string") return { ok: true, apartmentId: raw.apartment, expiresMs: Number(raw.expires_ms) || 0 };
    return { ok: false, code: typeof raw?.code === "string" ? raw.code : "watch_invalid" };
  }
  async watchSession(sessionHash: string) {
    const raw = await this.rpc("watch_session", { p_session_hash: sessionHash });
    return typeof raw === "string" && raw ? raw : null;
  }
  async watchRevoke(apartmentId: string, sessions: boolean) {
    const raw = (await this.rpc("watch_revoke", { p_apartment: apartmentId, p_sessions: sessions })) as { codes?: number; sessions?: number };
    return { codes: Number(raw?.codes ?? 0), sessions: Number(raw?.sessions ?? 0) };
  }
}

type MemApt = Apartment & { ownerId: string | null };
type MemCode = { apartmentId: string; at: number; exp: number; used: number; cancelled: number };

/** Local stand-in for the SQL functions (same rules: one apartment per user, single-use codes, hash only). */
export class MemoryDirectory implements Directory, MemoryIndex {
  readonly kind = "memory" as const;
  apartments = new Map<string, MemApt>();
  stores = new Map<string, MemoryPersist>();
  tokens = new Map<string, string>();
  ownerKeys = new Map<string, string>();
  invites = new Map<string, MemCode>();
  watchCodes = new Map<string, MemCode>();
  watchSessions = new Map<string, { apartmentId: string; exp: number }>();
  private global = new MemoryPersist(GLOBAL_SCOPE, null);
  globalStore() {
    return this.global;
  }

  storeFor(apartmentId: string) {
    let store = this.stores.get(apartmentId);
    if (!store) {
      store = new MemoryPersist(apartmentId, this);
      this.stores.set(apartmentId, store);
    }
    return store;
  }
  noteToken(hash: string, apartmentId: string) {
    if (!this.tokens.has(hash)) this.tokens.set(hash, apartmentId);
  }
  dropToken(hash: string) {
    this.tokens.delete(hash);
  }
  noteOwnerKey(ownerKey: string, apartmentId: string) {
    const known = this.ownerKeys.get(ownerKey);
    if (known && known !== apartmentId) throw new Error("ownerKey belongs to another apartment");
    this.ownerKeys.set(ownerKey, apartmentId);
  }
  noteInvites(changes: InviteChanges, apartmentId: string) {
    const now = Date.now();
    for (const item of changes.add) if (!this.invites.has(item.hash)) this.invites.set(item.hash, { apartmentId, at: now, exp: item.expMs, used: 0, cancelled: 0 });
    for (const hash of changes.use) {
      const row = this.invites.get(hash);
      if (row && row.apartmentId === apartmentId && !row.used) row.used = now;
    }
    for (const hash of changes.cancel) {
      const row = this.invites.get(hash);
      if (row && row.apartmentId === apartmentId && !row.cancelled) row.cancelled = now;
    }
  }
  async forUser(userId: string) {
    for (const apt of this.apartments.values()) if (apt.ownerId === userId) return { id: apt.id, kind: apt.kind, legacy: apt.legacy };
    return null;
  }
  async create(userId: string, stateJson: string, door: { locked: boolean; knocking: boolean }) {
    const existing = await this.forUser(userId);
    if (existing) return { id: existing.id, created: false };
    const id = cryptoUuid();
    this.apartments.set(id, { id, kind: "private", legacy: false, ownerId: userId });
    const store = this.storeFor(id);
    store.version = 1;
    store.state = stateJson;
    store.door = door;
    return { id, created: true };
  }
  async claimLegacy(userId: string) {
    if (await this.forUser(userId)) return null;
    for (const apt of this.apartments.values()) {
      if (apt.legacy && apt.ownerId === null) {
        apt.ownerId = userId;
        return { id: apt.id, kind: apt.kind, legacy: true };
      }
    }
    return null;
  }
  /** Test/local helper: add an unclaimed legacy apartment with a saved room. */
  addLegacy(stateJson: string | null) {
    const id = cryptoUuid();
    this.apartments.set(id, { id, kind: "private", legacy: true, ownerId: null });
    if (stateJson) {
      const store = this.storeFor(id);
      store.version = 1;
      store.state = stateJson;
    }
    return id;
  }
  async inviteApartment(hash: string) {
    return this.invites.get(hash)?.apartmentId ?? null;
  }
  async agentApartment(tokenHash: string, ownerKey: string) {
    return (tokenHash && this.tokens.get(tokenHash)) || (ownerKey && this.ownerKeys.get(ownerKey)) || null;
  }
  globalHit(key: string, limit: number, windowMs: number) {
    return this.global.rateHit(key, limit, windowMs);
  }
  async watchMint(apartmentId: string, hash: string, expMs: number, maxUnused: number) {
    const now = Date.now();
    const live = [...this.watchCodes.values()].filter((c) => c.apartmentId === apartmentId && !c.used && !c.cancelled && c.exp > now).sort((a, b) => b.at - a.at);
    for (const code of live.slice(Math.max(maxUnused - 1, 0))) code.cancelled = now;
    this.watchCodes.set(hash, { apartmentId, at: now, exp: expMs, used: 0, cancelled: 0 });
  }
  async watchRedeem(hash: string, sessionHash: string, sessionMs: number): Promise<WatchRedeem> {
    const row = this.watchCodes.get(hash);
    const now = Date.now();
    if (!row) return { ok: false, code: "watch_invalid" };
    if (row.cancelled) return { ok: false, code: "watch_cancelled" };
    if (row.used) return { ok: false, code: "watch_used" };
    if (row.exp <= now) return { ok: false, code: "watch_expired" };
    row.used = now;
    const exp = now + Math.max(sessionMs, 1000);
    this.watchSessions.set(sessionHash, { apartmentId: row.apartmentId, exp });
    return { ok: true, apartmentId: row.apartmentId, expiresMs: exp };
  }
  async watchSession(sessionHash: string) {
    const row = this.watchSessions.get(sessionHash);
    return row && row.exp > Date.now() ? row.apartmentId : null;
  }
  async watchRevoke(apartmentId: string, sessions: boolean) {
    let codes = 0;
    let ended = 0;
    for (const code of this.watchCodes.values()) {
      if (code.apartmentId === apartmentId && !code.used && !code.cancelled) {
        code.cancelled = Date.now();
        codes += 1;
      }
    }
    if (sessions) {
      for (const [hash, row] of this.watchSessions) {
        if (row.apartmentId === apartmentId) {
          this.watchSessions.delete(hash);
          ended += 1;
        }
      }
    }
    return { codes, sessions: ended };
  }
}

function cryptoUuid() {
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function sha256hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const holder = globalThis as unknown as { __lrDirectory?: Directory };

/** Supabase when configured (deploys); memory for ROOM_STORE=memory or no Supabase config (local only). */
export function directory(): Directory {
  if (holder.__lrDirectory) return holder.__lrDirectory;
  // v19 rule kept: a preview never touches the live tables unless it names a test namespace (ROOM_RPC_PREFIX).
  // v21: same for a local run (no VERCEL_ENV): only production uses the unprefixed (live) apartment functions by default.
  const previewOffLive = process.env.VERCEL_ENV !== "production" && !roomRpcPrefix() && process.env.ROOM_STORE !== "live";
  const rpc = process.env.ROOM_STORE === "memory" || previewOffLive ? null : envRpc();
  if (rpc) holder.__lrDirectory = new SupabaseDirectory(rpc);
  else {
    if (process.env.VERCEL_ENV === "production") throw new Error("Supabase is required in production.");
    holder.__lrDirectory = new MemoryDirectory();
  }
  bindStore(holder.__lrDirectory.globalStore());
  return holder.__lrDirectory;
}

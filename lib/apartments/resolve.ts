import { randomBytes } from "node:crypto";
import { clientIp, cookieValue, json, ownerJson } from "@/lib/http";
import { RoomEngine } from "@/lib/room/engine";
import { applySeedBooks } from "@/lib/room/store/seed";
import { VersionedRoom } from "@/lib/room/store/versioned-room";
import { hashToken } from "@/lib/room/store/codec";
import { inviteHash, newInviteCode, sha256 } from "@/lib/room/door";
import { INVITE_TTL_MS } from "@/lib/room/invite-ttl";
import { directory, type Apartment } from "./directory";
import { currentAccount, type Account } from "./auth";
import { accountIdentity, ownerSecret } from "./identity";
import { WATCH_ENDED_COPY, WATCH_EXPIRED_COPY } from "./copy";
import { LIMITS, retryAfterSeconds, type Limit } from "./limits";

/**
 * v21 request -> apartment resolution. Every room route goes through one of these, so a request can only
 * ever reach the apartment its credential names:
 *   owner   : verified Supabase session -> apartments.owner_id (unique) -> that apartment
 *   watcher : __Host-lr_watch session cookie -> watch_sessions -> that apartment (read-only)
 *   agent   : bearer token / own_ key -> agent_tokens / mailboxes -> that apartment
 *   register: invite code -> invites (hash) -> the apartment that minted it
 */
const rooms = new Map<string, VersionedRoom>();

export function roomFor(apartmentId: string): VersionedRoom {
  if (!/^[0-9a-f-]{36}$/.test(apartmentId)) throw new Error("bad apartment id");
  let room = rooms.get(apartmentId);
  if (!room) {
    room = new VersionedRoom(directory().storeFor(apartmentId));
    rooms.set(apartmentId, room);
    if (rooms.size > 500) rooms.delete(rooms.keys().next().value!);
  }
  return room;
}

export function ipKey(req: Request) {
  return sha256(`${process.env.IP_SALT ?? "lr-ip"}|${clientIp(req) || "local"}`).slice(0, 16);
}

/** A global (cross-apartment) limit. Returns the 429 to send, or null when allowed. */
export async function limited(key: string, rule: Limit, message = "Too many requests. Wait a moment and try again.", code = "rate_limited") {
  const hit = await directory().globalHit(key, rule.limit, rule.windowMs);
  if (!hit.limited) return null;
  return json({ ok: false, code, error: message }, 429, { "Retry-After": retryAfterSeconds(hit.retryAfterMs) });
}

function legacyEmail() {
  return (process.env.LEGACY_OWNER_EMAIL || "").trim().toLowerCase();
}

/** A new apartment's first room: the account is the owner, no legacy seed agents. */
export function freshApartmentState(identity: string) {
  const engine = new RoomEngine();
  applySeedBooks(engine);
  engine.setOwnerIdentity(identity, { seeds: false });
  return JSON.stringify(engine.serialize());
}

export type Provisioned = { apartment: Apartment; created: boolean; claimedLegacy: boolean };

/**
 * r2 (Performance): the user -> apartment lookup (for_user) cached in memory for 30 s, keyed by the VERIFIED
 * account id (from getUser, itself cached 30 s), the same way the account is cached. Only found apartments are
 * kept (a user with none yet asks the database every time until it is created or claimed), so a 1 s
 * state-cache hit makes no database trip. An entry can only ever answer for the user id it was stored under.
 */
export const APARTMENT_CACHE_MS = 30_000;
const apartmentCache = new Map<string, { apartment: Apartment; at: number }>();
let apartmentLookups = 0;

function rememberApartment(userId: string, apartment: Apartment) {
  apartmentCache.delete(userId);
  apartmentCache.set(userId, { apartment: { ...apartment }, at: Date.now() });
  if (apartmentCache.size > 5000) apartmentCache.delete(apartmentCache.keys().next().value!);
}

export async function apartmentForUser(userId: string): Promise<Apartment | null> {
  const hit = apartmentCache.get(userId);
  if (hit && Date.now() - hit.at < APARTMENT_CACHE_MS) return { ...hit.apartment };
  if (hit) apartmentCache.delete(userId);
  apartmentLookups += 1;
  const found = await directory().forUser(userId);
  if (found) rememberApartment(userId, found);
  return found;
}

/** Test hooks: database lookups so far, and a reset. */
export const apartmentCacheStats = () => ({ lookups: apartmentLookups, size: apartmentCache.size });
export function clearApartmentCache() {
  apartmentCache.clear();
  apartmentLookups = 0;
}

/**
 * One account, one apartment. Existing -> it. Verified LEGACY_OWNER_EMAIL -> claims the pre-v21 room
 * (agents, books, state and all). Otherwise a fresh private apartment (rate limited). The database's
 * unique owner_id makes a race or a second call return the same apartment.
 */
export async function ensureApartment(account: Account, req: Request): Promise<Provisioned | Response> {
  ownerSecret(); // r2: production without APARTMENT_OWNER_SECRET fails closed here (503), before any lookup
  const dir = directory();
  const existing = await apartmentForUser(account.id);
  if (existing) return { apartment: existing, created: false, claimedLegacy: false };
  const identity = accountIdentity(account.id);
  const legacy = legacyEmail();
  if (legacy && account.emailVerified && account.email === legacy) {
    const claimed = await dir.claimLegacy(account.id);
    if (claimed) {
      rememberApartment(account.id, claimed);
      await roomFor(claimed.id).setOwnerIdentity(identity);
      return { apartment: claimed, created: false, claimedLegacy: true };
    }
  }
  const tooMany =
    (await limited(`apt-create-ip:${ipKey(req)}`, LIMITS.createPerIp, "Too many new apartments from here. Try again later.", "create_rate_limited")) ??
    (await limited("apt-create-all", LIMITS.createGlobal, "Too many new apartments right now. Try again later.", "create_rate_limited"));
  if (tooMany) return tooMany;
  const made = await dir.create(account.id, freshApartmentState(identity), { locked: true, knocking: false });
  const apartment = (await apartmentForUser(account.id)) ?? { id: made.id, kind: "private" as const, legacy: false };
  return { apartment, created: made.created, claimedLegacy: false };
}

export type OwnerContext = {
  account: Account;
  apartment: Apartment;
  room: VersionedRoom;
  identity: string;
  setCookies: string[];
};

function withCookies(res: Response, cookies: string[]) {
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}
export { withCookies };

/** The signed-in owner and their apartment (provisioned on first use), or the 401/429 to send. */
export async function ownerContext(req: Request, opts: { resync?: boolean } = {}): Promise<OwnerContext | Response> {
  const { account, setCookies } = await currentAccount(req);
  if (!account) return withCookies(ownerJson({ ok: false, code: "signed_out", error: "Sign in to open your apartment." }, 401), setCookies);
  const got = await ensureApartment(account, req);
  if (got instanceof Response) return withCookies(got, setCookies);
  const room = roomFor(got.apartment.id);
  const identity = accountIdentity(account.id);
  if (opts.resync) {
    // The database says this account owns the apartment; make the room's door agree (legacy claim
    // interrupted, or the identity secret rotated). One write, only when they differ.
    const brief = await room.doorBrief(identity);
    if (!brief) await room.setOwnerIdentity(identity);
  }
  return { account, apartment: got.apartment, room, identity, setCookies };
}

// ---------- watch links ----------
export const WATCH_COOKIE = "__Host-lr_watch";
const WATCH_RE = /^wss_[0-9a-f]{64}$/;
export const WATCH_CODE_RE = /^[a-z2-7]{26}$/;
export const WATCH_MAX_UNUSED = 3;
/** A watch session lasts 12 h. WATCH_SESSION_MS overrides it outside production (tests; floor 10 s). */
export function watchSessionMs() {
  const raw = Number(process.env.WATCH_SESSION_MS);
  if (process.env.VERCEL_ENV !== "production" && Number.isFinite(raw) && raw > 0) return Math.max(10_000, raw);
  return 12 * 3600_000;
}
export const watchHash = (code: string) => sha256(`lr-watch|${code}`);
const sessionHash = (token: string) => sha256(`lr-watch-session|${token}`);

export function watchCookie(token: string, maxAgeSec: number) {
  return `${WATCH_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`;
}

export async function mintWatch(apartmentId: string) {
  const code = newInviteCode();
  const exp = Date.now() + INVITE_TTL_MS;
  await directory().watchMint(apartmentId, watchHash(code), exp, WATCH_MAX_UNUSED);
  return { code, expiresAt: exp };
}

export async function redeemWatch(rawCode: string) {
  const code = rawCode.trim().replace(/\.$/, "").toLowerCase();
  if (!WATCH_CODE_RE.test(code)) return { ok: false as const, code: "watch_invalid" };
  const token = `wss_${randomBytes(32).toString("hex")}`;
  const result = await directory().watchRedeem(watchHash(code), sessionHash(token), watchSessionMs());
  if (!result.ok) return result;
  return { ok: true as const, token, apartmentId: result.apartmentId, expiresMs: result.expiresMs };
}

export async function watchApartment(req: Request) {
  const token = cookieValue(req, WATCH_COOKIE);
  if (!WATCH_RE.test(token)) return null;
  return directory().watchSession(sessionHash(token));
}

/** Owner revoke keeps the owner-ended line. Expiry and anything we cannot tell use the ended-link line. */
export async function watchEndCopy(req: Request) {
  const token = cookieValue(req, WATCH_COOKIE);
  if (!WATCH_RE.test(token)) return WATCH_EXPIRED_COPY;
  const reason = await directory().watchEndReason(sessionHash(token));
  return reason === "revoke" ? WATCH_ENDED_COPY : WATCH_EXPIRED_COPY;
}

/** A well-formed watch cookie whose session is gone: the owner ended it, or it expired. */
export async function watchEndedResponse(req: Request, setCookies: string[] = []) {
  return withCookies(ownerJson({ ok: false, code: "watch_ended", error: await watchEndCopy(req) }, 403), setCookies);
}

export function hasWatchCookie(req: Request) {
  return WATCH_RE.test(cookieValue(req, WATCH_COOKIE));
}

export type ViewerContext = { apartmentId: string; role: "owner" | "watch"; room: VersionedRoom; setCookies: string[] };

/**
 * Owner-only viewing: the signed-in owner sees their own apartment; otherwise a valid watch session
 * sees the one apartment it was issued for. Anyone else gets null (the route answers 403).
 */
export async function viewerContext(req: Request): Promise<ViewerContext | null | Response> {
  const { account, setCookies } = await currentAccount(req);
  if (account) {
    const got = await ensureApartment(account, req);
    if (got instanceof Response) return withCookies(got, setCookies);
    return { apartmentId: got.apartment.id, role: "owner", room: roomFor(got.apartment.id), setCookies };
  }
  if (hasWatchCookie(req)) {
    const watched = await watchApartment(req);
    if (watched) return { apartmentId: watched, role: "watch", room: roomFor(watched), setCookies };
    return watchEndedResponse(req, setCookies);
  }
  return null;
}

/**
 * r1: every write from a watch session is a clean 403 (never 401/404 from a later step). Runs first in each
 * write route. A request that carries an agent credential (Authorization bearer, the agent-owner cookie) or a
 * signed-in account is not "a watch session" and goes on as before; no watch cookie = no lookup at all.
 */
export async function watchWriteBlock(req: Request): Promise<Response | null> {
  const token = cookieValue(req, WATCH_COOKIE);
  if (!WATCH_RE.test(token)) return null;
  if (req.headers.get("authorization") || cookieValue(req, "__Host-lr_owner")) return null;
  const { account, setCookies } = await currentAccount(req);
  if (account) return null;
  if (!(await directory().watchSession(sessionHash(token)))) return null;
  return withCookies(
    ownerJson({ ok: false, code: "watch_read_only", error: "This is a read-only watch link. Only the owner can change things here." }, 403),
    setCookies,
  );
}

export function forbiddenViewer(setCookies: string[] = []) {
  return withCookies(ownerJson({ ok: false, code: "private", error: "This apartment is private. Sign in, or ask the owner for a watch link." }, 403), setCookies);
}

// ---------- agents ----------
/** The apartment an agent's bearer token or own_ key belongs to. */
export async function agentRoom(token: string, ownerKey = "") {
  const t = token.trim();
  const k = /^own_[0-9a-f]{36}$/.test(ownerKey.trim()) ? ownerKey.trim() : "";
  if (!t && !k) return null;
  const id = await directory().agentApartment(t ? hashToken(t) : "", k);
  return id ? { apartmentId: id, room: roomFor(id) } : null;
}

/** Same normalisation as the door (v20): trim, drop ONE trailing ".", lower-case. */
export function normalizeInvite(raw: unknown) {
  return typeof raw === "string" ? raw.trim().replace(/\.$/, "").toLowerCase() : "";
}

export async function inviteRoom(raw: unknown) {
  const code = normalizeInvite(raw);
  if (!/^[a-z2-7]{26}$/.test(code)) return null;
  const id = await directory().inviteApartment(inviteHash(code));
  return id ? { apartmentId: id, room: roomFor(id) } : null;
}

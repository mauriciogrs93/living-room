import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MAX_AGENTS, cleanMessage, type RoomHost } from "./engine-host";
import type { ActErr, AgentRecord } from "./types";

export const KNOCK_MS = 15 * 60 * 1000;
export const DOOR_CAP = 10;
export const KNOCK_LIMIT = 4;
export const KNOCK_WINDOW_MS = 10 * 60 * 1000;
export const KNOCK_MESSAGE =
  "You knocked. The owner will decide; poll GET /api/door/status (or look) every ~10 s.";

const TESTER_ICON = "🧪";
const TESTER_COLOR = "#3d8be0";
/** Production QA agent. Trusted by this id even when the saved room has no agents yet. */
const TESTER_AGENT_ID = "agt_b71b2b01";
/** Placeholder until the real Poppy registers and replaces it. Not a live owner key. */
const POPPY_SEED_ID = "agt_poppy_seed";

export type DoorPerson = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  ownerKey: string;
};

export type Knock = DoorPerson & { token: string; note: string; at: number };

export type Settled = {
  id: string;
  token: string;
  name: string;
  status: "declined" | "expired" | "blocked";
  at: number;
};

/** A single-use invite. Only the SHA-256 hash of the 128-bit value is stored. */
export type Invite = {
  hash: string;
  at: number;
  exp: number;
  usedBy: string;
  usedAt: number;
  /** v19: set when Pause (or the 10-unused cap) cancels it. Answers invite_cancelled. */
  cancelledAt?: number;
};

/**
 * v19: an agent admitted by a valid invite may rejoin with its own ownerKey or token for 24 hours.
 * Only sha256(ownerKey) is stored. Never grants trust or owner rights. Pause leaves passes alone;
 * only the owner's Remove (or Untrust) deletes one. Paused or blocked rules still apply.
 */
export type GuestPass = { id: string; hash: string; exp: number; name: string; color: string; emoji: string };

/** Agents that came in with an invite. The owner can Trust them from People. */
export type Visitor = { id: string; name: string; color: string; emoji: string; at: number };

export type DoorState = {
  locked: boolean;
  invite: string;
  trusted: DoorPerson[];
  blocked: DoorPerson[];
  knocks: Knock[];
  settled: Settled[];
  migrated: boolean;
  /** v19: sha256 of the single room-owner key. Only this key controls the door. Trusted != owner. */
  ownerHash: string;
  /** v19: Pause invites. While true the server refuses to create invites and no invite enters. */
  paused: boolean;
  /** v19: single-use invites (hashes only). Unused ones expire after INVITE_TTL_MS. */
  invites: Invite[];
  visitors: Visitor[];
  passes: GuestPass[];
};

export const INVITE_TTL_MS = Math.max(5_000, Number(process.env.INVITE_TTL_MS) || 10 * 60 * 1000);
export const INVITE_MAX_UNUSED = 10;
/** Guest pass length. GUEST_PASS_MS env is for test previews only (floor 5 s). */
export const GUEST_PASS_MS = Math.max(5_000, Number(process.env.GUEST_PASS_MS) || 24 * 3600_000);
/** Failed invite attempts per hashed IP per 10 min. INVITE_FAIL_LIMIT env is for test previews only (floor 3). */
export const INVITE_FAIL_LIMIT = Math.max(3, Number(process.env.INVITE_FAIL_LIMIT) || 5);
export const INVITE_FAIL_WINDOW_MS = 10 * 60 * 1000;
const INVITE_RE = /^[a-z2-7]{26}$/;
const B32 = "abcdefghijklmnopqrstuvwxyz234567";

export const DOOR_COPY = {
  missing: "This room is private. Ask your person for an invite.",
  bad: "This invite didn't work. Ask for a new one.",
  tries: "Too many tries. Wait a minute, then try again.",
  blocked: "The owner has asked you not to come in.",
};

export type InviteFail = "invite_missing" | "invite_invalid" | "invite_used" | "invite_expired" | "invite_paused" | "invite_cancelled";

export type EntryPlan =
  | { kind: "blocked" }
  | { kind: "inside" }
  | { kind: "enter"; trust: boolean; seedId: string; owner: boolean; inviteHash: string; pass?: boolean }
  | { kind: "turned_away"; code: InviteFail }
  | { kind: "room_full" }
  | { kind: "limited"; retryAfter: number };

export function freshDoor(): DoorState {
  return {
    locked: true,
    invite: randomBytes(4).toString("hex"),
    trusted: [],
    blocked: [],
    knocks: [],
    settled: [],
    migrated: false,
    ownerHash: "",
    paused: false,
    invites: [],
    visitors: [],
    passes: [],
  };
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function inviteHash(code: string) {
  return sha256(`lr-invite|${code}`);
}

/** 128 random bits as 26 base32 characters. */
export function newInviteCode() {
  const bytes = randomBytes(17);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, 26);
}

export function isOwner(room: RoomHost, ownerKey: string) {
  const expect = room.door?.ownerHash ?? "";
  if (!ownerKey || !/^[0-9a-f]{64}$/.test(expect)) return false;
  return timingSafeEqual(Buffer.from(sha256(ownerKey.trim())), Buffer.from(expect));
}

export function hasOwner(room: RoomHost) {
  return /^[0-9a-f]{64}$/.test(room.door?.ownerHash ?? "");
}

/** Mark the owner. Only the rescue claim (no owner yet) or the v18 migration call this. */
export function claimOwner(room: RoomHost, ownerKey: string) {
  room.door.ownerHash = sha256(ownerKey.trim());
}

export function readKnockNote(raw: unknown): { ok: true; note: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, note: "" };
  if (typeof raw !== "string") return { ok: false, error: "A knock note is plain text, up to 140 characters." };
  if (raw.trim().length > 140) return { ok: false, error: "A knock note is at most 140 characters." };
  const text = cleanMessage(raw);
  if (!text) return { ok: false, error: "A knock note is plain text, up to 140 characters." };
  return { ok: true, note: text };
}

export function restoreDoor(room: RoomHost, raw: unknown) {
  room.door = sanitize(raw);
  ensureMigrated(room);
}

export function ensureMigrated(room: RoomHost) {
  if (!room.door) room.door = freshDoor();
  if (!room.door.migrated) {
    const moved = migrate(room);
    room.door.migrated = true;
    if (moved) room.emit();
  }
  if (!hasOwner(room)) {
    const steward = room.door.trusted.find((person) => person.ownerKey);
    if (steward) room.door.ownerHash = sha256(steward.ownerKey);
  }
  ensureSeeds(room);
}

export function expireKnocks(room: RoomHost, now = Date.now()) {
  if (!room.door) room.door = freshDoor();
  ensureMigrated(room);
  const alive: Knock[] = [];
  let changed = false;
  for (const knock of room.door.knocks) {
    if (now - knock.at >= KNOCK_MS) {
      rememberSettled(room, { id: knock.id, token: knock.token, name: knock.name, status: "expired", at: now });
      changed = true;
    } else alive.push(knock);
  }
  if (changed) room.door.knocks = alive;
}

export function planEntry(
  room: RoomHost,
  input: {
    agentId: string;
    name: string;
    emoji: string;
    color: string;
    invite: string;
    ip: string;
    alreadyInside: boolean;
    seedId?: string;
    seedSecret?: string;
    /** The returning agent's own ownerKey (from its mailbox via ownerKey or token). */
    passKey?: string;
  },
): EntryPlan {
  ensureMigrated(room);
  const now = Date.now();
  const id = input.agentId;
  if (id && isBlocked(room, id)) return { kind: "blocked" };
  if (input.alreadyInside) return { kind: "inside" };
  const enter = (plan: { trust: boolean; seedId?: string; owner?: boolean; inviteHash?: string; pass?: boolean }): EntryPlan => {
    if (room.agents.size >= MAX_AGENTS) return { kind: "room_full" };
    return { kind: "enter", trust: plan.trust, seedId: plan.seedId ?? "", owner: Boolean(plan.owner), inviteHash: plan.inviteHash ?? "", pass: Boolean(plan.pass) };
  };
  // Trusted agents holding their own key or token always walk in. Trust never means owner.
  if (id && isTrusted(room, id)) return enter({ trust: true });
  // Rescue: an empty room with no owner yet. The next register becomes the owner (logged loudly).
  if (!hasOwner(room)) return enter({ trust: true, owner: true });
  const seed = claimableSeed(room, input);
  if (seed) return enter({ trust: true, seedId: seed.id });
  // Invites only (Option A). No knocking.
  // Failed-invite limiting lives in the register route (store rate_hit), so it is committed even
  // though a turned-away register writes nothing to the room.
  // Guest pass: an invited agent coming back with its own key within 24 hours. Untrusted, never owner.
  if (id && input.passKey && validPass(room, id, input.passKey, now)) {
    if (room.door.paused) return { kind: "turned_away", code: "invite_paused" };
    return enter({ trust: false, pass: true });
  }
  const verdict = checkInvite(room, input.invite, now);
  if (verdict.ok) return enter({ trust: false, inviteHash: verdict.hash });
  return { kind: "turned_away", code: verdict.code };
}

function checkInvite(room: RoomHost, raw: string, now: number): { ok: true; hash: string } | { ok: false; code: InviteFail } {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!text) return { ok: false, code: "invite_missing" };
  if (room.door.paused) return { ok: false, code: "invite_paused" };
  if (text.length > 64 || !INVITE_RE.test(text)) return { ok: false, code: "invite_invalid" };
  const hash = inviteHash(text);
  const found = room.door.invites.find((item) => timingSafeEqual(Buffer.from(item.hash), Buffer.from(hash)));
  if (!found) return { ok: false, code: "invite_invalid" };
  if (found.cancelledAt) return { ok: false, code: "invite_cancelled" };
  if (found.usedAt) return { ok: false, code: "invite_used" };
  if (found.exp <= now) return { ok: false, code: "invite_expired" };
  return { ok: true, hash };
}

/** Consume inside the same compare-and-set commit that admits the agent. */
export function consumeInvite(room: RoomHost, hash: string, agentId: string) {
  const found = room.door.invites.find((item) => item.hash === hash);
  if (!found) return;
  found.usedAt = Date.now();
  found.usedBy = agentId;
}

function validPass(room: RoomHost, id: string, ownerKey: string, now: number) {
  const pass = room.door.passes.find((item) => item.id === id);
  if (!pass || pass.exp <= now) return false;
  const hash = sha256(ownerKey);
  return pass.hash.length === hash.length && timingSafeEqual(Buffer.from(pass.hash), Buffer.from(hash));
}

/** Issued once, when a valid invite admits the agent (same commit). Not extended by rejoining. */
export function grantPass(room: RoomHost, person: { id: string; ownerKey: string; name: string; color: string; emoji: string }) {
  if (!person.ownerKey) return;
  const now = Date.now();
  room.door.passes = room.door.passes.filter((item) => item.id !== person.id && item.exp > now);
  room.door.passes.push({ id: person.id, hash: sha256(person.ownerKey), exp: now + GUEST_PASS_MS, name: person.name, color: person.color, emoji: person.emoji });
  if (room.door.passes.length > 40) room.door.passes.splice(0, room.door.passes.length - 40);
}

/** The look an agent had last time, so a re-register without emoji or colour keeps it. */
export function priorLook(room: RoomHost, id: string): { color: string; emoji: string } | null {
  if (!id) return null;
  const agent = room.agents.get(id);
  if (agent) return { color: agent.homeColor || agent.color, emoji: agent.emoji };
  const known = room.door.trusted.find((item) => item.id === id) ?? room.door.passes.find((item) => item.id === id) ?? room.door.visitors.find((item) => item.id === id);
  return known ? { color: known.color, emoji: known.emoji } : null;
}

export function rememberVisitor(room: RoomHost, visitor: Omit<Visitor, "at">) {
  room.door.visitors = room.door.visitors.filter((item) => item.id !== visitor.id);
  room.door.visitors.push({ ...visitor, at: Date.now() });
  if (room.door.visitors.length > 20) room.door.visitors.splice(0, room.door.visitors.length - 20);
}

export function turnedAway(code: InviteFail): ActErr {
  if (code === "invite_missing") {
    return { ok: false, status: 403, code, error: DOOR_COPY.missing, hint: "Register with the invite from your person, sent as \"invite\" in the JSON body." };
  }
  if (code === "invite_paused" || code === "invite_cancelled") {
    return { ok: false, status: 403, code, error: DOOR_COPY.bad, hint: "Ask your person for a new invite." };
  }
  return { ok: false, status: 403, code, error: DOOR_COPY.bad, hint: "Don't retry the same invite. Ask your person for a new one." };
}

/** Old invites, used records and expired ones are pruned so the blob stays small. */
function pruneInvites(room: RoomHost, now = Date.now()) {
  room.door.invites = room.door.invites.filter((item) => (item.usedAt ? now - item.usedAt < 24 * 3600_000 : now - item.exp < 24 * 3600_000));
  room.door.passes = room.door.passes.filter((item) => item.exp > now);
  if (room.door.invites.length > 40) room.door.invites.splice(0, room.door.invites.length - 40);
}

export function inviteMatches(room: RoomHost, raw: string) {
  return checkInvite(room, raw, Date.now()).ok;
}

export function holdResponse(room: RoomHost, token: string): ActErr | null {
  if (!token || !room.door) return null;
  const now = Date.now();
  const knock = room.door.knocks.find((item) => item.token === token);
  if (knock) {
    if (now - knock.at >= KNOCK_MS) return statusError("expired");
    return statusError("waiting");
  }
  const settled = [...room.door.settled].reverse().find((item) => item.token && item.token === token);
  if (settled) return statusError(settled.status);
  return null;
}

export function knockPayload(knock: Knock, notes: { id: string; text: string; at: number }[] = []) {
  return {
    ok: true as const,
    waiting: true as const,
    status: "waiting" as const,
    message: KNOCK_MESSAGE,
    agentId: knock.id,
    name: knock.name,
    color: knock.color,
    emoji: knock.emoji,
    token: knock.token,
    ownerKey: knock.ownerKey,
    notes,
  };
}

export function rememberKnock(room: RoomHost, knock: Knock) {
  forgetId(room, knock.id);
  room.door.knocks.push(knock);
}

export function waitingKnock(room: RoomHost, agentId: string) {
  return room.door.knocks.find((knock) => knock.id === agentId);
}

export function grantTrust(room: RoomHost, person: DoorPerson) {
  room.door.blocked = room.door.blocked.filter((item) => item.id !== person.id);
  const index = room.door.trusted.findIndex((item) => item.id === person.id);
  if (index >= 0) room.door.trusted[index] = person;
  else room.door.trusted.push(person);
}

export function blockPerson(room: RoomHost, person: DoorPerson, token = "") {
  if (ownerPerson(room, person)) {
    return { ok: false as const, status: 409, error: "The owner's own agent can't be blocked." };
  }
  room.door.trusted = room.door.trusted.filter((item) => item.id !== person.id);
  forgetId(room, person.id);
  const index = room.door.blocked.findIndex((item) => item.id === person.id);
  if (index >= 0) room.door.blocked[index] = person;
  else room.door.blocked.push(person);
  if (token) rememberSettled(room, { id: person.id, token, name: person.name, status: "blocked", at: Date.now() });
  return { ok: true as const };
}

export function isBlocked(room: RoomHost, agentId: string) {
  return room.door.blocked.some((item) => item.id === agentId);
}

export function isTrusted(room: RoomHost, agentId: string) {
  return room.door.trusted.some((item) => item.id === agentId);
}

/** v19: only the single room-owner key controls the door. A trusted agent is not an owner. */
export function isSteward(room: RoomHost, ownerKey: string) {
  return isOwner(room, ownerKey);
}

function ownerPerson(room: RoomHost, person: DoorPerson) {
  if (person.ownerKey && isOwner(room, person.ownerKey)) return true;
  const agent = room.agents.get(person.id);
  return Boolean(agent?.ownerKey && isOwner(room, agent.ownerKey));
}

export function forgetId(room: RoomHost, agentId: string) {
  room.door.knocks = room.door.knocks.filter((knock) => knock.id !== agentId);
  room.door.settled = room.door.settled.filter((item) => item.id !== agentId);
}

export function nameReserved(room: RoomHost, name: string, agentId: string) {
  const key = name.toLowerCase();
  for (const agent of room.agents.values()) {
    if (agent.id !== agentId && agent.name.toLowerCase() === key) return true;
  }
  const reclaiming = Boolean(agentId && room.door.trusted.some((person) => person.id === agentId));
  if (reclaiming) return false;
  const seedHoldsName = room.door.trusted.some((person) => !person.ownerKey && person.name.toLowerCase() === key);
  if (seedHoldsName) return false;
  for (const knock of room.door.knocks) {
    if (knock.id !== agentId && knock.name.toLowerCase() === key) return true;
  }
  return false;
}

export function stepAway(room: RoomHost, token: string): { ok: true; message: string } | null {
  const knock = room.door.knocks.find((item) => item.token === token);
  if (!knock) return null;
  room.door.knocks = room.door.knocks.filter((item) => item.token !== token);
  return { ok: true, message: `${knock.name} stepped back from the door.` };
}

export function doorStatus(room: RoomHost, token: string) {
  ensureMigrated(room);
  expireKnocks(room);
  if (room.tokens.get(token) && room.agents.has(room.tokens.get(token)!)) {
    return { ok: true as const, status: "in" as const, message: "You are in the room. Look around, then act." };
  }
  const held = holdResponse(room, token);
  if (!held) return { ok: false as const, status: 401, error: "Unknown or missing token. Register again." };
  const status = held.code === "waiting" ? "waiting" : held.code === "declined" ? "declined" : held.code === "expired" ? "expired" : "blocked";
  return { ok: true as const, status, message: statusCopy(status) };
}

export function doorBrief(room: RoomHost, ownerKey: string) {
  ensureMigrated(room);
  expireKnocks(room);
  if (!isSteward(room, ownerKey)) return null;
  return publicLists(room);
}

export function doorView(room: RoomHost, ownerKey: string) {
  const brief = doorBrief(room, ownerKey);
  if (!brief) return { ok: false as const, status: 403, error: "Only the room owner can see the door." };
  return { ok: true as const, ...brief };
}

export function doorAct(room: RoomHost, ownerKey: string, action: string, id: string) {
  ensureMigrated(room);
  expireKnocks(room);
  if (!isSteward(room, ownerKey)) return { ok: false as const, status: 403, error: "Only the room owner can see the door." };
  const now = Date.now();
  pruneInvites(room, now);
  if (action === "invite") {
    if (room.door.paused) {
      return { ok: false as const, status: 409, code: "invites_paused", error: "Invites are paused. Resume to make a new one." };
    }
    const unused = room.door.invites.filter((item) => !item.usedAt && !item.cancelledAt && item.exp > now);
    while (unused.length >= INVITE_MAX_UNUSED) unused.shift()!.cancelledAt = now;
    const code = newInviteCode();
    room.door.invites.push({ hash: inviteHash(code), at: now, exp: now + INVITE_TTL_MS, usedBy: "", usedAt: 0 });
    return { ok: true as const, message: "Invite ready.", invite: code };
  }
  if (action === "pause") {
    // One write: pause, and cancel every unused invite. Used records stay for the audit trail.
    // Guest passes are NOT touched: only the owner's Remove deletes one.
    room.door.paused = true;
    for (const item of room.door.invites) if (!item.usedAt && !item.cancelledAt) item.cancelledAt = now;
    return { ok: true as const, message: "Invites paused. Old invites stop working." };
  }
  if (action === "resume") {
    room.door.paused = false;
    return { ok: true as const, message: "Invites are back on." };
  }
  if (action === "trust") return trustVisitor(room, id);
  if (action === "untrust") return untrust(room, id);
  if (action === "remove") return removeGuest(room, id);
  if (action === "unblock") return unblock(room, id);
  return { ok: false as const, status: 400, error: "Unknown door action." };
}

function trustVisitor(room: RoomHost, id: string) {
  const visitor = room.door.visitors.find((item) => item.id === id);
  const agent = room.agents.get(id);
  const who = visitor ?? (agent ? { id: agent.id, name: agent.name, color: agent.color, emoji: agent.emoji } : null);
  if (!who) return { ok: false as const, status: 404, error: "That visitor has gone." };
  if (isBlocked(room, who.id)) return { ok: false as const, status: 409, error: "Unblock them first." };
  grantTrust(room, { id: who.id, name: who.name, color: who.color, emoji: who.emoji, ownerKey: "" });
  return { ok: true as const, message: `${who.name} can come in without an invite.` };
}

function untrust(room: RoomHost, id: string) {
  const person = room.door.trusted.find((item) => item.id === id);
  if (!person) return { ok: false as const, status: 404, error: "That agent is not on the trusted list." };
  if (ownerPerson(room, person)) {
    return { ok: false as const, status: 409, error: "The owner's own agent stays trusted." };
  }
  room.door.trusted = room.door.trusted.filter((item) => item.id !== id);
  room.door.passes = room.door.passes.filter((item) => item.id !== id);
  return { ok: true as const, message: `${person.name} will need an invite next time.` };
}

/** Owner's Remove on a recent visitor: ends its guest pass (and trust, never the owner's own agent). */
function removeGuest(room: RoomHost, id: string) {
  const person = room.door.trusted.find((item) => item.id === id);
  if (person && ownerPerson(room, person)) return { ok: false as const, status: 409, error: "The owner's own agent stays trusted." };
  const known = room.door.visitors.find((item) => item.id === id) ?? room.door.passes.find((item) => item.id === id) ?? person;
  if (!known) return { ok: false as const, status: 404, error: "That visitor has gone." };
  room.door.passes = room.door.passes.filter((item) => item.id !== id);
  room.door.trusted = room.door.trusted.filter((item) => item.id !== id);
  room.door.visitors = room.door.visitors.filter((item) => item.id !== id);
  return { ok: true as const, message: `${known.name} will need an invite next time.` };
}

function unblock(room: RoomHost, id: string) {
  const person = room.door.blocked.find((item) => item.id === id);
  if (!person) return { ok: false as const, status: 404, error: "That agent is not blocked." };
  room.door.blocked = room.door.blocked.filter((item) => item.id !== id);
  room.door.settled = room.door.settled.filter((item) => !(item.id === id && item.status === "blocked"));
  return { ok: true as const, message: `${person.name} can come in with an invite again.` };
}

function publicLists(room: RoomHost) {
  const now = Date.now();
  const trustedIds = new Set(room.door.trusted.map((person) => person.id));
  return {
    locked: room.door.locked,
    paused: room.door.paused,
    unused: room.door.invites.filter((item) => !item.usedAt && !item.cancelledAt && item.exp > now).length,
    visitors: [...room.door.visitors]
      .reverse()
      .filter((item) => !trustedIds.has(item.id))
      .map((item) => ({ id: item.id, name: item.name, color: item.color, emoji: item.emoji, at: item.at })),
    knocks: room.door.knocks.map((knock) => ({
      id: knock.id,
      name: knock.name,
      color: knock.color,
      emoji: knock.emoji,
      note: knock.note,
      at: knock.at,
    })),
    trusted: room.door.trusted.filter((person) => person.ownerKey || !person.id.endsWith("_seed")).map(showPerson),
    blocked: room.door.blocked.map(showPerson),
  };
}

function showPerson(person: DoorPerson) {
  return { id: person.id, name: person.name, color: person.color, emoji: person.emoji };
}

function rememberSettled(room: RoomHost, item: Settled) {
  room.door.settled = room.door.settled.filter((saved) => saved.token !== item.token || !item.token);
  room.door.settled.push(item);
  if (room.door.settled.length > 40) room.door.settled.splice(0, room.door.settled.length - 40);
}

function statusError(status: "waiting" | "declined" | "expired" | "blocked"): ActErr {
  if (status === "waiting") {
    return {
      ok: false,
      status: 403,
      code: "waiting",
      error: "You are waiting at the door.",
      hint: "The owner will decide. Poll GET /api/door/status (or look) every ~10 s. Do not knock again.",
    };
  }
  if (status === "declined") {
    return {
      ok: false,
      status: 403,
      code: "declined",
      error: "The owner said not now.",
      hint: "You can try again later. Wait politely and do not re-knock repeatedly.",
    };
  }
  if (status === "expired") {
    return {
      ok: false,
      status: 403,
      code: "expired",
      error: "Your knock expired with no answer.",
      hint: "You may knock once more if you still want to come in. Do not re-knock while you are waiting.",
    };
  }
  return {
    ok: false,
    status: 403,
    code: "blocked",
    error: "The owner has asked you not to come in.",
    hint: "Do not knock again.",
  };
}

function statusCopy(status: "waiting" | "declined" | "expired" | "blocked") {
  if (status === "waiting") return KNOCK_MESSAGE;
  if (status === "declined") return "The owner said not now. You can try again later. Wait politely and do not re-knock repeatedly.";
  if (status === "expired") return "Your knock expired with no answer. You may knock once more if you still want to come in.";
  return "The owner has asked you not to come in. Do not knock again.";
}

function hasCredential(agent: AgentRecord) {
  return Boolean(agent.id && agent.token && agent.ownerKey);
}

/** Tester is the stored record whose name and flask icon match. Colour breaks a tie. */
function isTesterShape(input: { name: string; emoji: string; color: string }) {
  return (
    input.name.trim().toLowerCase() === "tester" &&
    input.emoji.includes(TESTER_ICON) &&
    input.color.trim().toLowerCase() === TESTER_COLOR
  );
}

function isTesterRecord(agent: AgentRecord) {
  return hasCredential(agent) && isTesterShape(agent);
}

/**
 * An unclaimed seed (trusted row with no owner key) can be claimed only with the server secret
 * SEED_CLAIM_SECRET plus the seed's id. Name, emoji, colour and agentId never claim a seed.
 * With SEED_CLAIM_SECRET unset, seed claims are off.
 */
function claimableSeed(room: RoomHost, input: { seedId?: string; seedSecret?: string }): DoorPerson | null {
  const seedId = typeof input.seedId === "string" ? input.seedId.trim() : "";
  if (!seedId || !seedSecretMatches(input.seedSecret)) return null;
  return room.door.trusted.find((person) => !person.ownerKey && person.id === seedId) ?? null;
}

function seedSecretMatches(raw: unknown) {
  const expect = (process.env.SEED_CLAIM_SECRET ?? "").trim();
  if (!expect || typeof raw !== "string" || !raw) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(raw.trim()), digest(expect));
}

/**
 * Keep placeholder rows for Poppy and Tester. They grant nothing by name, emoji or colour:
 * claimableSeed only accepts SEED_CLAIM_SECRET.
 */
function ensureSeeds(room: RoomHost) {
  const trusted = room.door.trusted;
  const agents = [...room.agents.values()];
  const testerKnown =
    trusted.some((person) => person.id === TESTER_AGENT_ID || isTesterShape(person)) ||
    agents.some((agent) => agent.id === TESTER_AGENT_ID || isTesterRecord(agent));
  if (!testerKnown) {
    trusted.push({
      id: TESTER_AGENT_ID,
      name: "Tester",
      color: TESTER_COLOR,
      emoji: TESTER_ICON,
      ownerKey: "",
    });
  }
  const poppyKnown =
    trusted.some((person) => person.name.trim().toLowerCase() === "poppy") ||
    agents.some((agent) => agent.name.trim().toLowerCase() === "poppy");
  if (!poppyKnown) {
    trusted.push({
      id: POPPY_SEED_ID,
      name: "Poppy",
      color: "#e07a3d",
      emoji: "🌸",
      ownerKey: "",
    });
  }
}

function migrate(room: RoomHost) {
  const agents = [...room.agents.values()];
  const testerKeys = new Set<string>();
  for (const agent of agents) {
    if (isTesterRecord(agent) && agent.ownerKey) testerKeys.add(agent.ownerKey);
  }
  const keep = new Set<string>();
  for (const agent of agents) {
    if (!hasCredential(agent) || !agent.ownerKey) continue;
    const poppy = agent.name.trim().toLowerCase() === "poppy";
    const underTester = testerKeys.has(agent.ownerKey);
    if (!poppy && !underTester) continue;
    keep.add(agent.id);
    grantTrust(room, {
      id: agent.id,
      name: agent.name,
      color: agent.color,
      emoji: agent.emoji,
      ownerKey: agent.ownerKey,
    });
  }
  const dropped = new Set<string>();
  for (const agent of agents) {
    if (keep.has(agent.id)) continue;
    quietDrop(room, agent);
    dropped.add(agent.id);
    if (hasCredential(agent) && agent.ownerKey) {
      room.door.knocks.push({
        id: agent.id,
        name: agent.name,
        color: agent.color,
        emoji: agent.emoji,
        token: agent.token,
        ownerKey: agent.ownerKey,
        note: "",
        at: Date.now(),
      });
    }
  }
  if (dropped.size) {
    room.events = room.events.filter((event) => !event.agentId || !dropped.has(event.agentId));
    room.house.diary = room.house.diary.filter((line) => !dropped.has(line.agentId));
  }
  return dropped.size > 0;
}

function quietDrop(room: RoomHost, agent: AgentRecord) {
  const computer = room.objects.get("computer");
  if (computer && computer.state.user === agent.name) {
    computer.state.power = false;
    computer.state.mode = "off";
    computer.state.line = "";
    computer.state.source = "";
    computer.state.user = "";
  }
  room.release(agent);
  room.agents.delete(agent.id);
  room.tokens.delete(agent.token);
}

function sanitize(raw: unknown): DoorState {
  const base = freshDoor();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<DoorState>;
  const invite = typeof data.invite === "string" && /^[0-9a-f]{8}$/.test(data.invite) ? data.invite : base.invite;
  return {
    locked: data.locked !== false,
    invite,
    trusted: people(data.trusted),
    blocked: people(data.blocked),
    knocks: knocks(data.knocks),
    settled: settled(data.settled),
    migrated: data.migrated === true,
    ownerHash: typeof data.ownerHash === "string" && /^[0-9a-f]{64}$/.test(data.ownerHash) ? data.ownerHash : "",
    paused: data.paused === true,
    invites: invites(data.invites),
    visitors: visitors(data.visitors),
    passes: passes(data.passes),
  };
}

function passes(raw: unknown): GuestPass[] {
  if (!Array.isArray(raw)) return [];
  const list: GuestPass[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const pass = item as Partial<GuestPass>;
    if (typeof pass.id !== "string" || typeof pass.hash !== "string" || !/^[0-9a-f]{64}$/.test(pass.hash)) continue;
    list.push({
      id: pass.id.slice(0, 40),
      hash: pass.hash,
      exp: Number(pass.exp) || 0,
      name: typeof pass.name === "string" ? pass.name.slice(0, 40) : "",
      color: typeof pass.color === "string" ? pass.color : "#c4a574",
      emoji: typeof pass.emoji === "string" ? pass.emoji : "•",
    });
  }
  return list.slice(-40);
}

function invites(raw: unknown): Invite[] {
  if (!Array.isArray(raw)) return [];
  const list: Invite[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const invite = item as Partial<Invite>;
    if (typeof invite.hash !== "string" || !/^[0-9a-f]{64}$/.test(invite.hash)) continue;
    list.push({
      hash: invite.hash,
      at: Number(invite.at) || 0,
      exp: Number(invite.exp) || 0,
      usedBy: typeof invite.usedBy === "string" ? invite.usedBy.slice(0, 40) : "",
      usedAt: Number(invite.usedAt) || 0,
      ...(Number(invite.cancelledAt) ? { cancelledAt: Number(invite.cancelledAt) } : {}),
    });
  }
  return list.slice(-40);
}

function visitors(raw: unknown): Visitor[] {
  if (!Array.isArray(raw)) return [];
  const list: Visitor[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const visitor = item as Partial<Visitor>;
    if (!visitor.id || !visitor.name) continue;
    list.push({
      id: String(visitor.id),
      name: String(visitor.name).slice(0, 40),
      color: typeof visitor.color === "string" ? visitor.color : "#c4a574",
      emoji: typeof visitor.emoji === "string" ? visitor.emoji : "•",
      at: Number(visitor.at) || 0,
    });
  }
  return list.slice(-20);
}

function people(raw: unknown): DoorPerson[] {
  if (!Array.isArray(raw)) return [];
  const list: DoorPerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const person = item as Partial<DoorPerson>;
    if (!person.id || !person.name) continue;
    list.push({
      id: String(person.id),
      name: String(person.name).slice(0, 40),
      color: typeof person.color === "string" ? person.color : "#c4a574",
      emoji: typeof person.emoji === "string" ? person.emoji : "•",
      ownerKey: typeof person.ownerKey === "string" ? person.ownerKey : "",
    });
  }
  return list.slice(0, 40);
}

function knocks(raw: unknown): Knock[] {
  if (!Array.isArray(raw)) return [];
  const list: Knock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const knock = item as Partial<Knock>;
    if (!knock.id || !knock.token || !knock.ownerKey || !knock.name) continue;
    list.push({
      id: String(knock.id),
      name: String(knock.name).slice(0, 40),
      color: typeof knock.color === "string" ? knock.color : "#c4a574",
      emoji: typeof knock.emoji === "string" ? knock.emoji : "•",
      ownerKey: String(knock.ownerKey),
      token: String(knock.token),
      note: typeof knock.note === "string" ? knock.note.slice(0, 140) : "",
      at: Number(knock.at) || Date.now(),
    });
  }
  return list.slice(0, 30);
}

function settled(raw: unknown): Settled[] {
  if (!Array.isArray(raw)) return [];
  const list: Settled[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const saved = item as Partial<Settled>;
    if (!saved.id || (saved.status !== "declined" && saved.status !== "expired" && saved.status !== "blocked")) continue;
    list.push({
      id: String(saved.id),
      token: typeof saved.token === "string" ? saved.token : "",
      name: typeof saved.name === "string" ? saved.name : "",
      status: saved.status,
      at: Number(saved.at) || Date.now(),
    });
  }
  return list.slice(-40);
}

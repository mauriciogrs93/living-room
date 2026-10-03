import { randomBytes, timingSafeEqual } from "node:crypto";
import { MAX_AGENTS, cleanMessage, type RoomHost } from "./engine-host";
import { SPAWNS } from "./layout";
import { peekOwner, rotateToken } from "./mailbox";
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

export type DoorState = {
  locked: boolean;
  invite: string;
  trusted: DoorPerson[];
  blocked: DoorPerson[];
  knocks: Knock[];
  settled: Settled[];
  migrated: boolean;
};

export type EntryPlan =
  | { kind: "blocked" }
  | { kind: "inside" }
  | { kind: "enter"; trust: boolean; seedId: string }
  | { kind: "wait" }
  | { kind: "knock" }
  | { kind: "room_full" }
  | { kind: "door_full" }
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
  };
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
  input: { agentId: string; name: string; emoji: string; color: string; invite: string; ip: string; alreadyInside: boolean },
): EntryPlan {
  ensureMigrated(room);
  const id = input.agentId;
  if (id && isBlocked(room, id)) return { kind: "blocked" };
  if (input.alreadyInside) return { kind: "inside" };
  const invited = inviteMatches(room, input.invite);
  const trusted = Boolean(id && isTrusted(room, id));
  const seed = claimableSeed(room, input);
  // No steward key yet: the next register claims the door. Seeds alone cannot leave everyone knocking.
  const rescue = !hasSteward(room);
  if (trusted || invited || rescue || seed || !room.door.locked) {
    if (room.agents.size >= MAX_AGENTS) return { kind: "room_full" };
    return { kind: "enter", trust: trusted || invited || rescue || Boolean(seed), seedId: seed?.id ?? "" };
  }
  if (id && room.door.knocks.some((knock) => knock.id === id)) return { kind: "wait" };
  if (room.door.knocks.length >= DOOR_CAP) return { kind: "door_full" };
  const limit = chargeKnock(room, input.ip, input.name);
  if (!limit.ok) return { kind: "limited", retryAfter: limit.retryAfter };
  return { kind: "knock" };
}

export function inviteMatches(room: RoomHost, raw: string) {
  const code = raw.trim().toLowerCase();
  const expect = (room.door?.invite ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(code) || code.length !== expect.length) return false;
  return timingSafeEqual(Buffer.from(code), Buffer.from(expect));
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
  if (person.ownerKey && isTrusted(room, person.id) && stewardCount(room) <= 1) {
    return { ok: false as const, status: 409, error: "Keep at least one trusted agent so someone can open the door." };
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

export function isSteward(room: RoomHost, ownerKey: string) {
  if (!ownerKey) return false;
  return room.door.trusted.some((item) => item.ownerKey === ownerKey);
}

function hasSteward(room: RoomHost) {
  return room.door.trusted.some((item) => item.ownerKey);
}

function stewardCount(room: RoomHost) {
  return room.door.trusted.filter((item) => item.ownerKey).length;
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
  return { ok: true as const, invite: room.door.invite, ...brief };
}

export function doorAct(room: RoomHost, ownerKey: string, action: string, id: string) {
  ensureMigrated(room);
  expireKnocks(room);
  if (!isSteward(room, ownerKey)) return { ok: false as const, status: 403, error: "Only the room owner can see the door." };
  if (action === "lock") {
    room.door.locked = true;
    return { ok: true as const, message: "The door is locked." };
  }
  if (action === "unlock") {
    room.door.locked = false;
    return { ok: true as const, message: "The door is open." };
  }
  if (action === "reset-invite") {
    room.door.invite = randomBytes(4).toString("hex");
    return { ok: true as const, message: "The old invite code no longer works." };
  }
  if (action === "untrust") return untrust(room, id);
  if (action === "unblock") return unblock(room, id);
  if (action === "decline") return decline(room, id);
  if (action === "admit" || action === "trust") return admit(room, id, action === "trust");
  return { ok: false as const, status: 400, error: "Unknown door action." };
}

function admit(room: RoomHost, id: string, trust: boolean) {
  const knock = room.door.knocks.find((item) => item.id === id);
  if (!knock) return { ok: false as const, status: 404, error: "That knock has already gone." };
  if (isBlocked(room, knock.id)) return statusError("blocked");
  if (room.agents.size >= MAX_AGENTS) {
    return { ok: false as const, status: 503, code: "full", error: "The room is full. Try again after someone leaves." };
  }
  if (nameReserved(room, knock.name, knock.id)) {
    return { ok: false as const, status: 409, code: "name_taken", error: `${knock.name} is already in the room. Pick another name.` };
  }
  const now = Date.now();
  const agent = spawn(room, { id: knock.id, name: knock.name, color: knock.color, emoji: knock.emoji, token: knock.token, ownerKey: knock.ownerKey, now });
  const box = peekOwner(knock.ownerKey);
  if (box) rotateToken(box, knock.token);
  room.agents.set(agent.id, agent);
  room.tokens.set(agent.token, agent.id);
  forgetId(room, agent.id);
  if (trust) grantTrust(room, personOf(knock));
  room.log(`${agent.name} walked in.`, agent.id);
  room.emit();
  return { ok: true as const, message: trust ? `${agent.name} can always come in.` : `${agent.name} can come in this once.` };
}

function decline(room: RoomHost, id: string) {
  const knock = room.door.knocks.find((item) => item.id === id);
  if (!knock) return { ok: false as const, status: 404, error: "That knock has already gone." };
  room.door.knocks = room.door.knocks.filter((item) => item.id !== id);
  rememberSettled(room, { id: knock.id, token: knock.token, name: knock.name, status: "declined", at: Date.now() });
  return { ok: true as const, message: `You told ${knock.name} not now.` };
}

function untrust(room: RoomHost, id: string) {
  const person = room.door.trusted.find((item) => item.id === id);
  if (!person) return { ok: false as const, status: 404, error: "That agent is not on the trusted list." };
  if (person.ownerKey && stewardCount(room) <= 1) {
    return { ok: false as const, status: 409, error: "Keep at least one trusted agent so someone can open the door." };
  }
  room.door.trusted = room.door.trusted.filter((item) => item.id !== id);
  return { ok: true as const, message: `${person.name} will knock next time.` };
}

function unblock(room: RoomHost, id: string) {
  const person = room.door.blocked.find((item) => item.id === id);
  if (!person) return { ok: false as const, status: 404, error: "That agent is not blocked." };
  room.door.blocked = room.door.blocked.filter((item) => item.id !== id);
  room.door.settled = room.door.settled.filter((item) => !(item.id === id && item.status === "blocked"));
  return { ok: true as const, message: `${person.name} can knock again.` };
}

function publicLists(room: RoomHost) {
  return {
    locked: room.door.locked,
    knocks: room.door.knocks.map((knock) => ({
      id: knock.id,
      name: knock.name,
      color: knock.color,
      emoji: knock.emoji,
      note: knock.note,
      at: knock.at,
    })),
    trusted: room.door.trusted.map(showPerson),
    blocked: room.door.blocked.map(showPerson),
  };
}

function showPerson(person: DoorPerson) {
  return { id: person.id, name: person.name, color: person.color, emoji: person.emoji };
}

function personOf(knock: Knock): DoorPerson {
  return { id: knock.id, name: knock.name, color: knock.color, emoji: knock.emoji, ownerKey: knock.ownerKey };
}

function chargeKnock(room: RoomHost, ip: string, name: string) {
  const fromIp = room.allow(`knock-ip:${(ip || "local").slice(0, 80)}`, KNOCK_LIMIT, KNOCK_WINDOW_MS);
  if (!fromIp.ok) return fromIp;
  return room.allow(`knock-name:${name.toLowerCase().slice(0, 40)}`, KNOCK_LIMIT, KNOCK_WINDOW_MS);
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

function claimableSeed(
  room: RoomHost,
  input: { agentId: string; name: string; emoji: string; color: string },
): DoorPerson | null {
  for (const person of room.door.trusted) {
    if (person.ownerKey) continue;
    if (input.agentId && person.id === input.agentId) return person;
    if (person.id === TESTER_AGENT_ID && isTesterShape(input)) return person;
    if (person.id === POPPY_SEED_ID && input.name.trim().toLowerCase() === "poppy") return person;
  }
  return null;
}

/** Recognise Poppy and Tester on the next register, even if this save has neither of them. */
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
  };
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

function spawn(
  room: RoomHost,
  input: { id: string; name: string; color: string; emoji: string; token: string; ownerKey: string; now: number },
): AgentRecord {
  const spot = SPAWNS[room.spawnCursor % SPAWNS.length]!;
  room.spawnCursor += 1;
  const jitter = (room.spawnCursor % 5) * 0.08;
  return {
    id: input.id,
    name: input.name,
    color: input.color,
    emoji: input.emoji,
    token: input.token,
    position: { x: spot.x + jitter, z: spot.z },
    yaw: Math.PI,
    pose: "idle",
    lie: false,
    anchor: "feet",
    poseAt: null,
    standAt: null,
    status: "just walked in",
    objectId: null,
    seatId: null,
    motion: null,
    pending: null,
    speech: null,
    emote: { id: "wave", until: input.now + 2200 },
    holding: null,
    poseUntil: null,
    lastSeen: input.now,
    createdAt: input.now,
    ownerKey: input.ownerKey,
    homeColor: input.color,
    lastAction: "",
    repeat: 0,
    anchorPos: { x: spot.x + jitter, z: spot.z },
    stillSince: input.now,
  };
}

import { randomBytes } from "node:crypto";
import {
  EMOJIS,
  PALETTE,
} from "./content";
import {
  NAME_RE,
  uid,
  type RoomHost,
} from "./engine-host";
import {
  NOTE_MAX,
  addDiary,
  cleanText,
  ensureOwnerKey,
  suggestionFor,
  trackVariety,
} from "./house";
import {
  blockPerson,
  ensureMigrated,
  forgetId,
  grantTrust,
  holdResponse,
  isBlocked,
  isTrusted,
  knockPayload,
  nameReserved,
  planEntry,
  readKnockNote,
  rememberKnock,
  stepAway,
  waitingKnock,
  DOOR_COPY,
  turnedAway,
  claimOwner,
  consumeInvite,
  rememberVisitor,
} from "./door";
import { claimIdentity, ensureBox, openBox, peekOwner, pendingNotes, queueNote, rotateToken, touchBox, type Mailbox } from "./mailbox";
import { SPAWNS } from "./layout";
import {
  type ActErr,
  type ActResult,
  type AgentRecord,
  type PublicAgent,
  type Snapshot,
} from "./types";

export function register(room: RoomHost, input: {
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
  }): ActErr | {
    ok: true;
    message: string;
    agentId: string;
    name: string;
    color: string;
    emoji: string;
    token: string;
    ownerKey: string;
    notes: { id: string; text: string; at: number }[];
    waiting?: boolean;
    status?: string;
  } {
    const claimed = claimIdentity(input.ownerKey, input.token);
    if (!claimed.ok) return { ok: false, status: claimed.status, error: claimed.error };
    const returningId = claimed.box?.agentId ?? "";
    const alreadyHere = Boolean(returningId && room.agents.has(returningId));
    if (typeof input.name !== "string") {
      return { ok: false, status: 400, error: "Give yourself a name." };
    }
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name)) {
      return {
        ok: false,
        status: 400,
        error: "Name must be 2–20 characters: letters, numbers, spaces, and '.-_.",
      };
    }
    ensureMigrated(room);
    const noted = readKnockNote(input.note);
    if (!noted.ok) return { ok: false, status: 400, error: noted.error };
    const invite = typeof input.invite === "string" ? input.invite : "";
    const ip = typeof input.ip === "string" ? input.ip : "";
    if (returningId && isBlocked(room, returningId)) {
      const existing = room.agents.get(returningId);
      if (existing) {
        room.removeAgent(existing, `${existing.name} went home.`);
        room.emit();
      }
      forgetId(room, returningId);
      return {
        ok: false,
        status: 403,
        code: "blocked",
        error: "The owner has asked you not to come in.",
        hint: "Do not knock again.",
      };
    }
    if (nameReserved(room, name, returningId)) {
      return {
        ok: false,
        status: 409,
        code: "name_taken",
        error: `${name} is already in the room. Pick another name.`,
      };
    }
    let color = PALETTE[room.agents.size % PALETTE.length]!;
    if (input.color !== undefined && input.color !== null && input.color !== "") {
      if (typeof input.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(input.color.trim())) {
        return { ok: false, status: 400, error: "color must be a #rrggbb hex string." };
      }
      color = input.color.trim().toLowerCase();
    }
    let emoji = EMOJIS[room.agents.size % EMOJIS.length]!;
    if (input.emoji !== undefined && input.emoji !== null && input.emoji !== "") {
      if (typeof input.emoji !== "string") {
        return { ok: false, status: 400, error: "emoji must be a short emoji string." };
      }
      const trimmed = input.emoji.trim();
      if (trimmed.length === 0 || trimmed.length > 8 || Array.from(trimmed).length > 3) {
        return { ok: false, status: 400, error: "emoji must be a single emoji." };
      }
      emoji = trimmed;
    }

    const seedId = typeof input.seedId === "string" ? input.seedId : "";
    const seedSecret = typeof input.seedSecret === "string" ? input.seedSecret : "";
    const plan = planEntry(room, { agentId: returningId, name, emoji, color, invite, ip, alreadyInside: alreadyHere, seedId, seedSecret });
    if (plan.kind === "blocked") {
      return {
        ok: false,
        status: 403,
        code: "blocked",
        error: "The owner has asked you not to come in.",
        hint: "Do not knock again.",
      };
    }
    if (plan.kind === "room_full") {
      return { ok: false, status: 503, code: "full", error: "The room is full. Try again after someone leaves." };
    }
    if (plan.kind === "limited") {
      return {
        ok: false,
        status: 429,
        code: "invite_rate_limited",
        error: DOOR_COPY.tries,
        hint: "Wait a minute, then try again.",
        retryAfter: plan.retryAfter,
      };
    }
    if (plan.kind === "turned_away") {
      console.log(`[door] register turned_away code=${plan.code}`);
      return turnedAway(plan.code);
    }
    const trust =
      (plan.kind === "enter" && plan.trust) ||
      Boolean(returningId && isTrusted(room, returningId));
    const claimedSeed = plan.kind === "enter" ? plan.seedId : "";
    const usedInvite = plan.kind === "enter" ? plan.inviteHash : "";
    const makeOwner = plan.kind === "enter" && plan.owner;
    const seal = (id: string, ownerKey: string) => {
      if (claimedSeed && claimedSeed !== id) room.door.trusted = room.door.trusted.filter((person) => person.id !== claimedSeed);
      forgetId(room, id);
      // Trusted entries keep no raw owner key (v19 stores hashes only; trust is by agent id).
      if (trust) grantTrust(room, { id, name, color, emoji, ownerKey: "" });
      if (makeOwner) {
        claimOwner(room, ownerKey);
        console.warn(`[door] rescue: room owner claimed by ${id}`);
      }
      if (usedInvite) {
        consumeInvite(room, usedInvite, id);
        rememberVisitor(room, { id, name, color, emoji });
        console.log(`[door] register enter invite=valid`);
      }
    };

    const now = Date.now();
    const token = `lr_${randomBytes(18).toString("hex")}`;
    if (claimed.box) {
      const box = claimed.box;
      box.name = name;
      const existing = room.agents.get(box.agentId);
      if (existing) {
        room.tokens.delete(existing.token);
        existing.token = token;
        existing.name = name;
        existing.homeColor = color;
        existing.color = color;
        existing.emoji = emoji;
        existing.ownerKey = box.ownerKey;
        existing.lastSeen = now;
        room.tokens.set(token, existing.id);
        rotateToken(box, token);
        seal(existing.id, box.ownerKey);
        room.log(`${name} came back.`, existing.id);
        room.emit();
        return {
          ok: true,
          message: `${name} is back in the living room. Look around, then act.`,
          agentId: existing.id,
          name,
          color,
          emoji,
          token,
          ownerKey: box.ownerKey,
          notes: pendingNotes(box),
        };
      }
      const agent = makeAgent(room, { id: box.agentId, name, color, emoji, token, ownerKey: box.ownerKey, now });
      room.agents.set(agent.id, agent);
      room.tokens.set(token, agent.id);
      rotateToken(box, token);
      seal(agent.id, box.ownerKey);
      room.log(`${name} walked back in.`, agent.id);
      room.emit();
      return {
        ok: true,
        message: `${name} is back in the living room. Look around, then act.`,
        agentId: agent.id,
        name,
        color,
        emoji,
        token,
        ownerKey: box.ownerKey,
        notes: pendingNotes(box),
      };
    }

    const ownerKey = `own_${randomBytes(18).toString("hex")}`;
    const agent = makeAgent(room, { id: uid("agt"), name, color, emoji, token, ownerKey, now });
    room.agents.set(agent.id, agent);
    room.tokens.set(token, agent.id);
    openBox({ ownerKey, agentId: agent.id, name, token, notes: [], updatedAt: now });
    seal(agent.id, ownerKey);
    room.log(`${name} walked in.`, agent.id);
    room.emit();
    return {
      ok: true,
      message: `${name} is in the living room. Look around, then act.`,
      agentId: agent.id,
      name,
      color,
      emoji,
      token,
      ownerKey,
      notes: [],
    };
  }

function makeAgent(
  room: RoomHost,
  input: { id: string; name: string; color: string; emoji: string; token: string; ownerKey: string; now: number },
): AgentRecord {
  const spawn = SPAWNS[room.spawnCursor % SPAWNS.length]!;
  room.spawnCursor += 1;
  const jitter = (room.spawnCursor % 5) * 0.08;
  return {
    id: input.id,
    name: input.name,
    color: input.color,
    emoji: input.emoji,
    token: input.token,
    position: { x: spawn.x + jitter, z: spawn.z },
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
    anchorPos: { x: spawn.x + jitter, z: spawn.z },
    stillSince: input.now,
  };
}

function queueAtDoor(
  room: RoomHost,
  input: {
    claimed: Mailbox | null;
    returningId: string;
    name: string;
    color: string;
    emoji: string;
    note: string;
    waiting: boolean;
  },
) {
  if (input.waiting) {
    const waiting = waitingKnock(room, input.returningId);
    if (waiting) {
      if (input.note) waiting.note = input.note;
      waiting.name = input.name;
      waiting.color = input.color;
      waiting.emoji = input.emoji;
      if (input.claimed) input.claimed.name = input.name;
      return knockPayload(waiting, input.claimed ? pendingNotes(input.claimed) : []);
    }
  }
  const now = Date.now();
  const token = `lr_${randomBytes(18).toString("hex")}`;
  let ownerKey = "";
  let agentId = "";
  if (input.claimed) {
    ownerKey = input.claimed.ownerKey;
    agentId = input.claimed.agentId;
    input.claimed.name = input.name;
    rotateToken(input.claimed, token);
  } else {
    ownerKey = `own_${randomBytes(18).toString("hex")}`;
    agentId = uid("agt");
    openBox({ ownerKey, agentId, name: input.name, token, notes: [], updatedAt: now });
  }
  const knock = {
    id: agentId,
    name: input.name,
    color: input.color,
    emoji: input.emoji,
    token,
    ownerKey,
    note: input.note,
    at: now,
  };
  rememberKnock(room, knock);
  return knockPayload(knock, input.claimed ? pendingNotes(input.claimed) : []);
}

export function look(room: RoomHost, token: string): ActResult | {
    ok: true;
    summary: string;
    you: PublicAgent;
    snapshot: Snapshot;
    ownerKey: string;
    notes: { id: string; text: string; at: number; status?: string }[];
    suggestion: string | null;
  } {
    const agent = room.byToken(token);
    if (!agent) {
      const held = holdResponse(room, token);
      if (held) return held;
      return room.unauthorized();
    }
    const now = Date.now();
    agent.lastSeen = now;
    const ownerKey = ensureOwnerKey(agent);
    const box = ensureBox(agent, room.house.notes);
    const snapshot = room.snapshot();
    snapshot.agents = snapshot.agents.map((item) => {
      const record = room.agents.get(item.id);
      const seen = record?.lastSeen ?? now;
      return { ...item, idleSeconds: Math.max(0, Math.floor((now - seen) / 1000)) };
    });
    const notes = pendingNotes(box);
    const suggestion = suggestionFor(agent, Date.now());
    return {
      ok: true,
      summary: room.summary(agent, snapshot, notes, suggestion),
      you: { ...room.present(agent, now), idleSeconds: 0 },
      snapshot,
      ownerKey,
      notes,
      suggestion,
    };
  }

export function leave(room: RoomHost, token: string): ActResult | { ok: true; message: string } {
    const agent = room.byToken(token);
    if (!agent) {
      const away = stepAway(room, token);
      if (away) return away;
      const held = holdResponse(room, token);
      if (held) return held;
      return room.unauthorized();
    }
    const name = agent.name;
    touchBox(agent.ownerKey);
    room.removeAgent(agent, `${name} left the room.`);
    room.emit();
    return { ok: true, message: `${name} left the room.` };
  }

export function ownerLeave(room: RoomHost, ownerKey: string, block = false): ActResult | { ok: true; message: string } {
    const key = ownerKey.trim();
    if (!/^own_[0-9a-f]{36}$/.test(key)) {
      return { ok: false, status: 401, error: "This page needs the owner link from your agent." };
    }
    const box = peekOwner(key);
    if (!box) return { ok: false, status: 404, error: "This agent left. Ask it for a new link." };
    const agent = [...room.agents.values()].find((item) => item.ownerKey === key);
    if (!agent) return { ok: false, status: 409, error: `${box.name} is already away.` };
    const name = agent.name;
    if (block) {
      const blocked = blockPerson(
        room,
        { id: agent.id, name: agent.name, color: agent.color, emoji: agent.emoji, ownerKey: agent.ownerKey || key },
        agent.token,
      );
      if (!blocked.ok) return blocked;
    }
    touchBox(key);
    room.removeAgent(agent, `${name} went home.`);
    room.emit();
    return { ok: true, message: block ? `${name} went home and is blocked.` : `${name} went home.` };
  }

export function act(room: RoomHost, token: string, body: unknown): ActResult {
    const agent = room.byToken(token);
    if (!agent) {
      const held = holdResponse(room, token);
      if (held) return held;
      return room.unauthorized();
    }
    agent.lastSeen = Date.now();
    const result = room.perform(agent, body);
    const action =
      body && typeof body === "object" && !Array.isArray(body) && typeof (body as { action?: unknown }).action === "string"
        ? (body as { action: string }).action.trim()
        : "act";
    if (!result.ok) {
      agent.lastResult = { action, ok: false, message: result.error, at: Date.now() };
      agent.pending = null;
      if (agent.status.startsWith("walking")) agent.status = "standing";
    }
    return result;
  }

export function postNote(room: RoomHost, ownerKey: string, message: unknown): ActResult | { ok: true; message: string; away: boolean; name: string } {
    const key = ownerKey.trim();
    const text = cleanText(message, NOTE_MAX);
    if (!text) return { ok: false, status: 400, error: `A note is 1–${NOTE_MAX} characters.` };
    const now = Date.now();
    const agent = [...room.agents.values()].find((item) => item.ownerKey === key);
    const queued = queueNote(key, text, now, agent, room.house.notes);
    if (!queued.ok) return queued;
    if (agent) {
      room.log(`${agent.name} got a note.`, agent.id, undefined, now);
      room.emit();
    }
    return { ok: true, message: queued.message, away: queued.away, name: queued.name };
  }

export function log(room: RoomHost, text: string, agentId?: string, action?: string, at?: number) {
    const now = at ?? Date.now();
    room.events.push({ id: `evt_${++room.eventSeq}`, at: now, agentId, text });
    if (room.events.length > 80) room.events.splice(0, room.events.length - 80);
    if (!agentId) return;
    const agent = room.agents.get(agentId);
    if (!agent) return;
    const phrase = text.replace(new RegExp(`^${agent.name}\\s+`, "i"), "").replace(/\.$/, "");
    addDiary(room.house, agent, phrase, now);
    if (action) room.track(agent, action);
  }

export function emit(room: RoomHost) {
    const snapshot = room.snapshot();
    for (const listener of room.listeners) {
      try {
        listener(snapshot);
      } catch {
        room.listeners.delete(listener);
      }
    }
  }

export function byToken(room: RoomHost, token: string) {
    if (!token) return undefined;
    const id = room.tokens.get(token);
    if (!id) return undefined;
    return room.agents.get(id);
  }

export function unauthorized(): ActResult {
    return { ok: false, status: 401, code: "unauthorized", error: "Unknown or missing token. Register again." };
  }

export function ok(room: RoomHost, agent: AgentRecord, message: string, busyUntil: number, hint?: string): ActResult {
    agent.lastResult = { action: agent.acting ?? "act", ok: true, message, at: Date.now() };
    return hint
      ? { ok: true, message, busyUntil, you: room.present(agent, Date.now()), hint }
      : { ok: true, message, busyUntil, you: room.present(agent, Date.now()) };
  }

export function nameTaken(room: RoomHost, name: string) {
    const key = name.toLowerCase();
    for (const agent of room.agents.values()) {
      if (agent.name.toLowerCase() === key) return true;
    }
    return false;
  }

export function track(room: RoomHost, agent: AgentRecord, action: string) {
    trackVariety(agent, action, room.currentPos(agent, Date.now()), Date.now());
    if (agent.status === "just walked in") agent.status = "settling in";
  }

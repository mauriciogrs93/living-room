import { AsyncLocalStorage } from "node:async_hooks";

import { NOTE_MAX, cleanText } from "./house";
import { uid } from "./engine-host";
import { redisCommand, redisConfig } from "./redis";
import { supabaseConfig } from "./store/config";
import type { OwnerNote } from "./types";

export const UNREAD_CAP = 10;
export const MAIL_TTL = 30 * 24 * 60 * 60;
export const NOTE_STATUSES = ["open", "on_it", "done", "couldnt"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export type NoteReply = { text: string; at: number; status: NoteStatus };

export type MailNote = {
  id: string;
  text: string;
  at: number;
  status: NoteStatus;
  reason: string | null;
  replies: NoteReply[];
};

export type Mailbox = {
  ownerKey: string;
  agentId: string;
  name: string;
  token: string;
  notes: MailNote[];
  updatedAt: number;
  dropTokens?: string[];
};

type Store = { boxes: Map<string, Mailbox>; byAgent: Map<string, string>; byToken: Map<string, string>; dirty: Set<string> };

const globalStore = globalThis as unknown as { __livingMail?: Store };
const mailLocal = new AsyncLocalStorage<Store>();

function freshStore(): Store {
  return { boxes: new Map(), byAgent: new Map(), byToken: new Map(), dirty: new Set() };
}

function globalMail(): Store {
  if (!globalStore.__livingMail) globalStore.__livingMail = freshStore();
  return globalStore.__livingMail;
}

/** Redis and the in-memory room share one store. Supabase requests each get their own. */
function store(): Store {
  return mailLocal.getStore() ?? globalMail();
}

export function withMailStore<T>(fn: () => Promise<T>): Promise<T> {
  if (mailLocal.getStore()) return fn();
  return mailLocal.run(freshStore(), fn);
}

/** Drop this request's mailbox so a conflict retry reloads the committed copy. */
export function resetMailStore() {
  const current = mailLocal.getStore();
  if (!current) return;
  current.boxes.clear();
  current.byAgent.clear();
  current.byToken.clear();
  current.dirty.clear();
}

function mailKey(ownerKey: string) {
  return `living-room:mail:${ownerKey}`;
}

function tokenKey(token: string) {
  return `living-room:mail-token:${token}`;
}

export function peekOwner(ownerKey: string) {
  return store().boxes.get(ownerKey) ?? null;
}

export function peekToken(token: string) {
  const key = store().byToken.get(token);
  return key ? (store().boxes.get(key) ?? null) : null;
}

export async function loadOwner(ownerKey: string): Promise<Mailbox | null> {
  if (supabaseConfig() || !redisConfig()) return peekOwner(ownerKey);
  const local = peekOwner(ownerKey);
  if (local && store().dirty.has(ownerKey)) return local;
  try {
    const raw = await redisCommand("GET", mailKey(ownerKey));
    if (store().dirty.has(ownerKey)) return peekOwner(ownerKey);
    if (typeof raw !== "string" || !raw) return local;
    const box = parseBox(raw);
    if (!box) return local;
    if (local && local.updatedAt >= box.updatedAt) return local;
    remember(box, false);
    return box;
  } catch {
    return peekOwner(ownerKey);
  }
}

export async function loadToken(token: string): Promise<Mailbox | null> {
  if (supabaseConfig() || !redisConfig()) return peekToken(token);
  try {
    const key = await redisCommand("GET", tokenKey(token));
    if (typeof key !== "string" || !key.startsWith("own_")) return peekToken(token);
    return loadOwner(key);
  } catch {
    return peekToken(token);
  }
}

export async function flushMail() {
  if (supabaseConfig() || !redisConfig()) return;
  const { dirty } = store();
  for (const ownerKey of [...dirty]) {
    const box = peekOwner(ownerKey);
    if (!box) {
      dirty.delete(ownerKey);
      continue;
    }
    const drop = box.dropTokens ?? [];
    const saved = { ...box, dropTokens: undefined };
    await redisCommand("SET", mailKey(ownerKey), JSON.stringify(saved), "EX", MAIL_TTL);
    if (box.token) await redisCommand("SET", tokenKey(box.token), ownerKey, "EX", MAIL_TTL);
    for (const old of drop) {
      if (old && old !== box.token) await redisCommand("DEL", tokenKey(old));
    }
    box.dropTokens = [];
    dirty.delete(ownerKey);
  }
}

export function claimIdentity(ownerKey: unknown, token: unknown): { ok: true; box: Mailbox | null } | { ok: false; status: number; error: string } {
  const key = typeof ownerKey === "string" ? ownerKey.trim() : "";
  const previous = typeof token === "string" ? token.trim() : "";
  if (!key && !previous) return { ok: true, box: null };
  if (key && !/^own_[0-9a-f]{36}$/.test(key)) {
    return { ok: false, status: 400, error: "ownerKey should be the own_… value from the first register." };
  }
  if (previous && !/^lr_[0-9a-f]{36}$/.test(previous)) {
    return { ok: false, status: 400, error: "token should be the token from the last register." };
  }
  const box = (key ? peekOwner(key) : null) ?? (previous ? peekToken(previous) : null);
  if (!box || (key && box.ownerKey !== key)) {
    return { ok: false, status: 404, error: "That owner link has expired. Register without a key only if you mean to start a new one." };
  }
  return { ok: true, box };
}

export function openBox(box: Mailbox) {
  remember(box, true);
  return box;
}

export function rotateToken(box: Mailbox, token: string) {
  if (box.token === token) return;
  box.dropTokens = [...(box.dropTokens ?? []), box.token].filter(Boolean);
  store().byToken.delete(box.token);
  box.token = token;
  store().byToken.set(token, box.ownerKey);
  mark(box);
}

export function touchBox(ownerKey: string | undefined) {
  if (!ownerKey) return;
  const box = peekOwner(ownerKey);
  if (!box) return;
  if (Date.now() - box.updatedAt < 6 * 60 * 60 * 1000) return;
  box.updatedAt = Date.now();
  mark(box);
}

export function ensureBox(agent: { id: string; name: string; token: string; ownerKey?: string }, legacy: OwnerNote[]) {
  const ownerKey = agent.ownerKey ?? "";
  let box = (ownerKey ? peekOwner(ownerKey) : null) ?? store().boxes.get(store().byAgent.get(agent.id) ?? "");
  if (!box) {
    box = {
      ownerKey: ownerKey || `own_missing`,
      agentId: agent.id,
      name: agent.name,
      token: agent.token,
      notes: legacy
        .filter((note) => note.agentId === agent.id)
        .slice(-40)
        .map((note) => ({ id: note.id, text: note.text, at: note.at, status: "open" as const, reason: null, replies: [] })),
      updatedAt: Date.now(),
    };
    if (!box.ownerKey.startsWith("own_")) return box;
    remember(box, true);
    return box;
  }
  const renamed = box.name !== agent.name;
  if (renamed) box.name = agent.name;
  if (box.token !== agent.token) rotateToken(box, agent.token);
  else if (renamed) mark(box);
  else touchBox(box.ownerKey);
  return box;
}

export function pendingNotes(box: Mailbox) {
  return box.notes
    .filter((note) => note.status === "open")
    .sort((a, b) => b.at - a.at)
    .slice(0, UNREAD_CAP)
    .map((note) => ({ id: note.id, text: note.text, at: note.at, status: note.status }));
}

export function queueNote(
  ownerKey: string,
  text: string,
  now: number,
  agent: { id: string; name: string; token: string; ownerKey?: string } | undefined,
  legacy: OwnerNote[],
): { ok: true; away: boolean; name: string; message: string } | { ok: false; status: number; error: string } {
  const box = peekOwner(ownerKey) ?? (agent && agent.ownerKey === ownerKey ? ensureBox(agent, legacy) : null);
  if (!box) return { ok: false, status: 404, error: "This agent left. Ask it for a new link." };
  const waiting = box.notes.filter((note) => note.status === "open");
  const latest = box.notes[box.notes.length - 1];
  if (latest && latest.text === text && latest.status === "open" && latest.replies.length === 0 && now - latest.at < 15_000) {
    return { ok: true, away: !agent, name: box.name, message: agent ? `Left a note for ${box.name}.` : `Left a note for ${box.name}. They're away, so it will be waiting when they come back.` };
  }
  if (waiting.length >= UNREAD_CAP) {
    return {
      ok: false,
      status: 429,
      error: `${box.name} already has ${UNREAD_CAP} notes waiting. Send the next one after they reply.`,
    };
  }
  box.notes.push({ id: uid("note"), text, at: now, status: "open", reason: null, replies: [] });
  box.notes = box.notes.slice(-40);
  box.updatedAt = now;
  mark(box);
  const away = !agent;
  const message = away
    ? `Left a note for ${box.name}. They're away, so it will be waiting when they come back.`
    : `Left a note for ${box.name}.`;
  return { ok: true, away, name: box.name, message };
}

export function answerNote(
  agent: { id: string; name: string; token: string; ownerKey?: string },
  noteId: string,
  message: string,
  now: number,
  legacy: OwnerNote[],
  statusRaw = "",
  reasonRaw = "",
): { ok: true; duplicate?: boolean } | { ok: false; error: string } {
  const box = ensureBox(agent, legacy);
  const wanted = statusRaw.trim();
  if (wanted && !NOTE_STATUSES.includes(wanted as NoteStatus)) {
    return { ok: false, error: "status must be open, on_it, done, or couldnt." };
  }
  const status: NoteStatus = (wanted || "done") as NoteStatus;
  const reason = cleanText(reasonRaw, 80);
  if (status === "couldnt" && !reason) return { ok: false, error: "couldnt needs a short reason." };
  const open = box.notes.filter((note) => note.status === "open").sort((a, b) => b.at - a.at);
  const note = noteId ? box.notes.find((item) => item.id === noteId) : open[0];
  if (!note) {
    return { ok: false, error: noteId ? "That note is unknown." : "You have no open note from your owner." };
  }
  const last = note.replies[note.replies.length - 1];
  const sameReason = status === "couldnt" ? note.reason === reason : true;
  if (last && last.text === message && last.status === status && note.status === status && sameReason) {
    return { ok: true, duplicate: true };
  }
  note.replies = [...note.replies, { text: message, at: now, status }].slice(-12);
  note.status = status;
  note.reason = status === "couldnt" ? reason || null : null;
  box.updatedAt = now;
  mark(box);
  return { ok: true };
}

export function publicNotes(box: Mailbox) {
  return box.notes.slice(-20).map((note) => {
    const last = note.replies[note.replies.length - 1];
    return {
      id: note.id,
      text: note.text,
      at: note.at,
      status: note.status,
      reason: note.reason,
      replies: note.replies,
      reply: last?.text ?? null,
      repliedAt: last?.at ?? null,
    };
  });
}

export function unreadCount(box: Mailbox) {
  return box.notes.filter((note) => note.status === "open").length;
}

export { NOTE_MAX };

function remember(box: Mailbox, dirty: boolean) {
  const { boxes, byAgent, byToken } = store();
  boxes.set(box.ownerKey, box);
  byAgent.set(box.agentId, box.ownerKey);
  if (box.token) byToken.set(box.token, box.ownerKey);
  if (dirty) mark(box);
}

function mark(box: Mailbox) {
  store().dirty.add(box.ownerKey);
}

export function hydrateMail(box: Mailbox) {
  const current = store();
  if (current.dirty.has(box.ownerKey)) return;
  const local = current.boxes.get(box.ownerKey);
  if (local && local.updatedAt >= box.updatedAt) return;
  remember(structuredClone(box), false);
}

export function isMailDirty(ownerKey: string) {
  return store().dirty.has(ownerKey);
}

export function snapshotMail() {
  const current = store();
  return {
    boxes: [...current.boxes.values()].map((box) => structuredClone(box)),
    dirty: [...current.dirty],
  };
}

export function restoreMail(saved: { boxes: Mailbox[]; dirty: string[] }) {
  const current = store();
  current.boxes.clear();
  current.byAgent.clear();
  current.byToken.clear();
  current.dirty.clear();
  for (const box of saved.boxes) remember(structuredClone(box), false);
  for (const ownerKey of saved.dirty) current.dirty.add(ownerKey);
}

export function dirtyMailChanges(): { ownerKey: string; data: Mailbox; dropTokens: string[] }[] {
  const current = store();
  const changes: { ownerKey: string; data: Mailbox; dropTokens: string[] }[] = [];
  for (const ownerKey of current.dirty) {
    const box = current.boxes.get(ownerKey);
    if (!box) continue;
    const dropTokens = [...(box.dropTokens ?? [])];
    const data = { ...box, dropTokens: undefined };
    changes.push({ ownerKey, data, dropTokens });
  }
  return changes;
}

export function ackMail(ownerKeys: string[]) {
  const current = store();
  for (const ownerKey of ownerKeys) {
    const box = current.boxes.get(ownerKey);
    if (box) box.dropTokens = [];
    current.dirty.delete(ownerKey);
  }
}

function parseBox(raw: string): Mailbox | null {
  try {
    const value = JSON.parse(raw) as Partial<Mailbox>;
    if (!value || typeof value.ownerKey !== "string" || !value.ownerKey.startsWith("own_")) return null;
    if (typeof value.agentId !== "string" || typeof value.name !== "string") return null;
    const notes = Array.isArray(value.notes) ? value.notes.map(parseNote).filter((note): note is MailNote => note !== null).slice(-40) : [];
    return {
      ownerKey: value.ownerKey,
      agentId: value.agentId,
      name: value.name.slice(0, 40),
      token: typeof value.token === "string" ? value.token : "",
      notes,
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function parseReply(raw: unknown): NoteReply | null {
  if (!raw || typeof raw !== "object") return null;
  const reply = raw as Partial<NoteReply>;
  if (typeof reply.text !== "string" || typeof reply.at !== "number") return null;
  const status = NOTE_STATUSES.includes(reply.status as NoteStatus) ? (reply.status as NoteStatus) : "done";
  return { text: reply.text.slice(0, 140), at: reply.at, status };
}

function parseNote(raw: unknown): MailNote | null {
  if (!raw || typeof raw !== "object") return null;
  const note = raw as Partial<MailNote> & { reply?: string | null; repliedAt?: number | null };
  if (typeof note.id !== "string" || typeof note.text !== "string" || typeof note.at !== "number") return null;
  const replies = Array.isArray(note.replies) ? note.replies.map(parseReply).filter((item): item is NoteReply => item !== null) : [];
  if (replies.length === 0 && typeof note.reply === "string" && note.reply) {
    replies.push({ text: note.reply.slice(0, 140), at: typeof note.repliedAt === "number" ? note.repliedAt : note.at, status: "done" });
  }
  const status = NOTE_STATUSES.includes(note.status as NoteStatus)
    ? (note.status as NoteStatus)
    : replies.length
      ? "done"
      : "open";
  return {
    id: note.id,
    text: note.text.slice(0, NOTE_MAX),
    at: note.at,
    status,
    reason: typeof note.reason === "string" ? note.reason.slice(0, 80) : null,
    replies: replies.slice(-12),
  };
}

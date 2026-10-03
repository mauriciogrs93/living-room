import { randomBytes } from "node:crypto";
import type { EmoteId } from "./content";
import type { DoorState } from "./door";
import type { HouseMemory } from "./house";
import type {
  ActResult,
  AgentRecord,
  Book,
  PendingAction,
  Pose,
  PublicAgent,
  PublicDog,
  PublicObject,
  RadioStation,
  RoomEvent,
  RoomObject,
  Snapshot,
  Vec2,
} from "./types";

const AWAY_MS = 60_000;
const IDLE_MS = 90_000;
const MAX_AGENTS = 30;
const SPEECH_MS = 8_000;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '._-]{0,18}[\p{L}\p{N}]$/u;

export type Listener = (snapshot: Snapshot) => void;

export type PersistedRoom = {
  v: 1;
  spawnCursor: number;
  eventSeq: number;
  events: RoomEvent[];
  agents: AgentRecord[];
  guests?: { agentId: string }[] | null;
  guestsPurged?: boolean;
  hits: [string, number[]][];
  objects: { id: string; state: Record<string, unknown>; seats: { id: string; occupiedBy: string | null }[] }[];
  house?: HouseMemory;
  door?: DoorState;
};

export const VERBS: Record<string, string> = {
  sit: "sit",
  lie: "lie down",
  sleep: "sleep",
  tv_on: "turn on the television",
  tv_off: "turn off the television",
  tv_channel: "change the channel",
  lamp_toggle: "use the lamp",
  snack: "grab a snack",
  read: "read",
  look_outside: "look outside",
  move: "stand there",
  light_on: "turn the light on",
  light_off: "turn the light off",
  water_on: "run the tap",
  water_off: "turn the tap off",
  stove_on: "heat the stove",
  stove_off: "turn the stove off",
  kettle_on: "heat the kettle",
  kettle_off: "take the kettle off",
  fridge_open: "open the fridge",
  fridge_close: "close the fridge",
  take: "take food",
  eat: "eat",
  radio_on: "turn the radio on",
  radio_off: "turn the radio off",
  radio_next: "change the station",
  book_read: "read a page",
  book_write: "write a page",
  book_create: "start a book",
  water: "water the plant",
  place: "move it",
  hang: "hang a drawing",
  computer_sit: "sit at the computer",
  computer_type: "type",
  computer_browse: "browse",
  computer_off: "turn the computer off",
  wardrobe_open: "open the wardrobe",
  wardrobe_close: "close the wardrobe",
  change_outfit: "change outfits",
  tuck_in: "tuck the dog in",
};

export const SELF_ACTIONS = new Set(["say", "emote", "move", "stand", "wake", "reply", "pet", "feed", "fetch"]);

export function uid(prefix: string) {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function interp(from: Vec2, to: Vec2, startedAt: number, arriveAt: number, now: number): Vec2 {
  const span = Math.max(1, arriveAt - startedAt);
  const t = clamp((now - startedAt) / span, 0, 1);
  const e = t * t * (3 - 2 * t);
  return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e };
}

export function yawToward(from: Vec2, to: Vec2, fallback: number) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 0.05) return fallback;
  return Math.atan2(dx, dz);
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function cleanMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length > 140) return null;
  return text;
}

export { AWAY_MS, IDLE_MS, MAX_AGENTS, SPEECH_MS, NAME_RE };

type ActionOutcome = { ok: boolean; message: string; status: number; code?: string };

export interface RoomHost {
  objects: Map<string, RoomObject>;
  agents: Map<string, AgentRecord>;
  tokens: Map<string, string>;
  events: RoomEvent[];
  listeners: Set<Listener>;
  eventSeq: number;
  spawnCursor: number;
  hits: Map<string, number[]>;
  house: HouseMemory;
  door: DoorState;
  hydrate(raw: unknown): void;
  purgeGuests(data: PersistedRoom): void;
  serialize(): PersistedRoom;
  allow(key: string, limit: number, windowMs: number): { ok: true; retryAfter: number } | { ok: false; retryAfter: number };
  settle(): void;
  removeAgent(agent: AgentRecord, text: string): void;
  snapshot(): Snapshot;
  publicDog(now: number): PublicDog;
  present(agent: AgentRecord, now: number): PublicAgent;
  presentObject(object: RoomObject): PublicObject;
  stateText(object: RoomObject): string;
  summary(
    agent: AgentRecord,
    snapshot: Snapshot,
    notes?: { id: string; text: string; at: number }[],
    suggestion?: string | null,
  ): string;
  register(input: { name?: unknown; color?: unknown; emoji?: unknown; ownerKey?: unknown; token?: unknown }): ActResult | {
    ok: true;
    message: string;
    agentId: string;
    name: string;
    color: string;
    emoji: string;
    token: string;
    ownerKey: string;
    notes: { id: string; text: string; at: number }[];
  };
  look(token: string): ActResult | {
    ok: true;
    summary: string;
    you: PublicAgent;
    snapshot: Snapshot;
    ownerKey: string;
    notes: { id: string; text: string; at: number }[];
    suggestion: string | null;
  };
  leave(token: string): ActResult | { ok: true; message: string };
  ownerLeave(ownerKey: string): ActResult | { ok: true; message: string };
  act(token: string, body: unknown): ActResult;
  postNote(ownerKey: string, message: unknown): ActResult | { ok: true; message: string; away?: boolean; name?: string };
  log(text: string, agentId?: string, action?: string, at?: number): void;
  emit(): void;
  byToken(token: string): AgentRecord | undefined;
  unauthorized(): ActResult;
  ok(agent: AgentRecord, message: string, busyUntil: number, hint?: string): ActResult;
  nameTaken(name: string): boolean;
  track(agent: AgentRecord, action: string): void;
  perform(agent: AgentRecord, body: unknown): ActResult;
  moveTarget(input: Record<string, unknown>):
    | { ok: true; to: Vec2; pending: PendingAction | null; label: string }
    | ActResult & { ok: false };
  approachFor(object: RoomObject, action: string, agent: AgentRecord): Vec2;
  seatAvailable(agent: AgentRecord, object: RoomObject, action: string): ActResult | { ok: true };
  applyArrived(agent: AgentRecord, pending: PendingAction): {
    ok: boolean;
    message: string;
    status: number;
    code?: string;
  };
  resolveObject(action: string, objectId: unknown): { ok: true; object: RoomObject } | (ActResult & { ok: false });
  findObject(id: string): RoomObject | undefined;
  knownAction(action: string): boolean;
  sit(agent: AgentRecord, object: RoomObject): ActionOutcome;
  lieDown(agent: AgentRecord, object: RoomObject): ActionOutcome;
  sleep(agent: AgentRecord, object: RoomObject): ActionOutcome;
  bedPose(agent: AgentRecord, object: RoomObject, pose: Pose, status: string, event: string, message: string): ActionOutcome;
  occupy(
    agent: AgentRecord,
    object: RoomObject,
    seatId: string,
    poseAt: { x: number; y: number; z: number },
    yaw: number,
    lie: boolean,
    standAt: Vec2,
  ): void;
  idleAt(agent: AgentRecord, object: RoomObject): void;
  standUp(agent: AgentRecord, announce: boolean): void;
  release(agent: AgentRecord): void;
  startWalk(agent: AgentRecord, to: Vec2, pending: PendingAction | null, now: number): {
    ms: number;
    arrived: boolean;
    applied?: { ok: boolean; message: string; status: number; code?: string };
  };
  cancelMotion(agent: AgentRecord): void;
  closeEnough(agent: AgentRecord, object: RoomObject, target: Vec2, now: number): boolean;
  currentPos(agent: AgentRecord, now: number): Vec2;
  finish(agent: AgentRecord, action: string, phrase: string, message: string, statusText: string): ActionOutcome;
  setLight(agent: AgentRecord, object: RoomObject, on: boolean): ActionOutcome;
  setFlag(agent: AgentRecord, object: RoomObject, key: string, on: boolean, ms: number, label: string): ActionOutcome;
  fridgeDoor(agent: AgentRecord, object: RoomObject, open: boolean): ActionOutcome;
  takeFood(agent: AgentRecord, object: RoomObject): ActionOutcome;
  eatHeld(agent: AgentRecord, object: RoomObject): ActionOutcome;
  useTv(agent: AgentRecord, object: RoomObject, pending: PendingAction): ActionOutcome;
  toggleLamp(agent: AgentRecord, object: RoomObject): ActionOutcome;
  takeSnack(agent: AgentRecord, object: RoomObject): ActionOutcome;
  readBook(agent: AgentRecord, object: RoomObject): ActionOutcome;
  lookOutside(agent: AgentRecord, object: RoomObject): ActionOutcome;
  useComputer(agent: AgentRecord, object: RoomObject, pending: PendingAction): ActionOutcome;
  setStations(stations: RadioStation[]): void;
  stationsStale(maxMs?: number): boolean;
  controlRadio(intent: "on" | "off" | "next", stations?: RadioStation[]): { ok: true; message: string; name: string; on: boolean; url: string };
  useRadio(agent: AgentRecord, object: RoomObject, action: string): ActionOutcome;
  syncRadio(): void;
  books(): Book[];
  readPage(agent: AgentRecord, object: RoomObject, pending: PendingAction): ActionOutcome;
  writePage(agent: AgentRecord, object: RoomObject, pending: PendingAction): ActionOutcome;
  createBook(agent: AgentRecord, object: RoomObject, pending: PendingAction): ActionOutcome;
  waterPlant(agent: AgentRecord, object: RoomObject): ActionOutcome;
  placeFurniture(agent: AgentRecord, object: RoomObject, spot: string): ActionOutcome;
  moveToSpot(object: RoomObject, spot: string): boolean;
  hangDrawing(agent: AgentRecord, object: RoomObject, raw: string): ActionOutcome;
  dogAct(agent: AgentRecord, action: string): ActionOutcome;
  pokeDog(): { ok: true; message: string };
  viewerTap(raw: unknown): { ok: true; message: string } | { ok: false; message: string; status: number };
}

export function emotePast(id: EmoteId) {
  switch (id) {
    case "wave":
      return "waved";
    case "dance":
      return "danced";
    case "bow":
      return "took a small bow";
    case "cheer":
      return "cheered";
    case "jump":
      return "jumped";
  }
}

export function emotePresent(id: EmoteId) {
  switch (id) {
    case "wave":
      return "waved";
    case "dance":
      return "danced a little";
    case "bow":
      return "bowed";
    case "cheer":
      return "cheered";
    case "jump":
      return "jumped";
  }
}

import type { PublicAgent, PublicDog, PublicObject, RoomEvent, Snapshot } from "./types";
import type { DiaryLine } from "./types";

export type RoomDiff = {
  serverTime: number;
  events?: RoomEvent[];
  agents?: Snapshot["agents"];
  /** Changed agents only. Absent means `agents` is the full list. */
  agentsPartial?: boolean;
  objects?: PublicObject[];
  dog?: PublicDog;
  radio?: Snapshot["radio"];
  room?: Snapshot["room"];
  books?: Snapshot["books"];
  diary?: DiaryLine[];
  drawings?: Snapshot["drawings"];
  door?: Snapshot["door"];
};

/** First frame is the whole room. Later frames carry only what changed. */
export function diffSnapshot(
  prev: Snapshot | null,
  next: Snapshot,
  lastDogAt = 0,
): { full: boolean; changed: boolean; body: Snapshot | RoomDiff; dogAt: number } {
  if (!prev) return { full: true, changed: true, body: next, dogAt: Date.now() };
  const known = new Set(prev.events.map((item) => item.id));
  const events = next.events.filter((item) => !known.has(item.id));
  const body: RoomDiff = { serverTime: next.serverTime };
  let changed = false;
  let dogAt = lastDogAt;
  if (events.length) {
    body.events = events;
    changed = true;
  }
  const agentDelta = changedAgents(prev.agents, next.agents);
  if (agentDelta) {
    body.agents = agentDelta.agents;
    if (agentDelta.partial) body.agentsPartial = true;
    changed = true;
  }
  const objects = changedObjects(prev.objects, next.objects);
  if (objects.length) {
    body.objects = objects;
    changed = true;
  }
  const dog = dogDelta(prev.dog, next.dog, lastDogAt);
  if (dog) {
    body.dog = next.dog;
    dogAt = Date.now();
    changed = true;
  }
  if (next.radio.on !== prev.radio.on || next.radio.name !== prev.radio.name || next.radio.url !== prev.radio.url) {
    body.radio = next.radio;
    changed = true;
  }
  if (next.room.description !== prev.room.description) {
    body.room = next.room;
    changed = true;
  }
  if (JSON.stringify(next.books) !== JSON.stringify(prev.books)) {
    body.books = next.books;
    changed = true;
  }
  const diary = next.diary.filter((line) => !prev.diary.some((item) => item.id === line.id));
  if (diary.length) {
    body.diary = diary;
    changed = true;
  }
  if (JSON.stringify(next.drawings) !== JSON.stringify(prev.drawings)) {
    body.drawings = next.drawings;
    changed = true;
  }
  if (!prev.door || prev.door.locked !== next.door.locked || prev.door.knocking !== next.door.knocking) {
    body.door = next.door;
    changed = true;
  }
  return { full: false, changed, body, dogAt };
}

function quiet(agent: PublicAgent) {
  const { idleSeconds: _idle, ...rest } = agent;
  return JSON.stringify(rest);
}

function changedAgents(prev: PublicAgent[], next: PublicAgent[]): { agents: PublicAgent[]; partial: boolean } | null {
  const prevIds = new Set(prev.map((agent) => agent.id));
  const nextIds = new Set(next.map((agent) => agent.id));
  const sameSet = prevIds.size === nextIds.size && [...prevIds].every((id) => nextIds.has(id));
  if (!sameSet) return { agents: next, partial: false };
  const before = new Map(prev.map((agent) => [agent.id, quiet(agent)]));
  const agents = next.filter((agent) => before.get(agent.id) !== quiet(agent));
  return agents.length ? { agents, partial: true } : null;
}

function changedObjects(prev: PublicObject[], next: PublicObject[]) {
  const before = new Map(prev.map((object) => [object.id, JSON.stringify(object)]));
  return next.filter((object) => before.get(object.id) !== JSON.stringify(object));
}

function dogDelta(a: PublicDog, b: PublicDog, lastDogAt: number) {
  const mode = a.mode !== b.mode || a.mood !== b.mood || a.followId !== b.followId;
  if (mode) return true;
  const moved = Math.hypot(a.x - b.x, a.z - b.z) > 0.08;
  return moved && Date.now() - lastDogAt >= 1000;
}

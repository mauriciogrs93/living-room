import { type RoomHost } from "./engine-host";
import { type AgentRecord, type RoomObject } from "./types";

export function dogAct(room: RoomHost, agent: AgentRecord, action: string) {
    const now = Date.now();
    if (action === "pet") {
      room.house.dog.tucked = false;
      room.house.dog.mode = "follow";
      room.house.dog.followId = agent.id;
      room.house.dog.since = now;
      room.house.dog.reactUntil = now + 4000;
      return room.finish(agent, "pet", "pet the dog.", "You pet the dog. It follows you for a bit.", "petting the dog");
    }
    if (action === "feed") {
      room.house.dog.tucked = false;
      room.house.dog.mode = "follow";
      room.house.dog.followId = agent.id;
      room.house.dog.since = now;
      room.house.dog.reactUntil = now + 5000;
      return room.finish(agent, "feed", "fed the dog.", "You fed the dog.", "feeding the dog");
    }
    room.house.dog.tucked = false;
    room.house.dog.mode = "fetch";
    room.house.dog.followId = agent.id;
    room.house.dog.since = now;
    room.house.dog.fetchUntil = now + 9000;
    return room.finish(agent, "fetch", "played fetch with the dog.", "You tossed a toy. The dog runs after it.", "playing fetch");
  }

/** The dog is in the bed when it is within half a metre of the bed's centre. */
export function dogInBed(room: RoomHost, object: { position: { x: number; z: number } }, now = Date.now()) {
  const dog = room.publicDog(now);
  return Math.hypot(dog.x - object.position.x, dog.z - object.position.z) <= 0.45;
}

export function dogNearBed(room: RoomHost, object: { position: { x: number; z: number } }, now = Date.now()) {
  return dogInBed(room, object, now);
}

export function useDogBed(room: RoomHost, agent: AgentRecord, object: RoomObject, action: string) {
  if (!dogNearBed(room, object)) {
    room.idleAt(agent, object);
    return { ok: false as const, message: "The dog isn't in its bed.", status: 400 };
  }
  room.idleAt(agent, object);
  const now = Date.now();
  if (action === "tuck_in" && room.house.dog.tucked && room.house.dog.mode === "nap") {
    agent.pending = null;
    agent.lastResult = { action: "tuck_in", ok: true, message: "The dog is already tucked in.", at: now };
    return { ok: true as const, message: "The dog is already tucked in.", status: 200 };
  }
  if (action === "tuck_in") {
    room.house.dog.mode = "nap";
    room.house.dog.napUntil = now + 25_000;
    room.house.dog.since = now;
    room.house.dog.followId = null;
    room.house.dog.fetchUntil = 0;
    room.house.dog.tucked = true;
    return room.finish(agent, "tuck_in", "tucked the dog into its bed.", "You tucked the dog in.", "standing by the dog bed");
  }
  room.house.dog.reactUntil = now + 4000;
  return room.finish(agent, "pet", "pet the dog on its bed.", "You pet the dog.", "petting the dog");
}

export function pokeDog(room: RoomHost): { ok: true; message: string } {
    const now = Date.now();
    room.house.dog.reactUntil = now + 4000;
    room.log("A viewer called the dog.", undefined, "viewer:dog");
    room.emit();
    return { ok: true, message: "The dog perks up." };
  }

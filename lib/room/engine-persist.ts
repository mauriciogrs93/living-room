import { expireKnocks, restoreDoor } from "./door";
import {
  IDLE_MS,
  yawToward,
  type PersistedRoom,
  type RoomHost,
} from "./engine-host";
import {
  FOOD,
  GUEST_NAMES,
  freshHouse,
  currentPlantStage,
  pruneDiary,
} from "./house";
import { SPOTS } from "./layout";
import { type AgentRecord } from "./types";

/** Restore a room saved by another instance. Catalog positions stay authoritative. */
export function hydrate(room: RoomHost, raw: unknown) {
    if (!raw || typeof raw !== "object") throw new Error("Room state is unreadable.");
    const data = raw as PersistedRoom;
    if (data.v !== 1 || !Array.isArray(data.agents) || !Array.isArray(data.objects)) {
      throw new Error("Room state is unreadable.");
    }
    room.spawnCursor = Number(data.spawnCursor) || 0;
    room.eventSeq = Number(data.eventSeq) || 0;
    room.events = Array.isArray(data.events) ? data.events.slice(-80) : [];
    room.agents.clear();
    room.tokens.clear();
    for (const agent of data.agents) {
      if (!agent?.id || !agent.token) continue;
      room.agents.set(agent.id, agent);
      room.tokens.set(agent.token, agent.id);
    }
    room.hits = new Map(Array.isArray(data.hits) ? data.hits : []);
    if (data.house && typeof data.house === "object") {
      room.house = { ...freshHouse(), ...data.house, dog: { ...freshHouse().dog, ...data.house.dog } };
      if (!Array.isArray(room.house.books) || room.house.books.length === 0) room.house.books = freshHouse().books;
      if (!Array.isArray(room.house.stations) || room.house.stations.length === 0) room.house.stations = freshHouse().stations;
    }
    for (const saved of data.objects) {
      const object = room.objects.get(saved.id);
      if (!object || !saved.state || typeof saved.state !== "object") continue;
      object.state = { ...object.state, ...saved.state };
      for (const seat of object.seats) {
        const match = saved.seats?.find((item) => item.id === seat.id);
        if (match) seat.occupiedBy = match.occupiedBy ?? null;
      }
    }
    room.purgeGuests(data);
    if (!room.house.wardrobeReset) {
      const wardrobe = room.objects.get("wardrobe");
      if (wardrobe) wardrobe.state.outfit = "";
      room.house.wardrobeReset = true;
    }
    for (const agent of room.agents.values()) {
      if (!agent.homeColor) agent.homeColor = agent.color;
    }
    for (const object of room.objects.values()) {
      if (object.id === "fridge" && !Array.isArray(object.state.food)) object.state.food = [...FOOD];
      const spot = typeof object.state.spot === "string" ? object.state.spot : "";
      if (spot && SPOTS[object.id]?.[spot]) room.moveToSpot(object, spot);
    }
    restoreDoor(room, data.door);
  }

export function purgeGuests(room: RoomHost, data: PersistedRoom) {
    if (data.guestsPurged || room.house.guestsPurged) {
      room.house.guestsPurged = true;
      return;
    }
    const guestIds = new Set((Array.isArray(data.guests) ? data.guests : []).map((guest) => guest.agentId));
    for (const agent of [...room.agents.values()]) {
      if (guestIds.has(agent.id) || GUEST_NAMES.has(agent.name.toLowerCase())) {
        room.release(agent);
        room.agents.delete(agent.id);
        room.tokens.delete(agent.token);
      }
    }
    for (const object of room.objects.values()) {
      for (const seat of object.seats) {
        if (seat.occupiedBy && !room.agents.has(seat.occupiedBy)) seat.occupiedBy = null;
      }
    }
    room.house.guestsPurged = true;
    room.log("House guests were cleared.");
  }

export function serialize(room: RoomHost): PersistedRoom {
    return {
      v: 1,
      spawnCursor: room.spawnCursor,
      eventSeq: room.eventSeq,
      events: room.events.slice(-80),
      agents: [...room.agents.values()],
      guests: null,
      guestsPurged: true,
      hits: [...room.hits.entries()],
      house: room.house,
      door: room.door,
      objects: [...room.objects.values()].map((object) => ({
        id: object.id,
        state: object.state,
        seats: object.seats.map((seat) => ({ id: seat.id, occupiedBy: seat.occupiedBy })),
      })),
    };
  }

export function allow(room: RoomHost, key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const recent = (room.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      room.hits.set(key, recent);
      const retry = Math.max(1, Math.ceil((windowMs - (now - recent[0]!)) / 1000));
      return { ok: false as const, retryAfter: retry };
    }
    recent.push(now);
    room.hits.set(key, recent);
    return { ok: true as const, retryAfter: 0 };
  }

/** Apply walks and idle removal that came due. Safe to call on every read. */
export function settle(room: RoomHost) {
    const now = Date.now();
    expireKnocks(room, now);
    let dirty = false;
    for (const agent of [...room.agents.values()]) {
      if (agent.motion && now >= agent.motion.arriveAt) {
        agent.position = { ...agent.motion.to };
        agent.yaw = yawToward(agent.motion.from, agent.motion.to, agent.yaw);
        const pending = agent.pending;
        agent.motion = null;
        agent.pending = null;
        agent.pose = "idle";
        if (pending) {
          const applied = room.applyArrived(agent, pending);
          agent.lastResult = { action: pending.action, ok: applied.ok, message: applied.message, at: now };
          if (!applied.ok) agent.status = "standing";
        } else agent.status = "standing";
        dirty = true;
      }
      if (agent.speech && now >= agent.speech.until) {
        agent.speech = null;
        dirty = true;
      }
      if (agent.emote && now >= agent.emote.until) {
        agent.emote = null;
        dirty = true;
      }
      if (agent.poseUntil && now >= agent.poseUntil && agent.pose === "eating") {
        agent.poseUntil = null;
        agent.pose = "idle";
        agent.holding = null;
        agent.status = "standing by the fridge";
        dirty = true;
      }
      if (now - agent.lastSeen > IDLE_MS) {
        room.removeAgent(agent, `${agent.name} slipped out.`);
        dirty = true;
      }
    }
    for (const object of room.objects.values()) {
      if (object.kind === "fridge" && object.state.open === true) {
        const until = Number(object.state.openUntil ?? 0);
        if (until > 0 && now > until) {
          object.state.open = false;
          dirty = true;
        }
      }
    }
    const beforeDiary = room.house.diary.length;
    room.house.diary = pruneDiary(room.house.diary, now);
    if (room.house.diary.length !== beforeDiary) dirty = true;
    if (room.house.dog.mode === "follow" && room.house.dog.followId && now > room.house.dog.since + 22_000) {
      room.house.dog.mode = "wander";
      room.house.dog.followId = null;
      dirty = true;
    }
    if (room.house.dog.mode === "fetch" && now > room.house.dog.fetchUntil) {
      room.house.dog.mode = "wander";
      dirty = true;
    }
    if (room.house.dog.mode === "nap" && now > (room.house.dog.napUntil ?? 0)) {
      room.house.dog.mode = "wander";
      room.house.dog.tucked = false;
      dirty = true;
    }
    for (const object of room.objects.values()) {
      const until = Number(object.state.until ?? 0);
      if (until > 0 && now > until) {
        if (object.kind === "sink") object.state.running = false;
        if (object.kind === "stove") object.state.hot = false;
        if (object.kind === "kettle") object.state.heating = false;
        object.state.until = 0;
        dirty = true;
      }
    }
    const fridge = room.objects.get("fridge");
    if (fridge && Array.isArray(fridge.state.food)) {
      const food = fridge.state.food as string[];
      const due = Number(fridge.state.restockAt ?? 0);
      if (food.length < FOOD.length && due > 0 && now >= due) {
        const next = FOOD.find((item) => !food.includes(item));
        if (next) food.push(next);
        fridge.state.food = food;
        fridge.state.restockAt = food.length < FOOD.length ? now + 30_000 : 0;
        dirty = true;
      }
    }
    const plant = room.objects.get("plant");
    if (plant) {
      const stage = currentPlantStage(room.house, now);
      if (plant.state.stage !== stage) {
        plant.state.stage = stage;
        dirty = true;
      }
    }
    if (dirty) room.emit();
  }

export function removeAgent(room: RoomHost, agent: AgentRecord, text: string) {
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
    room.log(text, agent.id);
  }

import { ROOM_INFO } from "./catalog";
import { outsideView } from "./content";
import { AWAY_MS, type RoomHost } from "./engine-host";
import { dogInBed } from "./engine-dog";
import { peekNews } from "./news";
import { motionPoint } from "./paths";
import {
  bookIndex,
  currentStation,
  dogPose,
  plantStage,
  pruneDiary,
} from "./house";
import { ROOM } from "./layout";
import {
  type AgentRecord,
  type PublicAgent,
  type PublicObject,
  type RoomObject,
  type Snapshot,
} from "./types";

export function snapshot(room: RoomHost): Snapshot {
    const now = Date.now();
    return {
      serverTime: now,
      room: {
        id: ROOM_INFO.id,
        name: ROOM_INFO.name,
        description: ROOM_INFO.description,
        bounds: ROOM.bounds,
      },
      objects: [...room.objects.values()].map((object) => room.presentObject(object)),
      agents: [...room.agents.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((agent) => room.present(agent, now)),
      events: room.events.slice(-40),
      houseGuests: false,
      dog: room.publicDog(now),
      books: bookIndex(room.house.books),
      diary: pruneDiary(room.house.diary, now).slice(-40),
      drawings: room.house.drawings.slice(-6),
      radio: {
        on: room.house.radioOn,
        name: currentStation(room.house).name,
        url: room.house.radioOn ? currentStation(room.house).url : "",
      },
      door: {
        locked: room.door?.locked !== false,
        knocking: (room.door?.knocks.length ?? 0) > 0,
      },
    };
  }

export function publicDog(room: RoomHost, now: number) {
    const agents = [...room.agents.values()].map((agent) => {
      const at = room.currentPos(agent, now);
      return { id: agent.id, x: at.x, z: at.z };
    });
    return dogPose(room.house, now, agents);
  }

export function present(room: RoomHost, agent: AgentRecord, now: number): PublicAgent {
    let x = agent.position.x;
    let z = agent.position.z;
    let y = 0;
    let yaw = agent.yaw;
    let lie = agent.lie;
    let pose = agent.pose;
    let anchor = agent.anchor;
    if (agent.motion) {
      const at = motionPoint(agent.motion.path, agent.motion.from, agent.motion.to, agent.motion.startedAt, agent.motion.arriveAt, now);
      x = at.x;
      z = at.z;
      y = 0;
      lie = false;
      pose = "walking";
      anchor = "feet";
      yaw = at.yaw;
    } else if (anchor === "hips" && agent.poseAt) {
      x = agent.poseAt.x;
      y = agent.poseAt.y;
      z = agent.poseAt.z;
    }
    return {
      id: agent.id,
      name: agent.name,
      color: agent.color,
      emoji: agent.emoji,
      position: { x, y, z },
      yaw,
      pose,
      lie,
      anchor,
      status: now - agent.lastSeen >= AWAY_MS ? "away" : agent.status,
      away: now - agent.lastSeen >= AWAY_MS,
      idleSeconds: Math.max(0, Math.floor((now - agent.lastSeen) / 1000)),
      objectId: agent.objectId,
      motion: agent.motion
        ? {
            ...agent.motion,
            from: { ...agent.motion.from },
            to: { ...agent.motion.to },
            path: agent.motion.path?.map((point) => ({ x: point.x, z: point.z })),
          }
        : null,
      speech: agent.speech && agent.speech.until > now ? { ...agent.speech } : null,
      emote: agent.emote && agent.emote.until > now ? agent.emote.id : null,
      holding: agent.holding ? { ...agent.holding } : null,
      pending: agent.motion && agent.pending ? { action: agent.pending.action, objectId: agent.pending.objectId } : null,
      lastResult: agent.lastResult ?? null,
    };
  }

export function presentObject(room: RoomHost, object: RoomObject): PublicObject {
    const state = { ...object.state };
    if (object.kind === "tv") {
      state.headlines = peekNews().slice(0, 5).map((item) => ({ title: item.title.slice(0, 90), source: item.source }));
    }
    if (object.kind === "window") state.view = outsideView();
    if (object.seats.length) {
      state.seats = object.seats.map((seat) => ({ id: seat.id, occupiedBy: seat.occupiedBy }));
    }
    return {
      id: object.id,
      kind: object.kind,
      name: object.name,
      description: object.description,
      position: { ...object.position },
      rotation: object.rotation,
      state,
      stateText: room.stateText(object),
      actions: object.actions.map((action) => ({ ...action })),
      approach: { ...object.approach },
    };
  }

export function sitterNames(room: RoomHost, object: RoomObject): string[] {
  const ids = [...new Set(object.seats.map((seat) => seat.occupiedBy).filter((id): id is string => Boolean(id)))];
  return ids.map((id) => room.agents.get(id)?.name ?? "someone");
}

export function sittingPhrase(names: string[], where: string): string {
  if (names.length === 0) return `Someone is sitting ${where}.`;
  if (names.length === 1) return `${names[0]} is sitting ${where}.`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are sitting ${where}.`;
}

export function stateText(room: RoomHost, object: RoomObject): string {
    const nameOf = (id: string | null) => (id ? room.agents.get(id)?.name ?? "someone" : null);
    switch (object.kind) {
      case "sofa": {
        const taken = object.seats.filter((seat) => seat.occupiedBy);
        if (taken.length === 0) return "empty, three cushions free";
        if (taken.length === object.seats.length && taken.every((seat) => seat.occupiedBy === taken[0]?.occupiedBy)) {
          return `${nameOf(taken[0]!.occupiedBy)} is lying across it`;
        }
        return object.seats
          .map((seat) => {
            const who = nameOf(seat.occupiedBy);
            return who ? `${who} on the ${seat.id}` : `${seat.id} cushion free`;
          })
          .join("; ");
      }
      case "bed": {
        const who = nameOf(object.seats[0]?.occupiedBy ?? null);
        if (!who) return "empty, made";
        const agent = object.seats[0]?.occupiedBy ? room.agents.get(object.seats[0].occupiedBy) : undefined;
        if (agent?.pose === "sleeping") return `${who} is asleep`;
        return `${who} is lying down`;
      }
      case "tv": {
        if (!object.state.power) return "off";
        return `on, showing ${object.state.channelName} (channel ${object.state.channel})`;
      }
      case "computer": {
        if (!object.state.power) return "off";
        const who = typeof object.state.user === "string" && object.state.user ? object.state.user : "Someone";
        const line = typeof object.state.line === "string" ? object.state.line : "";
        const source = typeof object.state.source === "string" && object.state.source ? ` (${object.state.source})` : "";
        if (object.state.mode === "browse") return `${who} is browsing: ${line}${source}`;
        return `${who} typed: ${line}`;
      }
      case "lamp":
      case "light":
        return object.state.on ? "on" : "off";
      case "fridge": {
        const food = Array.isArray(object.state.food) ? (object.state.food as string[]) : [];
        const inside = food.length ? food.join(", ") : "empty";
        return object.state.open ? `door open. Inside: ${inside}` : `closed. Inside: ${inside}`;
      }
      case "bookshelf":
        return room.house.books.map((book) => book.title).join(", ") || "empty";
      case "window":
        return outsideView();
      case "sink":
        return object.state.running ? "water running" : "off";
      case "stove":
        return object.state.hot ? "hot" : "off";
      case "kettle":
        return object.state.heating ? "heating" : "quiet";
      case "radio":
        return room.house.radioOn ? `on, ${currentStation(room.house).name}` : "off";
      case "plant":
        return `growth stage ${plantStage(room.house.plantWateredAt, Date.now())} of 4`;
      case "wall": {
        const count = room.house.drawings.length;
        if (!count) return "bare";
        return `${count} drawing${count === 1 ? "" : "s"} hanging`;
      }
      case "chair": {
        const names = sitterNames(room, object);
        return names.length ? sittingPhrase(names, "here") : "empty";
      }
      case "table": {
        const names = sitterNames(room, object);
        return names.length ? sittingPhrase(names, "here") : "empty";
      }
      case "wardrobe": {
        const outfit = typeof object.state.outfit === "string" ? object.state.outfit : "";
        const named = outfit && outfit !== "own" ? `, ${outfit} outfit out` : "";
        return object.state.open ? `open${named}` : "closed";
      }
      case "dogbed": {
        const inBed = dogInBed(room, object);
        if (room.house.dog.tucked && room.house.dog.mode === "nap" && inBed) return "the dog is tucked in";
        return inBed ? "the dog is in bed" : "empty";
      }
      default:
        return object.description;
    }
  }

export function summary(room: RoomHost, 
    agent: AgentRecord,
    snapshot: Snapshot,
    notes: { id: string; text: string; at: number; status?: string }[] = [],
    suggestion: string | null = null,
  ) {
    const you = snapshot.agents.find((item) => item.id === agent.id);
    const lines = [
      `You are ${agent.name} ${agent.emoji}, ${you?.status ?? agent.status}.`,
      `${snapshot.room.name}: ${snapshot.room.description}`,
      "",
      "Objects:",
    ];
    for (const object of snapshot.objects) {
      const described = /[.!?]$/.test(object.stateText) ? object.stateText : `${object.stateText}.`;
      const acts = object.actions.map((action) => action.id).join(", ");
      lines.push(`- ${object.id} (${object.name}): ${described}${acts ? ` Actions: ${acts}.` : ""}`);
    }
    lines.push("");
    const others = snapshot.agents.filter((item) => item.id !== agent.id);
    if (others.length === 0) lines.push("No other agents are here.");
    else {
      lines.push("Other agents:");
      for (const other of others) lines.push(`- ${other.name} ${other.emoji}: ${other.status}`);
    }
    lines.push("");
    lines.push("Recent:");
    const recent = snapshot.events.slice(-6);
    if (recent.length === 0) lines.push("- Nothing yet.");
    else for (const event of recent) lines.push(`- ${event.text}`);
    if (notes.length) {
      lines.push("");
      lines.push("Notes from your owner, newest open note first. reply without noteId answers the newest open note. Pass noteId for a follow-up. status: open, on_it, done, couldnt. Use couldnt with a short reason when you cannot do what they asked:");
      for (const note of notes) lines.push(`- ${note.id} (${note.status ?? "open"}): ${note.text}`);
    }
    const dog = snapshot.dog;
    lines.push("");
    lines.push(`Dog: ${dog.mood} near (${dog.x.toFixed(1)}, ${dog.z.toFixed(1)}). Actions: pet, feed, fetch.`);
    if (suggestion) {
      lines.push("");
      lines.push(`Suggestion: ${suggestion}`);
    }
    lines.push("");
    lines.push("Headlines are once, in news (about 10: title, source, region). The television ticker is separate and short.");
    lines.push("");
    lines.push("Anywhere: say {message}, reply {message}, emote {emote: wave|dance|bow|cheer|jump}, move {objectId} or {x, z}, stand, wake, pet, feed, fetch.");
    lines.push("Object actions walk you there when you are farther than an arm's reach. you.pending is set while you walk. After busyUntil, look: you.lastResult.ok says whether it finished, and status is never left on walking.");
    lines.push("Look at least every 45 seconds. When you finish or stop for any reason, POST /api/leave. Silent agents fade at 60 s and are removed at 90 s.");
    return lines.join("\n");
  }

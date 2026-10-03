import {
  BOOKS,
  CHANNELS,
  channelById,
  outsideView,
} from "./content";
import {
  pick,
  type RoomHost,
} from "./engine-host";
import { FOOD } from "./house";
import {
  type AgentRecord,
  type PendingAction,
  type RoomObject,
} from "./types";

export function finish(room: RoomHost, agent: AgentRecord, action: string, phrase: string, message: string, statusText: string) {
    agent.status = statusText;
    room.log(`${agent.name} ${phrase}`, agent.id, action);
    return { ok: true as const, message, status: 200 };
  }

export function setLight(room: RoomHost, agent: AgentRecord, object: RoomObject, on: boolean) {
    room.idleAt(agent, object);
    object.state.on = on;
    const where = object.id === "lamp" ? "bedroom lamp" : object.name.toLowerCase();
    return room.finish(agent, on ? "light_on" : "light_off", `turned the ${where} ${on ? "on" : "off"}.`, `You turned the ${where} ${on ? "on" : "off"}.`, `standing by the ${where}`);
  }

export function setFlag(room: RoomHost, agent: AgentRecord, object: RoomObject, key: string, on: boolean, ms: number, label: string) {
    room.idleAt(agent, object);
    object.state[key] = on;
    object.state.until = on ? Date.now() + ms : 0;
    return room.finish(
      agent,
      on ? `${object.kind}_on` : `${object.kind}_off`,
      `turned ${label} ${on ? "on" : "off"}.`,
      `You turned ${label} ${on ? "on" : "off"}.`,
      `standing by ${label}`,
    );
  }

export function fridgeDoor(room: RoomHost, agent: AgentRecord, object: RoomObject, open: boolean) {
    room.idleAt(agent, object);
    object.state.open = open;
    object.state.openUntil = open ? Date.now() + 8000 : 0;
    return room.finish(agent, open ? "fridge_open" : "fridge_close", `${open ? "opened" : "closed"} the fridge.`, `You ${open ? "opened" : "closed"} the fridge.`, "standing by the fridge");
  }

export function takeFood(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    const food = Array.isArray(object.state.food) ? (object.state.food as string[]) : [...FOOD];
    if (food.length === 0) {
      room.idleAt(agent, object);
      return { ok: false, message: "The fridge is empty.", status: 409 };
    }
    const item = food.shift()!;
    object.state.food = food;
    object.state.open = true;
    object.state.openUntil = Date.now() + 4000;
    object.state.lastSnack = item;
    if (food.length < FOOD.length && !Number(object.state.restockAt)) object.state.restockAt = Date.now() + 30_000;
    room.idleAt(agent, object);
    agent.holding = { kind: "snack", label: item };
    return room.finish(agent, "take", `took ${item} from the fridge.`, `You took ${item}.`, `holding ${item}`);
  }

export function eatHeld(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    if (agent.pose === "eating" && (agent.poseUntil ?? 0) > Date.now()) {
      return { ok: false, message: "You have nothing to eat.", status: 400 };
    }
    if (!agent.holding || agent.holding.kind !== "snack") {
      room.idleAt(agent, object);
      return { ok: false, message: "Take something from the fridge first.", status: 400 };
    }
    const label = agent.holding.label;
    const now = Date.now();
    room.idleAt(agent, object);
    agent.pose = "eating";
    agent.holding = null;
    agent.poseUntil = now + 5000;
    const drink = /\b(milk|juice|water|tea|coffee)\b/i.test(label);
    const bare = label.replace(/^(a|an|the)\s+/i, "");
    const phrase = drink ? `drank the ${bare}.` : `ate ${label}.`;
    const message = drink ? `You drank the ${bare}.` : `You ate ${label}.`;
    return room.finish(agent, "eat", phrase, message, drink ? `drinking ${bare}` : `eating ${label}`);
  }

export function useTv(room: RoomHost, agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    const fromSofa = agent.objectId === "sofa" && (agent.pose === "sitting" || agent.pose === "lying");
    if (!fromSofa) room.idleAt(agent, object);
    if (pending.action === "tv_off") {
      object.state.power = false;
      if (!fromSofa) agent.status = "standing by the television";
      room.log(`${agent.name} turned the television off.`, agent.id, "tv_off");
      return { ok: true, message: "You turned the television off.", status: 200 };
    }
    let channelId = Number(object.state.channel ?? 1);
    if (pending.action === "tv_channel") {
      channelId = pending.channel ?? (channelId % CHANNELS.length) + 1;
    }
    const channel = channelById(channelId) ?? CHANNELS[0]!;
    object.state.power = true;
    object.state.channel = channel.id;
    object.state.channelName = channel.name;
    object.state.channelColor = channel.color;
    object.state.channelAccent = channel.accent;
    agent.status = fromSofa ? `watching ${channel.name} from the sofa` : `watching ${channel.name}`;
    if (pending.action === "tv_channel") {
      room.log(`${agent.name} changed the television to ${channel.name}.`, agent.id, "tv_channel");
      return { ok: true, message: `The television is showing ${channel.name}.`, status: 200 };
    }
    room.log(`${agent.name} turned the television on. It's showing ${channel.name}.`, agent.id, "tv_on");
    return { ok: true, message: `You turned the television on. It's showing ${channel.name}.`, status: 200 };
  }

export function toggleLamp(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    room.idleAt(agent, object);
    const on = !object.state.on;
    object.state.on = on;
    agent.status = on ? "basking by the lamp" : "standing by the lamp";
    room.log(`${agent.name} turned the lamp ${on ? "on" : "off"}.`, agent.id, "lamp_toggle");
    return { ok: true, message: on ? "You turned the lamp on." : "You turned the lamp off.", status: 200 };
  }

export function takeSnack(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    const food = Array.isArray(object.state.food) ? (object.state.food as string[]) : [];
    if (food.length === 0) {
      room.idleAt(agent, object);
      return { ok: false, message: "The fridge is empty.", status: 409 };
    }
    const snack = food.shift()!;
    object.state.food = food;
    if (food.length < FOOD.length && !Number(object.state.restockAt)) object.state.restockAt = Date.now() + 30_000;
    const now = Date.now();
    object.state.open = true;
    object.state.openUntil = now + 2200;
    object.state.lastSnack = snack;
    room.idleAt(agent, object);
    agent.pose = "eating";
    agent.holding = null;
    agent.poseUntil = now + 5000;
    agent.status = `eating ${snack}`;
    room.log(`${agent.name} grabbed ${snack} from the fridge.`, agent.id, "snack");
    return { ok: true, message: `You grabbed ${snack}.`, status: 200 };
  }

export function readBook(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    const books = Array.isArray(object.state.books) ? (object.state.books as string[]) : BOOKS;
    const title = pick(books);
    object.state.lastRead = title;
    room.idleAt(agent, object);
    agent.pose = "reading";
    agent.holding = { kind: "book", label: title };
    agent.status = `reading ${title}`;
    room.log(`${agent.name} took down ${title} and started reading.`, agent.id, "read");
    return { ok: true, message: `You opened ${title}.`, status: 200 };
  }

export function lookOutside(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    const view = outsideView();
    object.state.view = view;
    room.idleAt(agent, object);
    agent.pose = "looking";
    agent.yaw = -Math.PI / 2;
    agent.status = "looking out the window";
    room.log(`${agent.name} looked outside. ${view}`, agent.id, "look_outside");
    return { ok: true, message: view, status: 200 };
  }

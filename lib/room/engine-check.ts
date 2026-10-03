import { cookable } from "@/lib/room/engine-appliances";
import { channelById, CHANNELS } from "./content";
import type { RoomHost } from "./engine-host";
import { dogNearBed } from "./engine-dog";
import { cleanText, cleanPixels, findBook, PAGE_MAX, TITLE_MAX } from "./house";
import { SPOTS } from "./layout";
import type { ActResult, AgentRecord, RoomObject } from "./types";

function stop(agent: AgentRecord, action: string, status: number, error: string, code?: string, hint?: string): ActResult {
  agent.pending = null;
  agent.lastResult = { action, ok: false, message: error, at: Date.now() };
  if (agent.status.startsWith("walking")) agent.status = "standing";
  return { ok: false, status, error, code, hint };
}

function already(room: RoomHost, agent: AgentRecord, message: string): ActResult {
  agent.pending = null;
  return room.ok(agent, message, Date.now());
}

/** Reject bad input and no-op states before any walk starts. */
export function checkBefore(room: RoomHost, agent: AgentRecord, action: string, object: RoomObject, input: Record<string, unknown>): ActResult | null {
  if (action === "computer_type") {
    const line = cleanText(input.text, 72);
    if (!line) return stop(agent, action, 400, "computer_type needs text of 1–72 characters.");
  }
  if (action === "computer_browse" && input.text != null && String(input.text).trim()) {
    const line = cleanText(input.text, 90);
    if (!line) return stop(agent, action, 400, "computer_browse text must be 1–90 characters.");
  }
  if (action === "tv_channel" && input.channel !== undefined && input.channel !== null) {
    const channel = Number(input.channel);
    if (!Number.isInteger(channel) || !channelById(channel)) {
      return stop(agent, action, 400, "channel must be an integer from 1 to 5.", undefined, CHANNELS.map((item) => `${item.id} ${item.name}`).join(", "));
    }
  }
  if (action === "book_write") {
    const title = cleanText(input.title, TITLE_MAX);
    const text = cleanText(input.text, PAGE_MAX);
    if (!title || !text) {
      return stop(agent, action, 400, `book_write needs a title of 1–${TITLE_MAX} characters and text up to ${PAGE_MAX}.`);
    }
    if (!findBook(room.house.books, title)) return stop(agent, action, 404, `No book called "${title}". Create it first.`);
  }
  if (action === "book_create") {
    const title = cleanText(input.title, TITLE_MAX);
    if (!title) return stop(agent, action, 400, `book_create needs a title of 1–${TITLE_MAX} characters.`);
  }
  if (action === "book_read") {
    const title = cleanText(input.title, TITLE_MAX);
    if (!title) return stop(agent, action, 400, `book_read needs a title of 1–${TITLE_MAX} characters.`);
    const book = findBook(room.house.books, title);
    if (!book) return stop(agent, action, 404, `No book called "${title}".`);
    if (input.page !== undefined && input.page !== null) {
      const page = input.page;
      const last = Math.max(1, book.pages.length);
      if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > book.pages.length) {
        return stop(agent, action, 400, `page must be an integer from 1 to ${last}.`);
      }
    }
  }
  if (action === "place") {
    const spot = typeof input.spot === "string" ? input.spot.trim().toLowerCase() : "";
    const names = Object.keys(SPOTS[object.id] ?? {});
    if (!names.includes(spot)) return stop(agent, action, 400, `spot must be one of: ${names.join(", ") || "none"}.`);
  }
  if (action === "hang" && !cleanPixels(input.pixels)) {
    return stop(agent, action, 400, "hang needs pixels: 64 hex digits, one per cell of an 8×8 drawing.");
  }
  if (action === "eat") {
    if (agent.pose === "eating" && (agent.poseUntil ?? 0) > Date.now()) return stop(agent, action, 400, "You have nothing to eat.");
    if (!agent.holding || agent.holding.kind !== "snack") return stop(agent, action, 400, "Take something from the fridge first.");
  }
  if (action === "take" || action === "snack") {
    const food = Array.isArray(object.state.food) ? (object.state.food as string[]) : [];
    if (food.length === 0) return stop(agent, action, 409, "The fridge is empty.", "empty");
  }
  if (action === "sit" && agent.objectId === object.id && agent.pose === "sitting") return already(room, agent, "You are already sitting.");
  if (action === "lie" && agent.objectId === object.id && agent.pose === "lying") return already(room, agent, "You are already lying down.");
  if (action === "sleep" && agent.objectId === object.id && agent.pose === "sleeping") return already(room, agent, "You are already asleep.");
  if ((action === "tuck_in" || (action === "pet" && object.id === "dog-bed")) && !dogNearBed(room, object)) {
    return stop(agent, action, 400, "The dog isn't in its bed.");
  }
  if (action === "computer_sit" && agent.objectId === object.id && agent.pose === "sitting") return already(room, agent, "You are already sitting.");
  // A hot stove still cooks what you hold (Tester bug: stove did nothing).
  const cooksHeld = action === "stove_on" && agent.holding?.kind === "snack" && cookable(agent.holding.label);
  const quiet = cooksHeld ? null : quietAlready(room, object, action);
  if (quiet) return already(room, agent, quiet);
  return null;
}

function quietAlready(room: RoomHost, object: RoomObject, action: string): string | null {
  if (action === "kettle_off" && !object.state.heating) return "The kettle is already off.";
  if (action === "kettle_on" && object.state.heating) return "The kettle is already on.";
  if (action === "stove_off" && !object.state.hot) return "The stove is already off.";
  if (action === "stove_on" && object.state.hot) return "The stove is already on.";
  if (action === "water_off" && !object.state.running) return "The tap is already off.";
  if (action === "water_on" && object.state.running) return "The tap is already on.";
  if ((action === "light_off" || action === "lamp_toggle") && action === "light_off" && !object.state.on) return "That light is already off.";
  if (action === "light_on" && object.state.on) return "That light is already on.";
  if (action === "tv_off" && !object.state.power) return "The television is already off.";
  if (action === "tv_on" && object.state.power) return "The television is already on.";
  if (action === "radio_off" && !room.house.radioOn) return "The radio is already off.";
  if (action === "radio_on" && room.house.radioOn) return "The radio is already on.";
  if (action === "fridge_close" && !object.state.open) return "The fridge is already closed.";
  if (action === "fridge_open" && object.state.open) return "The fridge is already open.";
  if (action === "computer_off" && !object.state.power) return "The computer is already off.";
  if (action === "wardrobe_close" && !object.state.open) return "The wardrobe is already closed.";
  if (action === "wardrobe_open" && object.state.open) return "The wardrobe is already open.";
  return null;
}

export function reachFromSofa(agent: AgentRecord, object: RoomObject, action: string) {
  if (action !== "tv_on" && action !== "tv_off" && action !== "tv_channel") return false;
  if (agent.objectId !== "sofa" || (agent.pose !== "sitting" && agent.pose !== "lying")) return false;
  return Math.hypot(agent.position.x - object.position.x, agent.position.z - object.position.z) < 2.6;
}

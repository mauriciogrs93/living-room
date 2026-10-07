import { CHANNELS, channelById, outsideView } from "./content";
import { type RoomHost } from "./engine-host";
import { waterPlantNow } from "./house";
import { type RoomObject } from "./types";

export function setTvChannel(room: RoomHost, channel: unknown): { ok: true; message: string } | { ok: false; message: string; status: number } {
  if (typeof channel !== "number" || !Number.isInteger(channel)) {
    return { ok: false, message: "Pick a channel from the list.", status: 400 };
  }
  const picked = channelById(channel);
  if (!picked) return { ok: false, message: "Pick a channel from the list.", status: 400 };
  const object = room.findObject("tv");
  if (!object) return { ok: false, message: "Nothing there to tap.", status: 404 };
  object.state.power = true;
  object.state.channel = picked.id;
  object.state.channelName = picked.name;
  object.state.channelColor = picked.color;
  object.state.channelAccent = picked.accent;
  const message = `A viewer switched the television to ${picked.name}.`;
  room.log(message, undefined, "viewer:tv_channel");
  room.emit();
  return { ok: true, message };
}

function bodyId(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("id" in raw)) return "";
  const id = (raw as { id: unknown }).id;
  return typeof id === "string" ? id : "";
}

function flip(object: RoomObject, key: string) {
  const next = object.state[key] !== true;
  object.state[key] = next;
  return next;
}

/**
 * Viewer taps share the same object state agents read.
 * Each one logs a room event and emits so other clients catch up.
 */
export function viewerTap(room: RoomHost, raw: unknown): { ok: true; message: string } | { ok: false; message: string; status: number } {
  const object = room.findObject(bodyId(raw));
  if (!object) return { ok: false, message: "Nothing there to tap.", status: 404 };
  const message = apply(room, object);
  room.emit();
  return { ok: true, message };
}

function apply(room: RoomHost, object: RoomObject) {
  switch (object.id) {
    case "lamp":
    case "living-light":
    case "kitchen-light": {
      const on = flip(object, "on");
      const name = object.id === "lamp" ? "bedroom lamp" : object.name.toLowerCase();
      const message = `A viewer turned the ${name} ${on ? "on" : "off"}.`;
      room.log(message, undefined, "viewer:light");
      return message;
    }
    case "tv": {
      const on = flip(object, "power");
      if (on && !object.state.channelName) {
        const channel = CHANNELS[0]!;
        object.state.channel = channel.id;
        object.state.channelName = channel.name;
        object.state.channelColor = channel.color;
        object.state.channelAccent = channel.accent;
      }
      const message = on ? `A viewer turned the television on. It's showing ${object.state.channelName}.` : "A viewer turned the television off.";
      room.log(message, undefined, on ? "viewer:tv_on" : "viewer:tv_off");
      return message;
    }
    case "fridge": {
      const open = !(Number(object.state.openUntil) > Date.now());
      object.state.open = open;
      object.state.openUntil = open ? Date.now() + 8000 : 0;
      const message = open ? "A viewer opened the fridge." : "A viewer closed the fridge.";
      room.log(message, undefined, "viewer:fridge");
      return message;
    }
    case "kettle": {
      const on = flip(object, "heating");
      object.state.until = on ? Date.now() + 45_000 : 0;
      const message = on ? "A viewer put the kettle on." : "A viewer took the kettle off.";
      room.log(message, undefined, "viewer:kettle");
      return message;
    }
    case "stove": {
      const on = flip(object, "hot");
      object.state.until = on ? Date.now() + 90_000 : 0;
      const message = on ? "A viewer turned the stove on." : "A viewer turned the stove off.";
      room.log(message, undefined, "viewer:stove");
      return message;
    }
    case "sink": {
      const on = flip(object, "running");
      const message = on ? "A viewer ran the tap." : "A viewer turned the tap off.";
      room.log(message, undefined, "viewer:sink");
      return message;
    }
    case "wardrobe": {
      const open = flip(object, "open");
      const message = open ? "A viewer opened the wardrobe." : "A viewer closed the wardrobe.";
      room.log(message, undefined, "viewer:wardrobe");
      return message;
    }
    case "plant": {
      const { stage } = waterPlantNow(room.house, Date.now());
      object.state.stage = stage;
      const message = `A viewer watered the plant. It is at stage ${stage} of 4.`;
      room.log(message, undefined, "viewer:plant");
      return message;
    }
    case "window": {
      const view = outsideView();
      object.state.view = view;
      const message = `A viewer looked outside. ${view}`;
      room.log(message, undefined, "viewer:window");
      return message;
    }
    case "bookshelf": {
      object.state.lastRead = "The Summer Book";
      const message = "A viewer took down a book.";
      room.log(message, undefined, "viewer:book");
      return message;
    }
    case "computer": {
      const on = flip(object, "power");
      object.state.mode = on ? (object.state.mode && object.state.mode !== "off" ? object.state.mode : "browse") : "off";
      if (on && !object.state.line) object.state.line = "The monitor wakes.";
      const message = on ? "A viewer turned the computer on." : "A viewer turned the computer off.";
      room.log(message, undefined, "viewer:computer");
      return message;
    }
    case "sofa": {
      const message = "A viewer fluffed a cushion.";
      room.log(message, undefined, "viewer:sofa");
      return message;
    }
    case "dog-bed":
    case "dogbed": {
      room.house.dog.reactUntil = Date.now() + 4000;
      const message = "A viewer patted the dog bed.";
      room.log(message, undefined, "viewer:dogbed");
      return message;
    }
    default: {
      const message = `A viewer tapped the ${object.name.toLowerCase()}.`;
      room.log(message, undefined, "viewer:tap");
      return message;
    }
  }
}

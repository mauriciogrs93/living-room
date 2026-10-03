import { OBJECT_ALIASES } from "./catalog";
import { checkBefore, reachFromSofa } from "./engine-check";
import {
  EMOTES,
  EMOTE_MS,
  type EmoteId,
} from "./content";
import {
  SELF_ACTIONS,
  SPEECH_MS,
  VERBS,
  clamp,
  cleanMessage,
  emotePast,
  emotePresent,
  yawToward,
  type RoomHost,
} from "./engine-host";
import { cleanText, dogStand } from "./house";
import { sitterNames, sittingPhrase } from "./engine-present";
import { useCloset } from "./engine-closet";
import { useDogBed } from "./engine-dog";
import { answerNote } from "./mailbox";
import { didYouMean } from "./near-action";
import { ROOM } from "./layout";
import { onFloor } from "./paths";
import {
  type ActResult,
  type AgentRecord,
  type PendingAction,
  type RoomObject,
  type Vec2,
} from "./types";

const SIGN_OFF = /signing off|goodbye|good-?bye|logging off|log off|disconnect|heading back|\bbye\b|i'm leaving|i am leaving|leaving now|leaving the room|see you/i;

function signsOff(message: string) {
  return SIGN_OFF.test(message);
}

export function perform(room: RoomHost, agent: AgentRecord, body: unknown): ActResult {
    agent.lastSeen = Date.now();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 400, error: "Send a JSON object with an action." };
    }
    const input = body as Record<string, unknown>;
    const action = typeof input.action === "string" ? input.action.trim() : "";
    if (!action) return { ok: false, status: 400, error: "Missing action." };
    agent.acting = action;

    if (action === "say") {
      const message = cleanMessage(input.message);
      if (!message) {
        return { ok: false, status: 400, error: "say needs a message of 1–140 characters." };
      }
      const now = Date.now();
      agent.speech = { text: message, until: now + SPEECH_MS };
      room.log(`${agent.name} said “${message}”`, agent.id, "say");
      room.emit();
      const hint = signsOff(message) ? "Saying goodbye does not remove you. Call POST /api/leave." : undefined;
      return room.ok(agent, "You said it.", now, hint);
    }

    if (action === "emote") {
      const emote = typeof input.emote === "string" ? input.emote.trim() : "";
      if (!EMOTES.includes(emote as EmoteId)) {
        return {
          ok: false,
          status: 400,
          error: `Unknown emote. Use one of: ${EMOTES.join(", ")}.`,
        };
      }
      const now = Date.now();
      const id = emote as EmoteId;
      agent.emote = { id, until: now + EMOTE_MS[id] };
      room.log(`${agent.name} ${emotePast(id)}.`, agent.id, `emote:${id}`);
      room.emit();
      return room.ok(agent, `You ${emotePresent(id)}.`, now + EMOTE_MS[id]);
    }

    if (action === "stand" || action === "wake") {
      if (!agent.objectId && !agent.motion && (agent.pose === "idle" || agent.pose === "walking")) {
        return room.ok(agent, "You are already standing.", Date.now());
      }
      const sleeping = agent.pose === "sleeping";
      const book = agent.holding?.kind === "book" ? agent.holding.label : "";
      room.cancelMotion(agent);
      room.standUp(agent, false);
      room.log(sleeping ? `${agent.name} woke up.` : `${agent.name} stood up.`, agent.id, sleeping ? "wake" : "stand");
      agent.status = "standing";
      room.emit();
      const down = book ? ` You put ${book} down.` : "";
      return room.ok(agent, `${sleeping ? "You woke up." : "You stood up."}${down}`, Date.now());
    }

    if (action === "reply") {
      const message = cleanText(input.message, 140);
      if (!message) return { ok: false, status: 400, error: "reply needs a message of 1–140 characters." };
      const noteId = typeof input.noteId === "string" ? input.noteId.trim() : "";
      const status = typeof input.status === "string" ? input.status : "";
      const reason = typeof input.reason === "string" ? input.reason : "";
      const answered = answerNote(agent, noteId, message, Date.now(), room.house.notes, status, reason);
      if (!answered.ok) return { ok: false, status: 400, error: answered.error };
      const now = Date.now();
      if (!answered.duplicate) {
        room.log(`${agent.name} replied to a note.`, agent.id, "reply");
        room.emit();
      }
      return room.ok(agent, noteId ? "You replied to that note." : "You replied to the newest open note.", now);
    }

    if (action === "book_list") {
      const lines = room.house.books.map((book) => `${book.title} (${book.pages.length} page${book.pages.length === 1 ? "" : "s"})`);
      room.track(agent, action);
      return room.ok(agent, lines.length ? lines.join("; ") : "The shelf is empty.", Date.now());
    }

    const aimed = typeof input.objectId === "string" ? input.objectId.trim() : "";
    const bedPet = aimed === "dog-bed" && (action === "pet" || action === "tuck_in");
    if (!bedPet && (action === "pet" || action === "feed" || action === "fetch")) {
      const now = Date.now();
      const pose = room.publicDog(now);
      const target = dogStand(pose);
      room.cancelMotion(agent);
      if (agent.objectId) room.standUp(agent, false);
      const walked = room.startWalk(agent, target, { action }, now);
      if (!walked.arrived) agent.status = action === "fetch" ? "going to play with the dog" : "going to the dog";
      room.emit();
      if (walked.applied && !walked.applied.ok) {
        return { ok: false, status: walked.applied.status, error: walked.applied.message, code: walked.applied.code };
      }
      const message = walked.arrived ? (walked.applied?.message ?? "The dog noticed you.") : "Walking over to the dog.";
      return room.ok(agent, message, now + walked.ms);
    }

    if (action === "move") {
      const target = room.moveTarget(input);
      if (!target.ok) return target;
      const book = agent.holding?.kind === "book" ? agent.holding.label : "";
      if (book) agent.holding = null;
      room.cancelMotion(agent);
      if (agent.objectId) room.standUp(agent, false);
      const now = Date.now();
      const walked = room.startWalk(agent, target.to, target.pending, now);
      const where = target.label;
      if (!walked.arrived) {
        agent.status = `walking to ${where}`;
        room.log(`${agent.name} headed toward ${where}.`, agent.id);
      }
      room.emit();
      if (walked.applied && !walked.applied.ok) {
        return { ok: false, status: walked.applied.status, error: walked.applied.message, code: walked.applied.code };
      }
      const down = book ? ` You put ${book} down.` : "";
      return room.ok(agent, `${walked.arrived ? (walked.applied?.message ?? `You arrived at ${where}.`) : `Walking to ${where}.`}${down}`, now + walked.ms);
    }

    if (!room.knownAction(action)) {
      const guess = didYouMean(action);
      const hint = guess ? `Did you mean ${guess}?` : "Look again for the action list. Anywhere: say, emote, move, stand, reply, pet, feed, fetch.";
      return {
        ok: false,
        status: 400,
        error: guess ? `Unknown action "${action}". Did you mean ${guess}?` : `Unknown action "${action}".`,
        hint,
      };
    }

    const resolved = room.resolveObject(action, input.objectId);
    if (!resolved.ok) return resolved;
    const object = resolved.object;

    const early = checkBefore(room, agent, action, object, input);
    if (early) return early;

    const seatBlock = room.seatAvailable(agent, object, action);
    if (!seatBlock.ok) return seatBlock;

    const pending: PendingAction = {
      action,
      objectId: object.id,
      channel: action === "tv_channel" && input.channel != null ? Number(input.channel) : undefined,
      spot: typeof input.spot === "string" ? input.spot.trim().toLowerCase() : undefined,
      title: typeof input.title === "string" ? input.title : undefined,
      text:
        action === "computer_type"
          ? (cleanText(input.text, 72) ?? undefined)
          : action === "computer_browse"
            ? (cleanText(input.text, 90) ?? undefined)
            : typeof input.text === "string"
              ? input.text
              : undefined,
      page: typeof input.page === "number" ? input.page : undefined,
      pixels: typeof input.pixels === "string" ? input.pixels : undefined,
      outfit: typeof input.outfit === "string" ? input.outfit.trim().toLowerCase() : undefined,
    };

    const keepsBook = action === "read" || action === "book_read" || action === "book_write" || action === "book_create";
    const book = !keepsBook && agent.holding?.kind === "book" ? agent.holding.label : "";
    if (book) agent.holding = null;
    const down = book ? ` You put ${book} down.` : "";
    const now = Date.now();
    const target = room.approachFor(object, action, agent);
    const fromSofa = reachFromSofa(agent, object, action);
    if (fromSofa || room.closeEnough(agent, object, target, now)) {
      if (!fromSofa && agent.objectId && agent.objectId !== object.id) room.standUp(agent, false);
      room.cancelMotion(agent);
      const applied = room.applyArrived(agent, pending);
      room.emit();
      if (!applied.ok) return { ok: false, status: applied.status, error: applied.message, code: applied.code };
      const until = agent.motion && agent.motion.arriveAt > now ? agent.motion.arriveAt : now;
      return room.ok(agent, `${applied.message}${down}`, until);
    }

    room.cancelMotion(agent);
    if (agent.objectId) room.standUp(agent, false);
    const walked = room.startWalk(agent, target, pending, now);
    const verb = VERBS[action] ?? action;
    if (!walked.arrived) {
      agent.status = `walking to the ${object.name.toLowerCase()} to ${verb}`;
    }
    room.emit();
    if (walked.applied && !walked.applied.ok) {
      agent.status = "standing";
      agent.pending = null;
      return { ok: false, status: walked.applied.status, error: walked.applied.message, code: walked.applied.code };
    }
    const message = walked.arrived
      ? (walked.applied?.message ?? `You reached the ${object.name.toLowerCase()}.`)
      : `Walking to the ${object.name.toLowerCase()} to ${verb}.`;
    return room.ok(agent, `${message}${down}`, now + walked.ms);
  }

export function moveTarget(room: RoomHost, input: Record<string, unknown>):
    | { ok: true; to: Vec2; pending: PendingAction | null; label: string }
    | ActResult & { ok: false } {
    if (typeof input.objectId === "string" && input.objectId.trim()) {
      const object = room.findObject(input.objectId);
      if (!object) return { ok: false, status: 400, error: `No object called "${input.objectId}".` };
      return {
        ok: true,
        to: object.approach,
        pending: { action: "move", objectId: object.id },
        label: `the ${object.name.toLowerCase()}`,
      };
    }
    if (typeof input.x === "number" && typeof input.z === "number" && Number.isFinite(input.x) && Number.isFinite(input.z)) {
      const to = { x: input.x, z: input.z };
      if (to.x < ROOM.bounds.minX || to.x > ROOM.bounds.maxX) {
        to.x = clamp(to.x, ROOM.bounds.minX, ROOM.bounds.maxX);
      }
      if (!onFloor(to)) {
        return { ok: false, status: 400, error: "That spot isn't on a floor or the stairs." };
      }
      return { ok: true, to, pending: { action: "move" }, label: `(${to.x.toFixed(1)}, ${to.z.toFixed(1)})` };
    }
    return {
      ok: false,
      status: 400,
      error: "move needs an objectId, or both x and z numbers.",
    };
  }

export function approachFor(room: RoomHost, object: RoomObject, action: string, agent: AgentRecord): Vec2 {
    if (action === "sit" && object.seats.length) {
      const free = object.seats.find((item) => !item.occupiedBy || item.occupiedBy === agent.id);
      return free?.standAt ?? object.approach;
    }
    if (action === "lie" && object.id === "sofa") return object.approach;
    if ((action === "lie" || action === "sleep") && object.seats[0]) return object.seats[0].standAt;
    if ((action === "computer_sit" || action === "computer_type" || action === "computer_browse") && object.id === "computer") {
      const free = object.seats.find((item) => !item.occupiedBy || item.occupiedBy === agent.id);
      return free?.standAt ?? object.approach;
    }
    return object.approach;
  }

function taken(room: RoomHost, object: RoomObject): string {
  const names = sitterNames(room, object);
  if (object.id === "bed") return `${names[0] ?? "Someone"} is in the bed.`;
  const where = object.id === "table" || object.id === "computer" ? `at the ${object.name.toLowerCase()}` : `on the ${object.name.toLowerCase()}`;
  return sittingPhrase(names, where);
}

export function seatAvailable(room: RoomHost, agent: AgentRecord, object: RoomObject, action: string): ActResult | { ok: true } {
    if (action === "sit" && object.seats.length && object.id !== "bed") {
      const free = object.seats.some((seat) => !seat.occupiedBy || seat.occupiedBy === agent.id);
      if (!free) return { ok: false, status: 409, code: "occupied", error: taken(room, object) };
    }
    if (action === "lie" && object.id === "sofa") {
      const blocked = object.seats.some((seat) => seat.occupiedBy && seat.occupiedBy !== agent.id);
      if (blocked) {
        return { ok: false, status: 409, code: "occupied", error: `${taken(room, object)} There isn't room to lie down.` };
      }
    }
    if ((action === "computer_sit" || action === "computer_type" || action === "computer_browse") && object.id === "computer") {
      const free = object.seats.some((seat) => !seat.occupiedBy || seat.occupiedBy === agent.id);
      if (!free) return { ok: false, status: 409, code: "occupied", error: taken(room, object) };
    }
    if ((action === "lie" || action === "sleep") && object.id === "bed") {
      const seat = object.seats[0];
      if (seat?.occupiedBy && seat.occupiedBy !== agent.id) {
        return { ok: false, status: 409, code: "occupied", error: taken(room, object) };
      }
    }
    return { ok: true };
  }

export function applyArrived(room: RoomHost, agent: AgentRecord, pending: PendingAction): {
    ok: boolean;
    message: string;
    status: number;
    code?: string;
  } {
    const object = pending.objectId ? room.objects.get(pending.objectId) : undefined;
    if (pending.action === "pet" || pending.action === "feed" || pending.action === "fetch") {
      return room.dogAct(agent, pending.action);
    }
    if (pending.action === "move") {
      agent.pose = "idle";
      agent.anchor = "feet";
      agent.lie = false;
      agent.poseAt = null;
      agent.holding = null;
      if (object) {
        agent.yaw = yawToward(agent.position, { x: object.position.x, z: object.position.z }, agent.yaw);
        agent.status = `standing by the ${object.name.toLowerCase()}`;
        return { ok: true, message: `You arrived at the ${object.name.toLowerCase()}.`, status: 200 };
      }
      agent.status = "standing";
      return { ok: true, message: "You arrived.", status: 200 };
    }
    if (!object) return { ok: false, message: "That object is gone.", status: 400 };

    agent.yaw = yawToward(agent.position, { x: object.position.x, z: object.position.z }, agent.yaw);

    switch (pending.action) {
      case "sit":
        return room.sit(agent, object);
      case "lie":
        return room.lieDown(agent, object);
      case "sleep":
        return room.sleep(agent, object);
      case "tv_on":
      case "tv_off":
      case "tv_channel":
        return room.useTv(agent, object, pending);
      case "lamp_toggle":
        return room.toggleLamp(agent, object);
      case "snack":
        return room.takeSnack(agent, object);
      case "read":
        return room.readBook(agent, object);
      case "look_outside":
        return room.lookOutside(agent, object);
      case "light_on":
      case "light_off":
        return room.setLight(agent, object, pending.action === "light_on");
      case "water_on":
      case "water_off":
        return room.setFlag(agent, object, "running", pending.action === "water_on", 20_000, "the tap");
      case "stove_on":
      case "stove_off":
        return room.setFlag(agent, object, "hot", pending.action === "stove_on", 90_000, "the stove");
      case "kettle_on":
      case "kettle_off":
        return room.setFlag(agent, object, "heating", pending.action === "kettle_on", 45_000, "the kettle");
      case "fridge_open":
        return room.fridgeDoor(agent, object, true);
      case "fridge_close":
        return room.fridgeDoor(agent, object, false);
      case "take":
        return room.takeFood(agent, object);
      case "eat":
        return room.eatHeld(agent, object);
      case "radio_on":
      case "radio_off":
      case "radio_next":
        return room.useRadio(agent, object, pending.action);
      case "book_read":
        return room.readPage(agent, object, pending);
      case "book_write":
        return room.writePage(agent, object, pending);
      case "book_create":
        return room.createBook(agent, object, pending);
      case "water":
        return room.waterPlant(agent, object);
      case "place":
        return room.placeFurniture(agent, object, pending.spot ?? "");
      case "hang":
        return room.hangDrawing(agent, object, pending.pixels ?? "");
      case "computer_sit":
      case "computer_type":
      case "computer_browse":
      case "computer_off":
        return room.useComputer(agent, object, pending);
      case "wardrobe_open":
      case "wardrobe_close":
      case "change_outfit":
        return useCloset(room, agent, object, pending.action, pending.outfit);
      case "tuck_in":
        return useDogBed(room, agent, object, pending.action);
      case "pet":
        if (object.id === "dog-bed") return useDogBed(room, agent, object, pending.action);
        return room.dogAct(agent, pending.action);
      case "feed":
      case "fetch":
        return room.dogAct(agent, pending.action);
      default:
        return { ok: false, message: `Can't ${pending.action} there.`, status: 400 };
    }
  }

export function resolveObject(room: RoomHost, action: string, objectId: unknown): { ok: true; object: RoomObject } | (ActResult & { ok: false }) {
    if (typeof objectId === "string" && objectId.trim()) {
      const object = room.findObject(objectId);
      if (!object) return { ok: false, status: 400, error: `No object called "${objectId}".` };
      if (!object.actions.some((item) => item.id === action)) {
        const list = object.actions.map((item) => item.id).join(", ");
        return {
          ok: false,
          status: 400,
          error: list ? `${object.name} doesn't support ${action}. It can: ${list}.` : `${object.name} doesn't support ${action}.`,
        };
      }
      return { ok: true, object };
    }
    const matches = [...room.objects.values()].filter((object) => object.actions.some((item) => item.id === action));
    if (matches.length === 1) return { ok: true, object: matches[0]! };
    if (matches.length === 0) return { ok: false, status: 400, error: `Nothing in the room supports ${action}.` };
    return {
      ok: false,
      status: 400,
      error: `${action} needs an objectId. Choices: ${matches.map((object) => object.id).join(", ")}.`,
    };
  }

export function findObject(room: RoomHost, id: string) {
    const key = id.trim().toLowerCase();
    return room.objects.get(OBJECT_ALIASES[key] ?? key);
  }

export function knownAction(room: RoomHost, action: string) {
    if (SELF_ACTIONS.has(action)) return true;
    for (const object of room.objects.values()) {
      if (object.actions.some((item) => item.id === action)) return true;
    }
    return false;
  }

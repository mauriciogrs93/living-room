import {
  uid,
  type RoomHost,
} from "./engine-host";
import {
  BOOK_MAX,
  DRAWING_MAX,
  PAGES_MAX,
  PAGE_MAX,
  TITLE_MAX,
  cleanPixels,
  cleanText,
  findBook,
  plantStage,
} from "./house";
import {
  SPOTS,
  sofa,
  worldXZ,
} from "./layout";
import { approachOnFloor, onFloor, standBefore, syncObstacles } from "./paths";
import {
  type AgentRecord,
  type Book,
  type PendingAction,
  type RoomObject,
} from "./types";

export function books(room: RoomHost): Book[] {
    return room.house.books.map((book) => ({ ...book, pages: [...book.pages] }));
  }

export function readPage(room: RoomHost, agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    const title = cleanText(pending.title, TITLE_MAX);
    if (!title) return { ok: false, message: "book_read needs a title.", status: 400 };
    const book = findBook(room.house.books, title);
    if (!book) return { ok: false, message: `No book called "${title}".`, status: 404 };
    if (pending.page !== undefined) {
      const pageNo = pending.page;
      if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > book.pages.length) {
        return { ok: false, message: `page must be an integer from 1 to ${Math.max(1, book.pages.length)}.`, status: 400 };
      }
    }
    const page = pending.page ?? Math.max(1, book.pages.length);
    const text = book.pages[page - 1] ?? "";
    object.state.lastRead = book.title;
    room.idleAt(agent, object);
    agent.pose = "reading";
    agent.holding = { kind: "book", label: book.title };
    room.log(`${agent.name} read page ${page} of ${book.title}.`, agent.id, "book_read");
    agent.status = `reading ${book.title}`;
    return { ok: true, message: `${book.title}, page ${page}: ${text}`, status: 200 };
  }

export function writePage(room: RoomHost, agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    const title = cleanText(pending.title, TITLE_MAX);
    const text = cleanText(pending.text, PAGE_MAX);
    if (!title || !text) return { ok: false, message: `book_write needs a title of 1–${TITLE_MAX} characters and text up to ${PAGE_MAX}.`, status: 400 };
    const book = findBook(room.house.books, title);
    if (!book) return { ok: false, message: `No book called "${title}". Create it first.`, status: 404 };
    if (book.pages.length >= PAGES_MAX) book.pages.shift();
    book.pages.push(text);
    book.updatedAt = Date.now();
    object.state.lastRead = book.title;
    room.idleAt(agent, object);
    agent.pose = "reading";
    agent.holding = { kind: "book", label: book.title };
    return room.finish(agent, "book_write", `wrote a page in ${book.title}.`, `You wrote page ${book.pages.length} of ${book.title}.`, `writing in ${book.title}`);
  }

export function createBook(room: RoomHost, agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    const title = cleanText(pending.title, TITLE_MAX);
    if (!title) return { ok: false, message: `book_create needs a title of 1–${TITLE_MAX} characters.`, status: 400 };
    if (findBook(room.house.books, title)) return { ok: false, message: "A book with that title is already on the shelf.", status: 409 };
    if (room.house.books.length >= BOOK_MAX) return { ok: false, message: "The shelf can't hold another book.", status: 400 };
    const text = cleanText(pending.text, PAGE_MAX);
    const book: Book = { id: uid("bk"), title, pages: text ? [text] : [" "], updatedAt: Date.now() };
    if (!text) book.pages = [];
    room.house.books.push(book);
    object.state.lastRead = title;
    room.idleAt(agent, object);
    return room.finish(agent, "book_create", `started a book called ${title}.`, `You started ${title}.`, `standing by the bookshelf`);
  }

export function waterPlant(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    room.idleAt(agent, object);
    room.house.plantWateredAt = Date.now();
    const stage = plantStage(room.house.plantWateredAt, Date.now());
    object.state.stage = stage;
    return room.finish(agent, "water", "watered the plant.", `You watered the plant. It is at stage ${stage} of 4.`, "standing by the plant");
  }

export function placeFurniture(room: RoomHost, agent: AgentRecord, object: RoomObject, spot: string) {
    if (object.seats.some((seat) => seat.occupiedBy && seat.occupiedBy !== agent.id)) {
      return { ok: false, message: "Someone is using it, so it stays put.", status: 409 };
    }
    const riders = [...new Set(object.seats.map((seat) => seat.occupiedBy).filter((id): id is string => Boolean(id)))];
    if (!room.moveToSpot(object, spot)) {
      const names = Object.keys(SPOTS[object.id] ?? {});
      return { ok: false, message: `spot must be one of: ${names.join(", ") || "none"}.`, status: 400 };
    }
    for (const seat of object.seats) seat.occupiedBy = null;
    const name = object.name.toLowerCase();
    const dest = { ...object.approach };
    const now = Date.now();
    for (const id of riders) {
      const who = room.agents.get(id);
      if (!who || who.id === agent.id) continue;
      who.objectId = null;
      who.seatId = null;
      who.pose = "walking";
      who.lie = false;
      who.anchor = "feet";
      who.poseAt = null;
      who.standAt = null;
      room.startWalk(who, dest, null, now);
    }
    room.log(`${agent.name} moved the ${name} to the ${spot}.`, agent.id, `place:${object.id}:${spot}`);
    const walked = room.startWalk(agent, dest, null, now);
    const message = walked.arrived ? `You moved the ${name} to the ${spot}.` : `You moved the ${name} to the ${spot}. Walking over.`;
    if (!walked.arrived) agent.status = `walking to the ${name}`;
    return { ok: true as const, message, status: 200 };
  }

export function moveToSpot(room: RoomHost, object: RoomObject, spot: string) {
    const table = SPOTS[object.id];
    const next = table?.[spot];
    if (!next) return false;
    object.position = { x: next.x, y: 0, z: next.z };
    const front = object.id === "sofa" ? { x: next.x, z: next.z - 0.65 } : standBefore(next.x, next.z);
    object.approach = onFloor(front) ? front : approachOnFloor(front.x, front.z);
    object.state.spot = spot;
    if (object.id === "sofa") {
      const seats = [
        ["left", 0.5],
        ["middle", 0],
        ["right", -0.5],
      ] as const;
      object.seats = seats.map(([id, localX]) => {
        const at = worldXZ(object.position, object.rotation, localX, 0);
        return {
          id,
          standAt: approachOnFloor(at.x, object.position.z - 0.65),
          poseAt: { x: at.x, y: sofa.seatY, z: at.z },
          yaw: Math.PI,
          lie: false,
          occupiedBy: null,
        };
      });
    }
    syncObstacles(room.objects.values());
    return true;
  }

export function hangDrawing(room: RoomHost, agent: AgentRecord, object: RoomObject, raw: string) {
    const pixels = cleanPixels(raw);
    if (!pixels) return { ok: false, message: "hang needs pixels: 64 hex digits, one per cell of an 8×8 drawing.", status: 400 };
    room.house.drawings.push({
      id: uid("art"),
      agentId: agent.id,
      agentName: agent.name,
      pixels,
      at: Date.now(),
    });
    room.house.drawings = room.house.drawings.slice(-DRAWING_MAX);
    object.state.count = room.house.drawings.length;
    room.idleAt(agent, object);
    return room.finish(agent, "hang", "hung a drawing on the wall.", "You hung a drawing.", "standing by the wall");
  }

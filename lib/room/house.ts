import { randomBytes } from "node:crypto";

import { DOG_SPOTS, dogBedSpot } from "./layout";
import { dogWander, route, samplePath } from "./paths";
import type { AgentRecord, Book, DiaryLine, DogMode, Drawing, OwnerNote, PublicDog, RadioStation, Vec2 } from "./types";

export const GUEST_NAMES = new Set(["pip", "nori", "miso"]);
export const PAGE_MAX = 400;
export const TITLE_MAX = 60;
export const BOOK_MAX = 8;
export const PAGES_MAX = 6;
export const DIARY_MAX = 48;
export const DIARY_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAWING_MAX = 6;
export const NOTE_MAX = 180;
export const FOOD = ["eggs", "an orange", "milk", "bread", "a cookie"];

export const FALLBACK_STATIONS: RadioStation[] = [
  { name: "Radio Paradise", url: "https://stream.radioparadise.com/aac-320" },
  { name: "SomaFM Groove Salad", url: "https://ice6.somafm.com/groovesalad-128-mp3" },
  { name: "SomaFM Drone Zone", url: "https://ice6.somafm.com/dronezone-128-mp3" },
];

export type DogMemory = {
  mode: "wander" | "follow" | "fetch" | "nap";
  since: number;
  followId: string | null;
  reactUntil: number;
  fetchUntil: number;
  napUntil: number;
  tucked?: boolean;
};

export type HouseMemory = {
  guestsPurged: boolean;
  books: Book[];
  diary: DiaryLine[];
  drawings: Drawing[];
  notes: OwnerNote[];
  dog: DogMemory;
  radioOn: boolean;
  radioIndex: number;
  stations: RadioStation[];
  stationsAt: number;
  plantWateredAt: number;
  /** Cleared the wardrobe outfit that testing left on rust. */
  wardrobeReset?: boolean;
};

export function freshHouse(now = Date.now()): HouseMemory {
  return {
    guestsPurged: false,
    books: [
      {
        id: "bk_house",
        title: "House journal",
        pages: ["The kettle knows the mornings.", "Someone left the window cracked."],
        updatedAt: now,
      },
    ],
    diary: [],
    drawings: [],
    notes: [],
    dog: { mode: "wander", since: now, followId: null, reactUntil: 0, fetchUntil: 0, napUntil: 0, tucked: false },
    radioOn: false,
    radioIndex: 0,
    stations: FALLBACK_STATIONS.map((station) => ({ ...station })),
    stationsAt: 0,
    plantWateredAt: 0,
    wardrobeReset: true,
  };
}

/** Drop tags such as <b> so they are not spoken as leftover letters. */
export function plainWords(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = plainWords(raw);
  if (!text || text.length > max) return null;
  return text;
}

export function cleanPixels(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const pixels = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pixels)) return null;
  return pixels;
}

export function plantStage(wateredAt: number, now: number) {
  if (!wateredAt) return 1;
  const steps = Math.floor((now - wateredAt) / (3 * 60 * 60 * 1000));
  return Math.min(4, 2 + Math.max(0, steps));
}

export function currentStation(house: HouseMemory): RadioStation {
  const list = house.stations.length > 0 ? house.stations : FALLBACK_STATIONS;
  const index = ((house.radioIndex % list.length) + list.length) % list.length;
  return list[index]!;
}

export function bookIndex(books: Book[]) {
  return books.map((book) => ({ id: book.id, title: book.title, pages: book.pages.length }));
}

function along(from: { x: number; z: number }, to: { x: number; z: number }, t: number) {
  return samplePath(route(from, to), t);
}

export function dogPose(house: HouseMemory, now: number, agents: { id: string; x: number; z: number }[]): PublicDog {
  const dog = house.dog;
  const wander = dogWander(now);
  let mode: DogMode = wander.mode;
  let x = wander.x;
  let z = wander.z;
  if (dog.mode === "follow" && dog.followId && now < dog.since + 22_000) {
    const agent = agents.find((item) => item.id === dog.followId);
    if (agent) {
      mode = "follow";
      const u = Math.min(1, (now - dog.since) / 4000);
      const at = along({ x, z }, { x: agent.x + 0.28, z: agent.z - 0.22 }, u);
      x = at.x;
      z = at.z;
    }
  }
  if (dog.mode === "fetch" && now < dog.fetchUntil) {
    mode = "fetch";
    const toy = DOG_SPOTS[0]!;
    const span = Math.max(1, dog.fetchUntil - dog.since);
    const u = Math.min(1, (now - dog.since) / span);
    const back = u > 0.55;
    const leg = back ? (u - 0.55) / 0.45 : u / 0.55;
    const agent = agents.find((item) => item.id === dog.followId) ?? { x, z };
    const at = back ? along(toy, agent, leg) : along(agent, toy, leg);
    x = at.x;
    z = at.z;
  }
  if (dog.mode === "nap" && now < (dog.napUntil ?? 0)) {
    mode = "nap";
    x = dogBedSpot.position.x;
    z = dogBedSpot.position.z;
  }
  if (now < dog.reactUntil) mode = "bark";
  const inBed = Math.hypot(x - dogBedSpot.position.x, z - dogBedSpot.position.z) < 0.45;
  const mood =
    mode === "bark"
      ? "perked up"
      : mode === "nap" && inBed
        ? "napping in its bed"
        : mode === "nap"
          ? "napping"
          : mode === "follow"
            ? "following"
            : mode === "fetch"
              ? "chasing a toy"
              : "sniffing around";
  return { x, z, mode, mood, since: dog.since, followId: dog.followId, fetchUntil: dog.fetchUntil, reactUntil: dog.reactUntil };
}

export function dogStand(pose: PublicDog): Vec2 {
  return { x: Math.max(-1.7, Math.min(1.7, pose.x)), z: Math.max(-0.8, Math.min(10.8, pose.z + 0.35)) };
}

export function pruneDiary(lines: DiaryLine[], now: number) {
  const kept = lines.filter((line) => now - line.at < DIARY_MS);
  return kept.slice(-DIARY_MAX);
}

export function addDiary(house: HouseMemory, agent: { id: string; name: string }, text: string, now: number) {
  house.diary = pruneDiary(house.diary, now);
  house.diary.push({
    id: `day_${randomBytes(3).toString("hex")}`,
    agentId: agent.id,
    agentName: agent.name,
    at: now,
    text,
  });
  house.diary = house.diary.slice(-DIARY_MAX);
}

export function findBook(books: Book[], title: string) {
  const key = title.trim().toLowerCase();
  return books.find((book) => book.id === key || book.title.toLowerCase() === key);
}

const IDEAS: { key: string; text: string; floor: "kitchen" | "living" | "bedroom" | "any" }[] = [
  { key: "water", text: "Water the plant.", floor: "kitchen" },
  { key: "kettle_on", text: "Heat the kettle.", floor: "kitchen" },
  { key: "take", text: "Take food from the fridge.", floor: "kitchen" },
  { key: "radio_next", text: "Change the radio station.", floor: "living" },
  { key: "hang", text: "Hang a drawing on the gallery wall.", floor: "living" },
  { key: "sit", text: "Sit at the table, the armchair, or the sofa.", floor: "living" },
  { key: "book_write", text: "Write a page in the house journal.", floor: "living" },
  { key: "look_outside", text: "Look outside the bedroom window.", floor: "bedroom" },
  { key: "sleep", text: "Sleep on the bed for a moment, then wake.", floor: "bedroom" },
  { key: "computer_browse", text: "Open the computer's home page.", floor: "bedroom" },
  { key: "change_outfit", text: "Change outfits at the wardrobe.", floor: "bedroom" },
  { key: "tuck_in", text: "Tuck the dog into its bed when it is there.", floor: "bedroom" },
  { key: "pet", text: "Pet the dog.", floor: "any" },
  { key: "fetch", text: "Play fetch with the dog.", floor: "any" },
  { key: "jump", text: "Jump once, where you are.", floor: "any" },
  { key: "light_off", text: "Flip a wall switch in another room.", floor: "any" },
];

export function suggestionFor(agent: AgentRecord, _now: number): string | null {
  const recent = agent.recent ?? [];
  if (recent.length < 8) return null;
  const variety = new Set(recent).size;
  if (variety >= 5 && (agent.repeat ?? 1) < 2) return null;
  const done = new Set(recent);
  let pool = IDEAS.filter((idea) => !done.has(idea.key));
  if (agent.journalHint || done.has("book_write")) pool = pool.filter((idea) => idea.key !== "book_write");
  if (pool.length === 0) return null;
  const z = agent.position.z;
  const here = z < 2.2 ? "kitchen" : z < 7.5 ? "living" : "bedroom";
  const away = pool.filter((idea) => idea.floor !== here);
  const choices = away.length ? away : pool;
  const cursor = agent.suggestAt ?? 0;
  const idea = choices[cursor % choices.length]!;
  agent.suggestAt = cursor + 1;
  if (idea.key === "book_write") agent.journalHint = true;
  return `Your recent actions are narrow. ${idea.text}`;
}

export function trackVariety(agent: AgentRecord, key: string, position: Vec2, now: number) {
  if (agent.lastAction === key) agent.repeat = (agent.repeat ?? 1) + 1;
  else {
    agent.lastAction = key;
    agent.repeat = 1;
  }
  const recent = agent.recent ?? [];
  const bare = key.startsWith("emote:") ? key.slice(6) : (key.split(":")[0] ?? key);
  recent.push(bare);
  agent.recent = recent.slice(-12);
  agent.anchorPos = { x: position.x, z: position.z };
  agent.stillSince = now;
}

export function ensureOwnerKey(agent: AgentRecord) {
  if (!agent.ownerKey) agent.ownerKey = `own_${randomBytes(18).toString("hex")}`;
  return agent.ownerKey;
}

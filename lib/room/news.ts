import { gatherNews, quietWire, sanitizeStored, type Headline } from "./news-parse";
import { redisCommand, redisConfig } from "./redis";
import { boundStore } from "./store/active";
import { supabaseConfig } from "./store/config";

export type { Headline };

const MEMORY_MS = 12 * 60 * 1000;
const REDIS_TTL = 15 * 60;
const KEY = "living-room:news:v2";

let memory: { at: number; items: Headline[] } | null = null;
let inflight: Promise<Headline[]> | null = null;

const HARSH = /\b(assault|rape|raped|rapist|murder|murdered|killing|killed|suicide|terrorist|terrorism|bombing|shooting)\b/i;

export function calmTitle(title: string) {
  return !HARSH.test(title);
}

/** Short list for the television ticker. Distressing headlines stay off the set. */
export function peekNews(): Headline[] {
  void ensureNews();
  const items = (memory?.items ?? quietWire()).filter((item) => calmTitle(item.title));
  const pool = items.length ? items : quietWire();
  const bbc = pool.filter((item) => item.source === "BBC").slice(0, 3);
  const rest = pool.filter((item) => item.source !== "BBC" && item.source !== "Living Room").slice(0, 2);
  const picked = [...bbc, ...rest];
  return (picked.length ? picked : pool).slice(0, 5);
}

/** The global tape, newest first. */
export function peekTape(): Headline[] {
  void ensureNews();
  return (memory?.items ?? quietWire()).slice(0, 30);
}

export function ensureNews(): Promise<Headline[]> {
  const now = Date.now();
  if (memory && now - memory.at < MEMORY_MS) return Promise.resolve(memory.items);
  if (!inflight) {
    inflight = load(now).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function load(now: number): Promise<Headline[]> {
  const cached = await readRedis();
  if (cached && now - cached.at < REDIS_TTL * 1000) {
    memory = cached;
    return cached.items;
  }
  const fetched = await gatherNews();
  const next = { at: Date.now(), items: fetched.length ? fetched : quietWire() };
  memory = next;
  await writeRedis(next);
  return next.items;
}

async function readRedis(): Promise<{ at: number; items: Headline[] } | null> {
  const store = boundStore();
  if (store?.kvGet) {
    try {
      const raw = await store.kvGet(KEY);
      if (!raw || typeof raw !== "object") return null;
      const parsed = raw as { at?: number; items?: unknown[] };
      if (!Array.isArray(parsed.items) || typeof parsed.at !== "number") return null;
      const items = parsed.items.map(sanitizeStored).filter((item): item is Headline => item !== null).slice(0, 30);
      return items.length ? { at: parsed.at, items } : null;
    } catch {
      return null;
    }
  }
  if (supabaseConfig() || !redisConfig()) return null;
  try {
    const raw = await redisCommand("GET", KEY);
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; items?: unknown[] };
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.at !== "number") return null;
    const items = parsed.items.map(sanitizeStored).filter((item): item is Headline => item !== null).slice(0, 30);
    return items.length ? { at: parsed.at, items } : null;
  } catch {
    return null;
  }
}

async function writeRedis(value: { at: number; items: Headline[] }) {
  const store = boundStore();
  if (store?.kvPut) {
    try {
      await store.kvPut(KEY, value, REDIS_TTL);
    } catch {
      /* the in-memory copy still serves this instance */
    }
    return;
  }
  if (supabaseConfig() || !redisConfig()) return;
  try {
    await redisCommand("SET", KEY, JSON.stringify(value), "EX", REDIS_TTL);
  } catch {
    /* the in-memory copy still serves this instance */
  }
}

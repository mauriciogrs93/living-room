import { currentSignal } from "@/lib/room/request-signal";

export type RedisConfig = { url: string; token: string };

/** Upstash REST credentials, including the names Vercel’s marketplace integration injects. */
export function redisConfig(): RedisConfig | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export class RedisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisError";
  }
}

const callCounts = new Map<string, number>();

/** Commands issued since the last reset, grouped by command and key (rate and mail keys collapsed). */
export function redisCallCounts(): Record<string, number> {
  return Object.fromEntries(callCounts);
}

export function resetRedisCalls() {
  callCounts.clear();
}

function noteRedisCall(args: (string | number)[]) {
  const cmd = String(args[0] ?? "");
  let key = "";
  if (cmd === "EVAL") key = String(args[3] ?? "");
  else key = String(args[1] ?? "");
  if (key.startsWith("living-room:rate:")) key = "living-room:rate";
  else if (key.startsWith("living-room:mail-token:")) key = "living-room:mail-token";
  else if (key.startsWith("living-room:mail:")) key = "living-room:mail";
  const bucket = `${cmd} ${key}`.trim();
  callCounts.set(bucket, (callCounts.get(bucket) ?? 0) + 1);
}

/** One Redis command over the Upstash REST API. Values come back in `result`. */
export async function redisCommand(...args: (string | number)[]): Promise<unknown> {
  return redisTimed(4000, args);
}

/** Same command with a shorter abort, used while waiting on the room lock. */
export async function redisTimed(timeoutMs: number, args: (string | number)[]): Promise<unknown> {
  noteRedisCall(args);
  const config = redisConfig();
  if (!config) throw new RedisError("Redis is not configured.");
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: currentSignal()
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), currentSignal()!])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RedisError("Could not reach Redis.");
  }
  let payload: { result?: unknown; error?: string } | null = null;
  try {
    payload = (await response.json()) as { result?: unknown; error?: string };
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.error) {
    throw new RedisError(payload?.error || `Redis returned ${response.status}.`);
  }
  return payload?.result ?? null;
}

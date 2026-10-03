import { bearer, json, preflight, readJson } from "@/lib/http";
import { actGuarded, roomFailure, type ActOpts, type RoomPort } from "@/lib/room/access";
import { agentRoom } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";
import { deadline } from "@/lib/room/deadline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const POST = guarded(post);

async function post(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return json({ ok: false, error: "Send Authorization: Bearer YOUR_TOKEN." }, 401);
    // v21: the token names its apartment (agent_tokens); there is no shared room.
    const found = await agentRoom(token);
    if (!found) return json({ ok: false, error: "Unknown or missing token. Register again." }, 401);
    const engine = found.room;
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const raw = req.headers.get("idempotency-key") ?? (body.value && typeof body.value === "object" ? (body.value as { requestId?: unknown }).requestId : "");
    const idemKey = typeof raw === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(raw.trim()) ? raw.trim() : "";
    return await deadline(run(engine, token, body.value, { idemKey, deadlineAt: Date.now() + 4800 }), 5000);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

async function run(engine: RoomPort, token: string, value: unknown, opts: ActOpts) {
  const outcome = await actGuarded(engine, token, value, opts);
  if (outcome.type === "slow_down") {
    return json({ ok: false, code: "slow_down", error: "Slow down. Wait for busyUntil, then act again." }, 429, { "Retry-After": "1" });
  }
  if (outcome.type === "idem_mismatch") {
    return json({ ok: false, code: "idempotency_mismatch", error: "That Idempotency-Key was used with a different body." }, 422);
  }
  if (outcome.type === "held") {
    const held = outcome.held;
    return json({ ok: false, error: held.error, code: held.code, hint: held.hint }, held.status);
  }
  if (outcome.type === "limit") {
    return json({ ok: false, error: "Too many actions. Wait a moment." }, 429, {
      "Retry-After": String(outcome.retryAfter),
    });
  }
  const result = outcome.result;
  if (!result.ok) return json({ ok: false, error: result.error, code: result.code, hint: result.hint }, result.status);
  return json(result);
}

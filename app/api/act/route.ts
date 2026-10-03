import { bearer, json, preflight, readJson } from "@/lib/http";
import { actGuarded, getEngine, roomFailure } from "@/lib/room/access";
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
    const engine = getEngine();
    const token = bearer(req);
    if (!token) return json({ ok: false, error: "Send Authorization: Bearer YOUR_TOKEN." }, 401);
    const body = await readJson(req);
    if (!body.ok) return body.response;
    return await deadline(run(engine, token, body.value), 5000);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

async function run(engine: ReturnType<typeof getEngine>, token: string, value: unknown) {
  const outcome = await actGuarded(engine, token, value);
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

import { bearer, json, preflight } from "@/lib/http";
import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";

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
    const result = await engine.leave(token);
    if (!result.ok) return json({ ok: false, error: result.error, code: result.code }, result.status);
    return json(result);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

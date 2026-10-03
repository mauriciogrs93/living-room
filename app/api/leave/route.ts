import { bearer, json, preflight } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { agentRoom } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";

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
    const found = await agentRoom(token);
    if (!found) return json({ ok: false, error: "Unknown or missing token. Register again." }, 401);
    const engine = found.room;
    const result = await engine.leave(token);
    if (!result.ok) return json({ ok: false, error: result.error, code: result.code }, result.status);
    return json(result);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

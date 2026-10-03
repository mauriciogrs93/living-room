import { clientIp, json, preflight } from "@/lib/http";
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
    const limit = await engine.allow(`tap:${clientIp(req)}`, 60, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Easy. Give the room a second." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const body = await req.json().catch(() => null);
    const result = await engine.viewerTap(body);
    if (!result.ok) return json({ ok: false, error: result.message }, result.status);
    return json(result);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

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
    const limit = await engine.allow(`dog:${clientIp(req)}`, 30, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "The dog needs a second." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    return json(await engine.pokeDog());
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

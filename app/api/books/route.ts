import { clientIp, json, preflight } from "@/lib/http";
import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const GET = guarded(getBooks);

async function getBooks(req: Request) {
  try {
    const engine = getEngine();
    const limit = await engine.allow(`books:${clientIp(req)}`, 60, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Too many book requests." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    return json({ ok: true, books: await engine.books() });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

import { json, ownerKeyFrom, preflight, readJson, sameOrigin } from "@/lib/http";
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
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const value = body.value && typeof body.value === "object" ? (body.value as { ownerKey?: unknown; block?: unknown }) : {};
    if (!value.ownerKey && !sameOrigin(req)) return json({ ok: false, error: "Wrong origin." }, 403);
    const ownerKey = ownerKeyFrom(req, value.ownerKey);
    const block = value.block === true;
    if (!/^own_[0-9a-f]{36}$/.test(ownerKey)) {
      return json({ ok: false, error: "This page needs the owner link from your agent." }, 401);
    }
    const engine = getEngine();
    const limit = await engine.allow(`owner-leave:${ownerKey.slice(4, 16)}`, 8, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Too many tries. Wait a moment." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const result = await engine.ownerLeave(ownerKey, block);
    if (!result.ok) return json({ ok: false, error: result.error, code: result.code }, result.status);
    return json(result);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { baseUrl, ownerJson, ownerKeyFrom, readJson, sameOrigin } from "@/lib/http";
import { inviteLine } from "@/lib/join-line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v19 Door (Option A): invite, pause, resume, trust, untrust, unblock. No knock actions.
const ACTIONS = new Set(["invite", "pause", "resume", "trust", "untrust", "unblock"]);

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export const GET = guarded(async (req) => {
  try {
    const ownerKey = ownerKeyFrom(req);
    if (!ownerKey) return ownerJson({ ok: false, error: "Only the room owner can see the door." }, 403);
    const engine = getEngine();
    const view = await engine.doorView(ownerKey);
    if (!view.ok) return ownerJson({ ok: false, error: view.error }, view.status);
    return ownerJson(view);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

export const POST = guarded(async (req) => {
  try {
    if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Only the room owner can see the door." }, 403);
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const record = body.value && typeof body.value === "object" ? (body.value as { action?: unknown; id?: unknown }) : {};
    const ownerKey = ownerKeyFrom(req);
    const action = typeof record.action === "string" ? record.action.trim() : "";
    const id = typeof record.id === "string" ? record.id.trim().slice(0, 40) : "";
    if (!ownerKey || !ACTIONS.has(action)) {
      return ownerJson({ ok: false, error: "Only the room owner can see the door." }, 403);
    }
    const engine = getEngine();
    const limit = await engine.allow(`door:${ownerKey.slice(4, 16)}`, 40, 60_000);
    if (!limit.ok) {
      return ownerJson({ ok: false, error: "Too many door actions. Wait a moment." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const result = await engine.doorAct(ownerKey, action, id);
    if (!result.ok) {
      const code = "code" in result ? result.code : undefined;
      return ownerJson({ ok: false, error: result.error, code }, result.status);
    }
    const view = await engine.doorView(ownerKey);
    const invite = "invite" in result && typeof result.invite === "string" ? result.invite : "";
    const extra = invite ? { invite, line: inviteLine(baseUrl(req), invite) } : {};
    if (!view.ok) return ownerJson({ ok: true, message: result.message, ...extra });
    return ownerJson({ ...view, ok: true, message: result.message, ...extra });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

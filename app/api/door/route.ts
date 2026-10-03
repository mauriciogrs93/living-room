import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { baseUrl, json, preflight, readJson } from "@/lib/http";
import { inviteLine } from "@/lib/join-line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["admit", "trust", "decline", "untrust", "unblock", "lock", "unlock", "reset-invite"]);

export function OPTIONS() {
  return preflight();
}

function ownerKeyOf(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const key = (value as { ownerKey?: unknown }).ownerKey;
  return typeof key === "string" ? key.trim() : "";
}

export const GET = guarded(async (req) => {
  try {
    const ownerKey = new URL(req.url).searchParams.get("ownerKey")?.trim() ?? "";
    if (!/^own_[0-9a-f]{36}$/.test(ownerKey)) {
      return json({ ok: false, error: "Only the room owner can see the door." }, 403);
    }
    const engine = getEngine();
    const view = await engine.doorView(ownerKey);
    if (!view.ok) return json({ ok: false, error: view.error }, view.status);
    return json({ ...view, joinLine: inviteLine(baseUrl(req), view.invite) });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

export const POST = guarded(async (req) => {
  try {
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const ownerKey = ownerKeyOf(body.value);
    const record = body.value && typeof body.value === "object" ? (body.value as { action?: unknown; id?: unknown }) : {};
    const action = typeof record.action === "string" ? record.action.trim() : "";
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!/^own_[0-9a-f]{36}$/.test(ownerKey) || !ACTIONS.has(action)) {
      return json({ ok: false, error: "Only the room owner can see the door." }, 403);
    }
    const engine = getEngine();
    const limit = await engine.allow(`door:${ownerKey.slice(4, 16)}`, 40, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Too many door actions. Wait a moment." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const result = await engine.doorAct(ownerKey, action, id);
    if (!result.ok) {
      const code = "code" in result ? result.code : undefined;
      return json({ ok: false, error: result.error, code }, result.status);
    }
    const view = await engine.doorView(ownerKey);
    if (!view.ok) return json({ ok: true, message: result.message });
    return json({ ...result, ...view, joinLine: inviteLine(baseUrl(req), view.invite) });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

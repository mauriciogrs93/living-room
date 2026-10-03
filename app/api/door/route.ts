import { roomFailure } from "@/lib/room/access";
import { ownerContext, withCookies, watchWriteBlock } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";
import { baseUrl, ownerJson, readJson, sameOrigin } from "@/lib/http";
import { inviteLine } from "@/lib/join-line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v19 Door (Option A): invite, pause, resume, trust, untrust, unblock. No knock actions.
// v20: "invite" is the ONLY way to mint (owner cookie, same-origin, 40 door actions/min, 10 mints/min, no-store).
// The code is returned once in the JSON body (invite + line) and is never logged or put in a URL.
const ACTIONS = new Set(["invite", "pause", "resume", "trust", "untrust", "remove", "unblock"]);

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export const GET = guarded(async (req) => {
  try {
    // v21: the owner is the signed-in account; the door key is its server-side identity.
    const owner = await ownerContext(req, { resync: true });
    if (owner instanceof Response) return forbid(owner);
    const view = await owner.room.doorView(owner.identity);
    if (!view.ok) return withCookies(ownerJson({ ok: false, error: view.error }, view.status), owner.setCookies);
    return withCookies(ownerJson(view), owner.setCookies);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

export const POST = guarded(async (req) => {
  try {
    const readOnly = await watchWriteBlock(req);
    if (readOnly) return readOnly;
    if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Only the room owner can see the door." }, 403);
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const record = body.value && typeof body.value === "object" ? (body.value as { action?: unknown; id?: unknown }) : {};
    const action = typeof record.action === "string" ? record.action.trim() : "";
    const id = typeof record.id === "string" ? record.id.trim().slice(0, 40) : "";
    if (!ACTIONS.has(action)) return ownerJson({ ok: false, error: "Only the room owner can see the door." }, 403);
    const owner = await ownerContext(req, { resync: true });
    if (owner instanceof Response) return forbid(owner);
    const ownerKey = owner.identity;
    const engine = owner.room;
    const limit = await engine.allow(`door:${owner.apartment.id.slice(0, 13)}`, 40, 60_000);
    if (!limit.ok) {
      return ownerJson({ ok: false, error: "Too many door actions. Wait a moment." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const result = await engine.doorAct(ownerKey, action, id);
    if (!result.ok) {
      const code = "code" in result ? result.code : undefined;
      const retryAfter = "retryAfter" in result ? Number(result.retryAfter) || 0 : 0;
      return ownerJson(
        { ok: false, error: result.error, code, ...(retryAfter ? { retryAfter } : {}) },
        result.status,
        retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
      );
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

/** v20 wording kept: anyone but the owner hears "Only the room owner can see the door." (403); 429s pass through. */
async function forbid(res: Response) {
  if (res.status === 429) return res;
  const out = ownerJson({ ok: false, code: "signed_out", error: "Only the room owner can see the door." }, 403);
  for (const c of res.headers.getSetCookie?.() ?? []) out.headers.append("Set-Cookie", c);
  return out;
}

import { json, ownerKeyFrom, preflight, readJson, sameOrigin } from "@/lib/http";
import { roomFailure, type RoomPort } from "@/lib/room/access";
import { agentRoom, ipKey, limited, watchWriteBlock } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";
import { NOTE_MAX, UNREAD_CAP, flushMail, loadOwner, publicNotes, touchBox, unreadCount, type Mailbox } from "@/lib/room/mailbox";
import { VersionedRoom } from "@/lib/room/store/versioned-room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const GET = guarded(getNote);

async function getNote(req: Request) {
  try {
    // v19: the owner page reads its key from the HttpOnly cookie. ?ownerKey= still works for agents' own GETs.
    const ownerKey = ownerKeyFrom(req) || (new URL(req.url).searchParams.get("ownerKey") ?? "");
    if (!/^own_[0-9a-f]{36}$/.test(ownerKey)) {
      return json({ ok: false, error: "This page needs the owner link from your agent." }, 401);
    }
    const found = await agentRoom("", ownerKey);
    if (!found) return json({ ok: false, error: "This agent left. Ask it for a new link." }, 404);
    const engine = found.room;
    const limit = await engine.allow(`mailbox:${ownerKey.slice(4, 16)}`, 40, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Too many refreshes. Wait a moment." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const box = await ownerBox(engine, ownerKey);
    if (!box) return json({ ok: false, error: "This agent left. Ask it for a new link." }, 404);
    const snapshot = await engine.snapshot();
    const present = snapshot.agents.some((agent) => agent.id === box.agentId);
    return json({
      ok: true,
      name: box.name,
      present,
      notes: publicNotes(box),
      unread: unreadCount(box),
      cap: UNREAD_CAP,
      max: NOTE_MAX,
    });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

async function ownerBox(engine: RoomPort, ownerKey: string): Promise<Mailbox | null> {
  if (engine instanceof VersionedRoom) return engine.ownerNotes(ownerKey);
  const box = await loadOwner(ownerKey);
  if (!box) return null;
  touchBox(ownerKey);
  await flushMail();
  return box;
}

export const POST = guarded(postNote);

async function postNote(req: Request) {
  try {
    const readOnly = await watchWriteBlock(req);
    if (readOnly) return readOnly;
    const tooMany = await limited(`note-ip:${ipKey(req)}`, { limit: 12, windowMs: 60_000 }, "Too many notes. Wait a moment.");
    if (tooMany) return tooMany;
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const value = body.value && typeof body.value === "object" ? (body.value as { ownerKey?: unknown; message?: unknown }) : {};
    if (!value.ownerKey && !sameOrigin(req)) return json({ ok: false, error: "Wrong origin." }, 403);
    const ownerKey = ownerKeyFrom(req, value.ownerKey);
    if (!ownerKey.startsWith("own_")) {
      return json({ ok: false, error: "Send the ownerKey from your agent's register or look response." }, 401);
    }
    const found = await agentRoom("", ownerKey);
    if (!found) return json({ ok: false, error: "This agent left. Ask it for a new link." }, 404);
    const engine = found.room;
    const result = await engine.postNote(ownerKey, value.message);
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json(result);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

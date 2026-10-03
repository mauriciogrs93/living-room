import { baseUrl, bearer, json, preflight } from "@/lib/http";
import { allowFast, roomFailure, type RoomPort } from "@/lib/room/access";
import { agentRoom } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";
import { deadline } from "@/lib/room/deadline";
import { calmTitle, ensureNews, peekTape } from "@/lib/room/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

async function respond(req: Request) {
  const token = bearer(req);
  if (!token) return json({ ok: false, error: "Send Authorization: Bearer YOUR_TOKEN." }, 401);
  return deadline(
    agentRoom(token).then((found) => (found ? load(found.room, token, req) : json({ ok: false, error: "Unknown or missing token. Register again." }, 401))),
    5000,
  );
}

async function load(engine: RoomPort, token: string, req: Request) {
  // Door hold reads the same living-room:state blob as look. The 1s cache folds that into one GET.
  const held = await engine.doorHold(token);
  if (held) return json({ ok: false, error: held.error, code: held.code, hint: held.hint }, held.status);
  const limit = await allowFast(engine, `look:${token.slice(0, 12)}`, 90, 60_000);
  if (!limit.ok) {
    return json({ ok: false, error: "Too many looks. Wait a moment." }, 429, {
      "Retry-After": String(limit.retryAfter),
    });
  }
  await Promise.race([ensureNews(), new Promise((resolve) => setTimeout(resolve, 800))]);
  const result = await engine.look(token);
  if (!result.ok) return json({ ok: false, error: result.error, code: result.code, hint: result.hint }, result.status);
  if (!("snapshot" in result)) return json(result);
  const { snapshot, ownerKey, ...rest } = result;
  return json({
    ...rest,
    ownerKey,
    ownerLink: `${baseUrl(req)}/room#owner=${encodeURIComponent(ownerKey)}`,
    serverTime: snapshot.serverTime,
    room: snapshot.room,
    objects: snapshot.objects,
    agents: snapshot.agents,
    events: snapshot.events,
    dog: snapshot.dog,
    books: snapshot.books,
    diary: snapshot.diary,
    drawings: snapshot.drawings,
    radio: snapshot.radio,
    news: peekTape()
      .filter((item) => calmTitle(item.title))
      .slice(0, 10)
      .map((item) => ({
        title: item.title.slice(0, 110),
        source: item.source,
        region: item.region,
      })),
  });
}

export const GET = guarded((req) => respond(req).catch(fail));

export const POST = guarded((req) => respond(req).catch(fail));

function fail(error: unknown) {
  const failure = roomFailure(error);
  if (failure) return failure;
  throw error;
}

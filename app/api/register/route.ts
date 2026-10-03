import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { baseUrl, clientIp, json, preflight, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const POST = guarded(post);

async function post(req: Request) {
  try {
    const engine = getEngine();
    const limit = await engine.allow(`register:${clientIp(req)}`, 8, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Too many registrations. Wait a moment and try again." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const raw = body.value && typeof body.value === "object" ? (body.value as Record<string, unknown>) : {};
    const result = await engine.register({
      name: raw.name,
      color: raw.color,
      emoji: raw.emoji,
      ownerKey: raw.ownerKey,
      token: raw.token,
      invite: raw.invite,
      note: raw.note,
      ip: clientIp(req),
      seedId: raw.seedId,
      seedSecret: raw.seedSecret,
    });
    if (!result.ok) {
      const retry = result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined;
      return json({ ok: false, error: result.error, code: result.code, hint: result.hint }, result.status, retry);
    }
    const ownerKey = "ownerKey" in result ? result.ownerKey : "";
    const waiting = "waiting" in result && result.waiting;
    return json(
      {
        ...result,
        ownerLink: ownerKey ? `${baseUrl(req)}/room#owner=${encodeURIComponent(ownerKey)}` : undefined,
      },
      waiting ? 202 : 201,
    );
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { baseUrl, clientIp, json, preflight, readJson } from "@/lib/http";
import { DOOR_COPY, INVITE_FAIL_LIMIT, INVITE_FAIL_WINDOW_MS, sha256 } from "@/lib/room/door";

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
    if (!result.ok && typeof result.code === "string" && result.code.startsWith("invite_")) {
      // v19: count failed invites per hashed IP in the store; the 6th in 10 minutes gets a 429.
      const ipKey = sha256(`${process.env.IP_SALT ?? "lr-ip"}|${clientIp(req) || "local"}`).slice(0, 16);
      const fails = await engine.allow(`invfail:${ipKey}`, INVITE_FAIL_LIMIT, INVITE_FAIL_WINDOW_MS);
      if (!fails.ok) {
        return json(
          { ok: false, code: "invite_rate_limited", error: DOOR_COPY.tries, hint: "Wait a minute, then try again." },
          429,
          { "Retry-After": String(fails.retryAfter) },
        );
      }
    }
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

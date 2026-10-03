import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { baseUrl, clientIp, json, preflight, readJson } from "@/lib/http";
import { DOOR_COPY, INVITE_FAIL_LIMIT, INVITE_FAIL_WINDOW_MS, turnedAway } from "@/lib/room/door";
import { agentRoom, inviteRoom, ipKey, limited, normalizeInvite } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const POST = guarded(post);

/** v21: failed invites per hashed IP, across every apartment (the 6th in 10 minutes is a 429). */
async function inviteFailLimit(req: Request) {
  return limited(`invfail:${ipKey(req)}`, { limit: INVITE_FAIL_LIMIT, windowMs: INVITE_FAIL_WINDOW_MS }, DOOR_COPY.tries, "invite_rate_limited");
}

async function post(req: Request) {
  try {
    const tooMany = await limited(`register-ip:${ipKey(req)}`, LIMITS.registerPerIp, "Too many registrations. Wait a moment and try again.");
    if (tooMany) return tooMany;
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const raw = body.value && typeof body.value === "object" ? (body.value as Record<string, unknown>) : {};
    // v21: the invite names the apartment that minted it; otherwise the agent's own token / key does.
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    let found = normalizeInvite(raw.invite) ? await inviteRoom(raw.invite) : null;
    if (!found) found = await agentRoom(str(raw.token), str(raw.ownerKey));
    if (!found) {
      // No apartment knows this agent or this invite: the same Writer copy and codes the door gives.
      const code = !normalizeInvite(raw.invite) ? "invite_missing" : "invite_invalid";
      const fails = await inviteFailLimit(req);
      if (fails) return withHint(fails);
      const away = turnedAway(code);
      return json({ ok: false, error: away.error, code: away.code, hint: away.hint }, 403);
    }
    const engine = found.room;
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
      const fails = await inviteFailLimit(req);
      if (fails) return withHint(fails);
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

async function withHint(res: Response) {
  const body = (await res.json()) as Record<string, unknown>;
  return json({ ...body, hint: "Wait a minute, then try again." }, 429, { "Retry-After": res.headers.get("Retry-After") ?? "60" });
}

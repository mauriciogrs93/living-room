import { baseUrl, ownerJson, sameOrigin } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { inviteLine } from "@/lib/join-line";
import { INVITE_ROTATE_MS, INVITE_TTL_MS } from "@/lib/room/invite-ttl";
import { ipKey, limited, mintWatch, ownerContext, withCookies, watchWriteBlock } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v21 Invite button (owner only, POST, same origin, no-store). One press mints BOTH:
 *   - a fresh single-use agent invite, in Writer's ready-to-paste line (v20 wording), and
 *   - a fresh single-use watch link for a human guest (read-only, this apartment only).
 * Each lives INVITE_TTL_MS (1 minute). The open menu asks again every INVITE_ROTATE_MS (50 s), so a new
 * pair is ready before the old one expires; an older, unused pair keeps working until its own minute is up.
 * Codes appear only in this JSON body: never logged, never in a query string (the watch code rides in the
 * link's #fragment, which browsers don't send to servers).
 */
export const POST = guarded(async (req) => {
  try {
    const readOnly = await watchWriteBlock(req);
    if (readOnly) return readOnly;
    if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Only the apartment owner can invite." }, 403);
    const perIp = await limited(`invite-ip:${ipKey(req)}`, LIMITS.invitePerIp, "Too many invites. Wait a minute.", "invite_mint_limited");
    if (perIp) return perIp;
    const owner = await ownerContext(req, { resync: true });
    if (owner instanceof Response) return owner.status === 401 ? withCookies(ownerJson({ ok: false, code: "signed_out", error: "Only the apartment owner can invite." }, 403), owner.headers.getSetCookie?.() ?? []) : owner;
    const result = await owner.room.doorAct(owner.identity, "invite");
    if (!result.ok) {
      const code = "code" in result ? result.code : undefined;
      const retryAfter = "retryAfter" in result ? Number(result.retryAfter) || 0 : 0;
      return withCookies(
        ownerJson({ ok: false, error: result.error, code, ...(retryAfter ? { retryAfter } : {}) }, result.status, retryAfter ? { "Retry-After": String(retryAfter) } : undefined),
        owner.setCookies,
      );
    }
    const invite = "invite" in result && typeof result.invite === "string" ? result.invite : "";
    if (!invite) return ownerJson({ ok: false, error: "The door didn't answer." }, 503);
    const watch = await mintWatch(owner.apartment.id);
    const origin = baseUrl(req);
    const now = Date.now();
    const expiresAt = "expiresAt" in result && typeof result.expiresAt === "number" ? result.expiresAt : now + INVITE_TTL_MS;
    return withCookies(
      ownerJson({
        ok: true,
        line: inviteLine(origin, invite),
        invite,
        watchLink: `${origin}/room#watch=${watch.code}`,
        expiresAt: Math.min(expiresAt, watch.expiresAt),
        rotateAt: now + INVITE_ROTATE_MS,
        ttlMs: INVITE_TTL_MS,
        rotateMs: INVITE_ROTATE_MS,
      }),
      owner.setCookies,
    );
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

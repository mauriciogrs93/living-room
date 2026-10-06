import { baseUrl, ownerJson, sameOrigin } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { inviteLine } from "@/lib/join-line";
import { INVITE_TTL_MS } from "@/lib/room/invite-ttl";
import { ipKey, limited, mintWatch, ownerContext, withCookies, watchWriteBlock } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINT_FAILED = "Couldn't make an invite. Try again.";

/** Body {kind:"line"} mints only an agent invite, {kind:"watch"} only a watch link, anything else both. */
async function readKind(req: Request): Promise<"line" | "watch" | "both"> {
  try {
    const text = await req.text();
    if (!text || text.length > 2000) return "both";
    const kind = (JSON.parse(text) as { kind?: unknown })?.kind;
    return kind === "line" || kind === "watch" ? kind : "both";
  } catch {
    return "both";
  }
}

/**
 * v21 r2 Invite (owner only, POST, same origin, no-store): MINT ON COPY. Each Copy tap asks for a fresh code,
 * live for INVITE_TTL_MS (1 minute) from that request; nothing rotates and nothing is minted without a request.
 *   {kind:"line"}  a fresh single-use agent invite, in Writer's ready-to-paste line (v20 wording)
 *   {kind:"watch"} a fresh single-use watch link for a person (read-only, this apartment only; at most 3 unused,
 *                  the oldest unused one is cancelled; the owner can end them all with /api/apartment/watch-revoke)
 *   {}             both (the menu showing its first line and link when it opens)
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
    const kind = await readKind(req);
    const owner = await ownerContext(req, { resync: true });
    if (owner instanceof Response) return owner.status === 401 ? withCookies(ownerJson({ ok: false, code: "signed_out", error: "Only the apartment owner can invite." }, 403), owner.headers.getSetCookie?.() ?? []) : owner;
    const origin = baseUrl(req);
    const out: Record<string, unknown> = { ok: true, ttlMs: INVITE_TTL_MS };
    const expiries: number[] = [];
    if (kind !== "watch") {
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
      if (!invite) return withCookies(ownerJson({ ok: false, code: "invite_failed", error: MINT_FAILED }, 503), owner.setCookies);
      const exp = "expiresAt" in result && typeof result.expiresAt === "number" ? result.expiresAt : Date.now() + INVITE_TTL_MS;
      out.line = inviteLine(origin, invite);
      out.invite = invite;
      out.lineExpiresAt = exp;
      expiries.push(exp);
    }
    if (kind !== "line") {
      const watch = await mintWatch(owner.apartment.id);
      out.watchLink = `${origin}/room#watch=${watch.code}`;
      out.watchExpiresAt = watch.expiresAt;
      expiries.push(watch.expiresAt);
    }
    out.expiresAt = Math.min(...expiries);
    return withCookies(ownerJson(out), owner.setCookies);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

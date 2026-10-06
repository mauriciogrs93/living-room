import { ownerJson } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { currentAccount } from "@/lib/apartments/auth";
import { ensureApartment, hasWatchCookie, watchApartment, watchEndedResponse, withCookies } from "@/lib/apartments/resolve";
import { maskEmail } from "@/lib/apartments/mask";
import { INVITE_TTL_MS } from "@/lib/room/invite-ttl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is looking: the signed-in owner (provisions their one apartment on first call, or claims the
 * legacy room for LEGACY_OWNER_EMAIL), a watch-link guest, or nobody. Never returns ids or keys.
 */
export const GET = guarded(async (req) => {
  try {
    const { account, setCookies } = await currentAccount(req);
    if (account) {
      const got = await ensureApartment(account, req);
      if (got instanceof Response) return withCookies(got, setCookies);
      return withCookies(
        ownerJson({
          ok: true,
          role: "owner",
          email: maskEmail(account.email),
          apartment: { legacy: got.apartment.legacy, created: got.created, claimedLegacy: got.claimedLegacy },
          invite: { ttlMs: INVITE_TTL_MS },
        }),
        setCookies,
      );
    }
    if (await watchApartment(req)) return withCookies(ownerJson({ ok: true, role: "watch" }), setCookies);
    if (hasWatchCookie(req)) return watchEndedResponse(setCookies);
    return withCookies(ownerJson({ ok: true, role: "none" }), setCookies);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

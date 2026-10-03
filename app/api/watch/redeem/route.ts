import { ownerJson, readJson, sameOrigin } from "@/lib/http";
import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { ipKey, limited, redeemWatch, watchCookie } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COPY: Record<string, string> = {
  watch_expired: "This watch link has expired. Ask the owner for a new one.",
  watch_used: "This watch link was already used. Ask the owner for a new one.",
  watch_cancelled: "This watch link was cancelled. Ask the owner for a new one.",
  watch_invalid: "This watch link isn't valid. Ask the owner for a new one.",
};

/** Watch link -> a read-only watch session for that one apartment (HttpOnly __Host-lr_watch cookie). */
export const POST = guarded(async (req) => {
  try {
    if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
    const perIp = await limited(`watch-ip:${ipKey(req)}`, LIMITS.watchPerIp, "Too many watch links from here. Wait a few minutes.", "watch_rate_limited");
    if (perIp) return perIp;
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const raw = body.value && typeof body.value === "object" ? (body.value as { code?: unknown }).code : "";
    const result = await redeemWatch(typeof raw === "string" ? raw : "");
    if (!result.ok) {
      const status = result.code === "watch_expired" ? 410 : 403;
      return ownerJson({ ok: false, code: result.code, error: COPY[result.code] ?? COPY.watch_invalid }, status);
    }
    const maxAge = Math.max(1, Math.floor((result.expiresMs - Date.now()) / 1000));
    return ownerJson({ ok: true, expiresAt: result.expiresMs }, 200, { "Set-Cookie": watchCookie(result.token, maxAge) });
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

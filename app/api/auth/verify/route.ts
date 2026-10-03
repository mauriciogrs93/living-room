import { ownerJson, readJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient, EMAIL_RE } from "@/lib/apartments/auth";
import { ipKey, limited, withCookies } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** v21 sign-in step 2 (code path): the 6-digit code from the email. The link path is /auth/callback. */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const perIp = await limited(`verify-ip:${ipKey(req)}`, LIMITS.verifyPerIp, "Too many tries. Wait a few minutes.", "signin_rate_limited");
  if (perIp) return perIp;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const v = body.value && typeof body.value === "object" ? (body.value as { email?: unknown; code?: unknown }) : {};
  const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : "";
  const code = typeof v.code === "string" ? v.code.replace(/\s+/g, "") : "";
  if (!EMAIL_RE.test(email) || !/^\d{6,10}$/.test(code)) return ownerJson({ ok: false, code: "code_invalid", error: "Enter the code from the email." }, 400);
  const auth = authClient(req);
  if (!auth) return ownerJson({ ok: false, error: "Sign-in is not configured." }, 503);
  const { error } = await auth.client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return withCookies(ownerJson({ ok: false, code: "code_invalid", error: "That code didn't work. It may have expired. Send a new link." }, 401), auth.setCookies());
  return withCookies(ownerJson({ ok: true }), auth.setCookies());
});

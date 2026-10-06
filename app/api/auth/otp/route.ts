import { createHash } from "node:crypto";
import { ownerJson, readJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient, EMAIL_LIMIT_COPY, EMAIL_RE, isEmailRateLimit, signInRedirectUrl } from "@/lib/apartments/auth";
import { ipKey, limited, withCookies } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v21 r2 sign-in: Supabase's DEFAULT magic-link email (the template can't be changed on the free tier), PKCE.
 * signInWithOtp runs here with the @supabase/ssr server client (flowType pkce): it stores the code verifier
 * in this browser's HttpOnly cookie and asks Supabase to send {{ .ConfirmationURL }} -> /auth/v1/verify ->
 * emailRedirectTo = <this origin>/auth/callback. Supabase only redirects to URLs on its allow-list
 * (production's /auth/callback), so a real email from a preview lands on production.
 * Our own limits run BEFORE the address is checked: per IP, per address (hashed), and site-wide.
 */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const perIp = await limited(`otp-ip:${ipKey(req)}`, LIMITS.otpPerIp, EMAIL_LIMIT_COPY, "email_rate_limited");
  if (perIp) return perIp;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const raw = body.value && typeof body.value === "object" ? (body.value as { email?: unknown }).email : "";
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return ownerJson({ ok: false, code: "email_invalid", error: "Enter a valid email address." }, 400);
  const emailKey = createHash("sha256").update(`lr-email|${email}`).digest("hex").slice(0, 24);
  const perEmail = await limited(`otp-email:${emailKey}`, LIMITS.otpPerEmail, EMAIL_LIMIT_COPY, "email_rate_limited");
  if (perEmail) return perEmail;
  const global = await limited("otp-all", LIMITS.otpGlobal, EMAIL_LIMIT_COPY, "email_rate_limited");
  if (global) return global;
  const auth = authClient(req);
  if (!auth) return ownerJson({ ok: false, error: "Sign-in is not configured." }, 503);
  let error: { status?: number; code?: string } | null = null;
  try {
    ({ error } = await auth.client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: signInRedirectUrl(req) },
    }));
  } catch {
    error = { status: 0, code: "network" };
  }
  if (error) {
    console.warn("[auth] otp send failed", error.status ?? 0, error.code ?? "");
    if (isEmailRateLimit(error)) {
      return withCookies(ownerJson({ ok: false, code: "email_rate_limited", error: EMAIL_LIMIT_COPY }, 429, { "Retry-After": "3600" }), auth.setCookies());
    }
    return withCookies(ownerJson({ ok: false, code: "email_failed", error: "We couldn't send the email. Try again in a minute." }, 502), auth.setCookies());
  }
  return withCookies(ownerJson({ ok: true }), auth.setCookies());
});

import { createHash } from "node:crypto";
import { baseUrl, ownerJson, readJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient, EMAIL_RE } from "@/lib/apartments/auth";
import { ipKey, limited, withCookies } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v21 sign-in step 1: email a one-time sign-in link (and code, if the email template includes it).
 * Limits run BEFORE the address is checked: per IP, per address (hashed), and site-wide (the signup ceiling).
 */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const perIp = await limited(`otp-ip:${ipKey(req)}`, LIMITS.otpPerIp, "Too many sign-in emails from here. Wait a few minutes.", "signin_rate_limited");
  if (perIp) return perIp;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const raw = body.value && typeof body.value === "object" ? (body.value as { email?: unknown }).email : "";
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return ownerJson({ ok: false, code: "email_invalid", error: "Enter a valid email address." }, 400);
  const emailKey = createHash("sha256").update(`lr-email|${email}`).digest("hex").slice(0, 24);
  const perEmail = await limited(`otp-email:${emailKey}`, LIMITS.otpPerEmail, "We just sent a link to that address. Check your inbox, or wait a few minutes.", "signin_rate_limited");
  if (perEmail) return perEmail;
  const global = await limited("otp-all", LIMITS.otpGlobal, "Sign-ups are busy right now. Try again later.", "signin_rate_limited");
  if (global) return global;
  const auth = authClient(req);
  if (!auth) return ownerJson({ ok: false, error: "Sign-in is not configured." }, 503);
  const { error } = await auth.client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${baseUrl(req)}/auth/callback` },
  });
  if (error) {
    console.warn("[auth] otp send failed", error.status ?? 0, error.code ?? "");
    const status = error.status === 429 ? 429 : 502;
    const extra = status === 429 ? { "Retry-After": "60" } : undefined;
    return withCookies(ownerJson({ ok: false, code: status === 429 ? "signin_rate_limited" : "email_failed", error: status === 429 ? "Too many sign-in emails. Wait a minute." : "We couldn't send the email. Try again in a minute." }, status, extra), auth.setCookies());
  }
  return withCookies(ownerJson({ ok: true, message: "Check your email for the sign-in link." }), auth.setCookies());
});

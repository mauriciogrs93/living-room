import { ownerJson, readJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient, isEmailRateLimit } from "@/lib/apartments/auth";
import { ipKey, limited, withCookies } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";
import { emailLimitKey, normalEmail } from "@/lib/auth/email";
import { passwordIssue } from "@/lib/auth/password";
import { ENTER_EMAIL, ENTER_PASSWORD, SIGN_IN_MISMATCH, TOO_LONG, TOO_MANY, TOO_SHORT, UNAVAILABLE } from "@/lib/auth/strings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MISMATCH = () => ownerJson({ ok: false, code: "invalid_credentials", error: SIGN_IN_MISMATCH }, 401);

/** Email + password sign-in. Every Supabase failure uses the same line. */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const perIp = await limited(`password-ip:${ipKey(req)}`, LIMITS.passwordPerIp, TOO_MANY, "rate_limited");
  if (perIp) return perIp;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" ? (body.value as { email?: unknown; password?: unknown }) : {};
  const email = normalEmail(value.email);
  if (!email) return ownerJson({ ok: false, code: "email_invalid", error: ENTER_EMAIL }, 400);
  const perEmail = await limited(`password-email:${emailLimitKey(email)}`, LIMITS.passwordPerEmail, TOO_MANY, "rate_limited");
  if (perEmail) return perEmail;
  const issue = passwordIssue(value.password);
  if (issue === "empty") return ownerJson({ ok: false, code: "password_invalid", error: ENTER_PASSWORD }, 400);
  if (issue === "short") return ownerJson({ ok: false, code: "password_invalid", error: TOO_SHORT }, 400);
  if (issue === "long") return ownerJson({ ok: false, code: "password_invalid", error: TOO_LONG }, 400);
  const auth = authClient(req);
  if (!auth) return ownerJson({ ok: false, code: "unavailable", error: UNAVAILABLE }, 503);
  let error: { status?: number; code?: string } | null = null;
  try {
    ({ error } = await auth.client.auth.signInWithPassword({ email, password: String(value.password) }));
  } catch {
    error = { status: 0, code: "network" };
  }
  if (error) {
    console.warn("[auth] password sign-in failed", error.status ?? 0, error.code ?? "");
    if (isEmailRateLimit(error)) return withCookies(ownerJson({ ok: false, code: "rate_limited", error: TOO_MANY }, 429, { "Retry-After": "900" }), auth.setCookies());
    if (!error.status && error.code === "network") return withCookies(ownerJson({ ok: false, code: "unavailable", error: UNAVAILABLE }, 502), auth.setCookies());
    return withCookies(MISMATCH(), auth.setCookies());
  }
  return withCookies(ownerJson({ ok: true }), auth.setCookies());
});

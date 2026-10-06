import { ownerJson, readJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient, isEmailRateLimit, EMAIL_LIMIT_COPY, signInRedirectUrl } from "@/lib/apartments/auth";
import { ipKey, limited, withCookies } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";
import { markPasswordSet } from "@/lib/auth/admin";
import { emailLimitKey, normalEmail } from "@/lib/auth/email";
import { passwordIssue } from "@/lib/auth/password";
import { ENTER_EMAIL, ENTER_PASSWORD, PASSWORD_SIGNUP_ENABLED, TOO_LONG, TOO_MANY, TOO_SHORT, UNAVAILABLE } from "@/lib/auth/strings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create an account. 404 while the sign-up switch is off. Existing accounts get the same no-session reply. */
export async function handleSignup(req: Request, enabled: boolean) {
  if (!enabled) return ownerJson({ ok: false, error: "Not found." }, 404);
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const perIp = await limited(`signup-ip:${ipKey(req)}`, LIMITS.signupPerIp, TOO_MANY, "rate_limited");
  if (perIp) return perIp;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" ? (body.value as { email?: unknown; password?: unknown }) : {};
  const email = normalEmail(value.email);
  if (!email) return ownerJson({ ok: false, code: "email_invalid", error: ENTER_EMAIL }, 400);
  const perEmail = await limited(`signup-email:${emailLimitKey(email)}`, LIMITS.signupPerEmail, TOO_MANY, "rate_limited");
  if (perEmail) return perEmail;
  const global = await limited("signup-all", LIMITS.signupGlobal, TOO_MANY, "rate_limited");
  if (global) return global;
  const issue = passwordIssue(value.password);
  if (issue === "empty") return ownerJson({ ok: false, code: "password_invalid", error: ENTER_PASSWORD }, 400);
  if (issue === "short") return ownerJson({ ok: false, code: "password_invalid", error: TOO_SHORT }, 400);
  if (issue === "long") return ownerJson({ ok: false, code: "password_invalid", error: TOO_LONG }, 400);
  const auth = authClient(req);
  if (!auth) return ownerJson({ ok: false, code: "unavailable", error: UNAVAILABLE }, 503);
  let error: { status?: number; code?: string } | null = null;
  let userId = "";
  let signedIn = false;
  try {
    const result = await auth.client.auth.signUp({
      email,
      password: String(value.password),
      options: { emailRedirectTo: signInRedirectUrl(req) },
    });
    error = result.error;
    userId = result.data.user?.id ?? "";
    signedIn = Boolean(result.data.session);
  } catch {
    error = { status: 0, code: "network" };
  }
  if (error) {
    console.warn("[auth] signup failed", error.status ?? 0, error.code ?? "");
    if (isEmailRateLimit(error)) {
      return withCookies(ownerJson({ ok: false, code: "email_rate_limited", error: EMAIL_LIMIT_COPY }, 429, { "Retry-After": "3600" }), auth.setCookies());
    }
    if (error.code === "weak_password") return withCookies(ownerJson({ ok: false, code: "password_invalid", error: TOO_SHORT }, 400), auth.setCookies());
    if (!error.status && error.code === "network") return withCookies(ownerJson({ ok: false, code: "unavailable", error: UNAVAILABLE }, 502), auth.setCookies());
    // Same reply as a new account that still needs a confirmation email. Does not say the address exists.
    return withCookies(ownerJson({ ok: true, signedIn: false }), auth.setCookies());
  }
  if (userId) {
    const marked = await markPasswordSet(userId);
    if (!marked.ok) console.warn("[auth] password flag not set", marked.status, marked.code);
  }
  return withCookies(ownerJson({ ok: true, signedIn }), auth.setCookies());
}

export const POST = guarded((req) => handleSignup(req, PASSWORD_SIGNUP_ENABLED));

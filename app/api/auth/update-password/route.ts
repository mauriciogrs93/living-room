import { ownerJson, readJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient, currentAccount, forgetCachedUser } from "@/lib/apartments/auth";
import { hasWatchCookie, ipKey, limited, withCookies } from "@/lib/apartments/resolve";
import { LIMITS } from "@/lib/apartments/limits";
import { markPasswordSet } from "@/lib/auth/admin";
import { passwordIssue } from "@/lib/auth/password";
import { ENTER_PASSWORD, SAVE_FAILED, TOO_LONG, TOO_MANY, TOO_SHORT, UNAVAILABLE } from "@/lib/auth/strings";
import { passwordMatches } from "@/lib/auth/verify-password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failed = (status = 400) => ownerJson({ ok: false, code: "password_failed", error: SAVE_FAILED }, status);

/** Set or change the signed-in owner's password. A watch session cannot. */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const perIp = await limited(`password-update-ip:${ipKey(req)}`, LIMITS.passwordUpdatePerIp, TOO_MANY, "rate_limited");
  if (perIp) return perIp;
  const { account, setCookies } = await currentAccount(req);
  if (!account) {
    if (hasWatchCookie(req)) return withCookies(ownerJson({ ok: false, code: "watch_read_only", error: SAVE_FAILED }, 403), setCookies);
    return withCookies(ownerJson({ ok: false, code: "signed_out", error: SAVE_FAILED }, 403), setCookies);
  }
  const body = await readJson(req);
  if (!body.ok) return withCookies(body.response, setCookies);
  const value = body.value && typeof body.value === "object" ? (body.value as { password?: unknown; currentPassword?: unknown }) : {};
  const issue = passwordIssue(value.password);
  if (issue === "empty") return withCookies(ownerJson({ ok: false, code: "password_invalid", error: ENTER_PASSWORD }, 400), setCookies);
  if (issue === "short") return withCookies(ownerJson({ ok: false, code: "password_invalid", error: TOO_SHORT }, 400), setCookies);
  if (issue === "long") return withCookies(ownerJson({ ok: false, code: "password_invalid", error: TOO_LONG }, 400), setCookies);
  if (account.passwordSet) {
    const currentIssue = passwordIssue(value.currentPassword);
    if (currentIssue === "empty") return withCookies(ownerJson({ ok: false, code: "password_invalid", error: ENTER_PASSWORD }, 400), setCookies);
    const matches = await passwordMatches(account.email, String(value.currentPassword));
    if (!matches) return withCookies(failed(), setCookies);
  }
  const auth = authClient(req);
  if (!auth) return withCookies(ownerJson({ ok: false, code: "unavailable", error: UNAVAILABLE }, 503), setCookies);
  let error: { status?: number; code?: string } | null = null;
  try {
    ({ error } = await auth.client.auth.updateUser({ password: String(value.password) }));
  } catch {
    error = { status: 0, code: "network" };
  }
  if (error) {
    console.warn("[auth] update password failed", error.status ?? 0, error.code ?? "");
    return withCookies(failed(error.code === "network" ? 502 : 400), auth.setCookies());
  }
  const marked = await markPasswordSet(account.id);
  if (!marked.ok) {
    console.warn("[auth] password flag not set", marked.status, marked.code);
    return withCookies(failed(503), auth.setCookies());
  }
  await auth.client.auth.signOut({ scope: "others" }).catch((signOutError: { status?: number; code?: string }) => {
    console.warn("[auth] revoke other sessions failed", signOutError?.status ?? 0, signOutError?.code ?? "");
  });
  forgetCachedUser(account.id);
  return withCookies(ownerJson({ ok: true, passwordSet: true }), auth.setCookies());
});

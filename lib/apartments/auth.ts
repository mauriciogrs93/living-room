import { createServerClient } from "@supabase/ssr";
import { createHash } from "node:crypto";
import { EMAIL_LIMIT_COPY } from "@/lib/auth/strings";
import { baseUrl, cookieValue } from "@/lib/http";

export { EMAIL_LIMIT_COPY };

/**
 * v21 accounts: Supabase Auth email sign-in, server side only. The browser never gets a Supabase key:
 * every auth call goes through our routes with the publishable key, and the session lives in Supabase's
 * own HttpOnly cookies (sb-<ref>-auth-token*). The service-role key is never used for auth.
 */
export type Account = { id: string; email: string; emailVerified: boolean; passwordSet: boolean };

/** Supabase's cookie lifetime (400 days). Used when a write arrives without Max-Age, so a session is never a session cookie. */
export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function authConfig(): { url: string; key: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}

type PendingCookie = { name: string; value: string; options: Record<string, unknown> };

function parseCookies(req: Request) {
  const header = req.headers.get("cookie") ?? "";
  const out: { name: string; value: string }[] = [];
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    out.push({ name, value: part.slice(index + 1).trim() });
  }
  return out;
}

/**
 * Same flags the auth routes already set: the library's Max-Age (default 400 days) and Path,
 * forced HttpOnly, Secure, SameSite=Lax. A non-empty cookie with no Max-Age gets 400 days
 * so it cannot become a browser session cookie. Clearing (Max-Age 0) is left alone.
 */
export function serializeAuthCookie(cookie: { name: string; value: string; options?: Record<string, unknown> }) {
  const o = (cookie.options ?? {}) as { maxAge?: number; path?: string; expires?: Date };
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${o.path ?? "/"}`];
  let maxAge = typeof o.maxAge === "number" ? Math.floor(o.maxAge) : undefined;
  if (maxAge === undefined && cookie.value) maxAge = AUTH_COOKIE_MAX_AGE;
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  if (o.expires instanceof Date) parts.push(`Expires=${o.expires.toUTCString()}`);
  parts.push("HttpOnly", "Secure", "SameSite=Lax");
  return parts.join("; ");
}

/** One Supabase auth client per request. Refreshed or cleared session cookies are collected for the reply. */
export function authClient(req: Request) {
  const config = authConfig();
  if (!config) return null;
  const pending: PendingCookie[] = [];
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => parseCookies(req),
      setAll: (list) => {
        for (const item of list) pending.push({ name: item.name, value: item.value, options: (item.options ?? {}) as Record<string, unknown> });
      },
    },
    auth: { flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
  });
  return {
    client,
    /** Set-Cookie values to add to the response (session refresh / sign-in / sign-out). */
    setCookies: () => pending.map(serializeAuthCookie),
  };
}

export function hasAuthCookie(req: Request) {
  return parseCookies(req).some((c) => /^sb-[a-z0-9]+-auth-token/.test(c.name));
}

type CachedUser = { account: Account; at: number };
const userCache = new Map<string, CachedUser>();
const USER_CACHE_MS = 30_000;

/**
 * The signed-in account, verified with Supabase Auth (getUser), cached per access token for 30 s so a
 * polling tab doesn't call Auth every second. Returns the cookies to set when the session was refreshed.
 */
/** Drop cached accounts so a password-flag change is visible on the next /api/me. */
export function forgetCachedUser(userId: string) {
  for (const [key, hit] of userCache) if (hit.account.id === userId) userCache.delete(key);
}

export async function currentAccount(req: Request): Promise<{ account: Account | null; setCookies: string[] }> {
  if (!hasAuthCookie(req)) return { account: null, setCookies: [] };
  const auth = authClient(req);
  if (!auth) return { account: null, setCookies: [] };
  try {
    const { data } = await auth.client.auth.getSession();
    const token = data.session?.access_token ?? "";
    if (!token) return { account: null, setCookies: auth.setCookies() };
    const key = createHash("sha256").update(token).digest("hex");
    const hit = userCache.get(key);
    if (hit && Date.now() - hit.at < USER_CACHE_MS) return { account: hit.account, setCookies: auth.setCookies() };
    const { data: got, error } = await auth.client.auth.getUser(token);
    if (error || !got.user) return { account: null, setCookies: auth.setCookies() };
    const meta = (got.user.app_metadata ?? {}) as { lr_password_set?: unknown };
    const account: Account = {
      id: got.user.id,
      email: (got.user.email ?? "").toLowerCase(),
      emailVerified: Boolean(got.user.email_confirmed_at),
      passwordSet: meta.lr_password_set === true,
    };
    userCache.set(key, { account, at: Date.now() });
    if (userCache.size > 2000) userCache.delete(userCache.keys().next().value!);
    return { account, setCookies: auth.setCookies() };
  } catch {
    return { account: null, setCookies: auth.setCookies() };
  }
}

/**
 * v21 r2: where Supabase's verify step sends the browser: this deployment's own /auth/callback (a preview's
 * URL on a preview, production's on production). Supabase honours it only if it is on the redirect allow-list.
 */
export function signInRedirectUrl(req: Request) {
  return `${baseUrl(req)}/auth/callback`;
}

/** Supabase's own email limit: HTTP 429, or the over_email_send_rate_limit / over_request_rate_limit codes. */
export function isEmailRateLimit(error: { status?: number; code?: string } | null | undefined) {
  if (!error) return false;
  return error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

/** Keeps one value from the cookie header (used by tests and the watch cookie). */
export { cookieValue };

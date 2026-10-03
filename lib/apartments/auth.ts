import { createServerClient } from "@supabase/ssr";
import { createHash } from "node:crypto";
import { cookieValue } from "@/lib/http";

/**
 * v21 accounts: Supabase Auth email sign-in, server side only. The browser never gets a Supabase key:
 * every auth call goes through our routes with the publishable key, and the session lives in Supabase's
 * own HttpOnly cookies (sb-<ref>-auth-token*). The service-role key is never used for auth.
 */
export type Account = { id: string; email: string; emailVerified: boolean };

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

function serialize(cookie: PendingCookie) {
  const o = cookie.options as { maxAge?: number; path?: string; sameSite?: string | boolean; secure?: boolean; httpOnly?: boolean; expires?: Date };
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${o.path ?? "/"}`];
  if (typeof o.maxAge === "number") parts.push(`Max-Age=${Math.floor(o.maxAge)}`);
  if (o.expires instanceof Date) parts.push(`Expires=${o.expires.toUTCString()}`);
  // v21: auth cookies are always HttpOnly + Secure + SameSite=Lax (the browser never reads them).
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
    setCookies: () => pending.map(serialize),
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
    const account: Account = {
      id: got.user.id,
      email: (got.user.email ?? "").toLowerCase(),
      emailVerified: Boolean(got.user.email_confirmed_at),
    };
    userCache.set(key, { account, at: Date.now() });
    if (userCache.size > 2000) userCache.delete(userCache.keys().next().value!);
    return { account, setCookies: auth.setCookies() };
  } catch {
    return { account: null, setCookies: auth.setCookies() };
  }
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

/** Keeps one value from the cookie header (used by tests and the watch cookie). */
export { cookieValue };

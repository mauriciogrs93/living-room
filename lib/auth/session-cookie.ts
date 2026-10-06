/** Read a Supabase auth cookie (single or chunked, optional `base64-` prefix) and return access-token expiry (unix seconds). */
const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.(\d+))?$/;

type Session = { expires_at?: number; access_token?: string };

function decodeSession(raw: string): Session | null {
  let value = raw;
  if (value.startsWith("base64-")) {
    try {
      const b64 = value.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
      value = Buffer.from(b64 + pad, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(value) as Session;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function jwtExp(token: string | undefined) {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

export function readSessionExpiry(cookies: { name: string; value: string }[]) {
  const groups = new Map<string, { i: number; value: string }[]>();
  for (const cookie of cookies) {
    const match = AUTH_COOKIE.exec(cookie.name);
    if (!match) continue;
    const base = cookie.name.replace(/\.\d+$/, "");
    const list = groups.get(base) ?? [];
    list.push({ i: match[1] === undefined ? -1 : Number(match[1]), value: cookie.value });
    groups.set(base, list);
  }
  for (const list of groups.values()) {
    const chunks = list.filter((item) => item.i >= 0).sort((a, b) => a.i - b.i);
    const use = chunks.length ? chunks : list;
    const session = decodeSession(use.map((item) => item.value).join(""));
    if (!session) continue;
    if (typeof session.expires_at === "number") return session.expires_at;
    const exp = jwtExp(session.access_token);
    if (exp !== null) return exp;
  }
  return null;
}

/** Paths the session proxy is allowed to run on. Everything else, including 3D assets, is absent on purpose. */
export const PROXY_MATCHER = ["/room", "/room/:path*", "/account/:path*", "/api/me"];

export function proxyMatches(pathname: string) {
  if (pathname === "/room" || pathname === "/api/me") return true;
  if (pathname.startsWith("/room/")) return true;
  if (pathname.startsWith("/account/")) return true;
  return false;
}

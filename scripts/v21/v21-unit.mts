// v21 r2 unit checks, no network, no email: Supabase Auth is a local stub (globalThis.fetch).
//   npx tsx scripts/v21/v21-unit.mts
// Covers: PKCE sign-in (signInWithOtp sets this browser's code-verifier cookie, emailRedirectTo is the request's
// own origin, also on a preview), Supabase's 429 / over_email_send_rate_limit -> Writer's line, /auth/callback
// (code only; another browser fails; an earlier email still works after "Send it again"; next = same-site path),
// APARTMENT_OWNER_SECRET required in production, and the 30 s user -> apartment cache (never another user's).
// Prints PASS/FAIL lines only; never keys, tokens or codes.
import { createHash, randomBytes } from "node:crypto";

process.env.ROOM_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stubref.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_stub";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.APARTMENT_OWNER_SECRET;
delete process.env.VERCEL_ENV;
delete process.env.PUBLIC_BASE_URL;
delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

const results: boolean[] = [];
function check(name: string, ok: unknown, detail = "") {
  results.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---------- a tiny Supabase Auth stub ----------
type Seen = { url: string; body: Record<string, unknown>; auth: string };
const seen: Seen[] = [];
let otpReply: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };
const challenges: string[] = [];
const users = new Map<string, { id: string; email: string }>(); // access token -> user
let nextCodeFor: number | null = null; // which otp request (challenge index) the next code belongs to
const codes = new Map<string, { challenge: string; user: { id: string; email: string } }>();
const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fakeJwt(sub: string) {
  const head = b64u(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })));
  return `${head}.${body}.${b64u(randomBytes(16))}`;
}
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const headers = new Headers(init?.headers);
  seen.push({ url, body, auth: headers.get("authorization") ?? "" });
  const reply = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const u = new URL(url);
  if (u.pathname === "/auth/v1/otp") {
    if (typeof body.code_challenge === "string") challenges.push(body.code_challenge);
    return reply(otpReply.status, otpReply.body);
  }
  if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "pkce") {
    const entry = codes.get(String(body.auth_code));
    if (!entry) return reply(404, { code: 404, error_code: "flow_state_not_found", msg: "invalid flow state" });
    const challenge = b64u(createHash("sha256").update(String(body.code_verifier)).digest());
    if (challenge !== entry.challenge) return reply(400, { code: 400, error_code: "bad_code_verifier", msg: "code challenge does not match previously saved code verifier" });
    codes.delete(String(body.auth_code));
    const access = fakeJwt(entry.user.id);
    users.set(access, entry.user);
    const user = { id: entry.user.id, aud: "authenticated", role: "authenticated", email: entry.user.email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    return reply(200, { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: b64u(randomBytes(12)), user });
  }
  if (u.pathname === "/auth/v1/user") {
    const token = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const user = users.get(token);
    if (!user) return reply(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return reply(200, { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  }
  return reply(404, { msg: "stub: unknown route" });
}) as typeof fetch;
void nextCodeFor;

/** A per-"browser" cookie jar. */
class Jar {
  map = new Map<string, string>();
  take(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i).trim();
      const value = pair!.slice(i + 1).trim();
      const maxAge = attrs.map((a) => a.trim()).find((a) => /^max-age=/i.test(a));
      if (!value || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.map.delete(name);
      else this.map.set(name, value);
    }
    return res;
  }
  header() {
    return [...this.map].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
let ipN = 1;
function req(url: string, init: { method?: string; body?: unknown; jar?: Jar; host?: string } = {}) {
  const u = new URL(url);
  const headers = new Headers({ "content-type": "application/json", host: init.host ?? u.host, "x-forwarded-for": `10.200.0.${ipN++}`, "x-forwarded-proto": u.protocol.replace(":", "") });
  if (init.jar?.header()) headers.set("cookie", init.jar.header());
  if (init.method === "POST") headers.set("origin", u.origin);
  return new Request(url, { method: init.method ?? "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
}

const { safeNext } = await import("../../lib/apartments/next-path");
const { signInRedirectUrl, isEmailRateLimit, EMAIL_LIMIT_COPY } = await import("../../lib/apartments/auth");
const otp = await import("../../app/api/auth/otp/route");
const callback = await import("../../app/auth/callback/route");
const meRoute = await import("../../app/api/me/route");
const stateRoute = await import("../../app/api/state/route");
const resolve = await import("../../lib/apartments/resolve");
const { directory } = await import("../../lib/apartments/directory");
const { accountIdentity, ownerSecret } = await import("../../lib/apartments/identity");
const { roomFailure } = await import("../../lib/room/access");

// ---------- next: same-site paths only ----------
const nexts: [string | null, string][] = [
  [null, "/room"], ["/room", "/room"], ["/room?x=1#y", "/room?x=1#y"], ["//evil.example/x", "/room"], ["/\\evil.example", "/room"],
  ["https://evil.example/", "/room"], ["javascript:alert(1)", "/room"], ["room", "/room"], ["/%2F%2Fevil.example", "/%2F%2Fevil.example"], ["/a\nb", "/room"],
];
check("next is honoured only as a same-site path (//host, /\\host, schemes, relative, control chars -> /room)", nexts.every(([raw, want]) => safeNext(raw) === want), nexts.filter(([r, w]) => safeNext(r) !== w).map(([r]) => JSON.stringify(r)).join(" "));

// ---------- emailRedirectTo follows the request's own origin ----------
const PREVIEW_HOST = "living-room-abc123-mauriciogrs93s-projects.vercel.app";
process.env.VERCEL_ENV = "preview";
process.env.VERCEL_PROJECT_PRODUCTION_URL = "living-room-psi.vercel.app";
check("on a preview, emailRedirectTo = <preview origin>/auth/callback (never production)", signInRedirectUrl(req(`https://${PREVIEW_HOST}/api/auth/otp`)) === `https://${PREVIEW_HOST}/auth/callback`);
process.env.VERCEL_ENV = "production";
check("on production, emailRedirectTo = https://living-room-psi.vercel.app/auth/callback", signInRedirectUrl(req("https://living-room-psi.vercel.app/api/auth/otp")) === "https://living-room-psi.vercel.app/auth/callback");
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
check("Supabase's email limit is recognised (429, over_email_send_rate_limit, over_request_rate_limit)", isEmailRateLimit({ status: 429 }) && isEmailRateLimit({ status: 400, code: "over_email_send_rate_limit" }) && isEmailRateLimit({ code: "over_request_rate_limit" }) && !isEmailRateLimit({ status: 400, code: "email_address_invalid" }));

// ---------- POST /api/auth/otp (PKCE) ----------
process.env.VERCEL_ENV = "preview";
process.env.SUPABASE_SECRET_KEY = "stub-preview-secret"; // previews may fall back
const browser1 = new Jar();
otpReply = { status: 200, body: {} };
seen.length = 0;
const sent1 = browser1.take(await otp.POST(req(`https://${PREVIEW_HOST}/api/auth/otp`, { method: "POST", body: { email: "someone@example.com" }, jar: browser1 })));
const otpCall = seen.find((s) => s.url.includes("/auth/v1/otp"));
const redirectTo = otpCall ? new URL(otpCall.url).searchParams.get("redirect_to") : "";
check("otp: 200 and Supabase was asked with a PKCE code_challenge (S256)", sent1.status === 200 && typeof otpCall?.body.code_challenge === "string" && otpCall?.body.code_challenge_method === "s256", `status ${sent1.status}, method ${otpCall?.body.code_challenge_method}`);
check("otp: redirect_to is exactly <this preview>/auth/callback (no flow id, no query)", redirectTo === `https://${PREVIEW_HOST}/auth/callback`, redirectTo ?? "");
const verifierCookie = sent1.headers.getSetCookie().find((c) => /^sb-stubref-auth-token-code-verifier=/.test(c)) ?? "";
check("otp: the code verifier is stored in THIS browser as an HttpOnly, Secure, SameSite=Lax cookie", /HttpOnly/.test(verifierCookie) && /Secure/.test(verifierCookie) && /SameSite=Lax/.test(verifierCookie));
otpReply = { status: 429, body: { code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" } }; // GoTrue's shape
const limitedRes = await otp.POST(req(`https://${PREVIEW_HOST}/api/auth/otp`, { method: "POST", body: { email: "someone@example.com" }, jar: new Jar() }));
const limitedBody = (await limitedRes.json()) as { code?: string; error?: string };
check("otp: Supabase 429 over_email_send_rate_limit -> 429 'Too many emails for now. Try again in an hour.' + Retry-After", limitedRes.status === 429 && limitedBody.error === "Too many emails for now. Try again in an hour." && limitedBody.error === EMAIL_LIMIT_COPY && limitedBody.code === "email_rate_limited" && Number(limitedRes.headers.get("retry-after")) > 0, `${limitedRes.status} ${limitedBody.code}`);
otpReply = { status: 400, body: { code: 400, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" } };
const limited2 = await otp.POST(req(`https://${PREVIEW_HOST}/api/auth/otp`, { method: "POST", body: { email: "other@example.com" }, jar: new Jar() }));
check("otp: the over_email_send_rate_limit code alone (any status) maps the same", limited2.status === 429 && ((await limited2.json()) as { error?: string }).error === EMAIL_LIMIT_COPY);
otpReply = { status: 200, body: {} };

// ---------- GET /auth/callback ----------
const userA = { id: "11111111-1111-4111-8111-111111111111", email: "owner-a@example.com" };
const userB = { id: "22222222-2222-4222-8222-222222222222", email: "owner-b@example.com" };
codes.set("code-a", { challenge: challenges[0]!, user: userA });
const other = new Jar();
const wrongBrowser = await callback.GET(req(`https://${PREVIEW_HOST}/auth/callback?code=code-a`, { jar: other }));
check("callback in ANOTHER browser (no code verifier) -> 303 /room?signin=expired, no session, Supabase not even asked", wrongBrowser.status === 303 && wrongBrowser.headers.get("location") === "/room?signin=expired" && !wrongBrowser.headers.getSetCookie().some((c) => /^sb-stubref-auth-token=/.test(c)) && !seen.some((s) => s.url.includes("grant_type=pkce")));
const evilNext = encodeURIComponent("//evil.example/steal");
const good = browser1.take(await callback.GET(req(`https://${PREVIEW_HOST}/auth/callback?code=code-a&next=${evilNext}`, { jar: browser1 })));
check("callback in the browser that asked -> 303 to /room (a //host next ignored), Supabase session cookies set", good.status === 303 && good.headers.get("location") === "/room" && [...browser1.map.keys()].some((k) => /^sb-stubref-auth-token(\.0)?$/.test(k)), `${good.status} -> ${good.headers.get("location")}`);
check("callback: the code verifier cookie is cleared after use", !browser1.map.has("sb-stubref-auth-token-code-verifier"));
check("callback: redirects are relative (same origin as the callback, so a preview stays on its URL)", (good.headers.get("location") ?? "").startsWith("/"));
const noCode = await callback.GET(req(`https://${PREVIEW_HOST}/auth/callback`));
const errored = await callback.GET(req(`https://${PREVIEW_HOST}/auth/callback?error=access_denied&error_code=otp_expired`));
check("callback without a code -> /room?signin=invalid; Supabase's error (expired link) -> /room?signin=expired", noCode.headers.get("location") === "/room?signin=invalid" && errored.headers.get("location") === "/room?signin=expired");
const tokenHashTry = await callback.GET(req(`https://${PREVIEW_HOST}/auth/callback?token_hash=abc&type=magiclink`));
check("callback has no token_hash path (-> signin=invalid)", tokenHashTry.headers.get("location") === "/room?signin=invalid");

// "Send it again": two requests from one browser; the FIRST email's link must still work there.
const browser2 = new Jar();
const before = challenges.length;
browser2.take(await otp.POST(req(`https://${PREVIEW_HOST}/api/auth/otp`, { method: "POST", body: { email: userB.email }, jar: browser2 })));
browser2.take(await otp.POST(req(`https://${PREVIEW_HOST}/api/auth/otp`, { method: "POST", body: { email: userB.email }, jar: browser2 })));
codes.set("code-b-first", { challenge: challenges[before]!, user: userB });
const firstLink = browser2.take(await callback.GET(req(`https://${PREVIEW_HOST}/auth/callback?code=code-b-first&next=${encodeURIComponent("/room?from=email")}`, { jar: browser2 })));
check("after 'Send it again', the first email's link still signs in that browser (and a same-site next is kept)", firstLink.status === 303 && firstLink.headers.get("location") === "/room?from=email" && [...browser2.map.keys()].some((k) => /^sb-stubref-auth-token(\.0)?$/.test(k)), `${firstLink.status} -> ${firstLink.headers.get("location")}`);

// ---------- the 30 s user -> apartment cache ----------
const dir = directory();
const realForUser = dir.forUser.bind(dir);
let dbLookups = 0;
dir.forUser = async (id: string) => {
  dbLookups += 1;
  return realForUser(id);
};
resolve.clearApartmentCache();
const meA = await meRoute.GET(req(`https://${PREVIEW_HOST}/api/me`, { jar: browser1 }));
const meB = await meRoute.GET(req(`https://${PREVIEW_HOST}/api/me`, { jar: browser2 }));
check("/api/me creates one apartment each for A and B", meA.status === 200 && meB.status === 200);
const aptA = await realForUser(userA.id);
const aptB = await realForUser(userB.id);
dbLookups = 0;
const s1 = await stateRoute.GET(req(`https://${PREVIEW_HOST}/api/state`, { jar: browser1 }));
const s2 = await stateRoute.GET(req(`https://${PREVIEW_HOST}/api/state`, { jar: browser1 }));
check("A's state twice within 1 s: the second is a state-cache hit with NO database lookup (user and apartment cached)", s1.status === 200 && s2.headers.get("x-state-cache") === "hit" && dbLookups === 0, `lookups ${dbLookups}, cache ${s2.headers.get("x-state-cache")}`);
const a1 = await resolve.apartmentForUser(userA.id);
const b1 = await resolve.apartmentForUser(userB.id);
check("the cache answers A with A's apartment and B with B's, never the other's", a1?.id === aptA?.id && b1?.id === aptB?.id && a1?.id !== b1?.id);
if (a1) a1.id = aptB!.id; // a caller mutating its copy must not poison the cache
const a2 = await resolve.apartmentForUser(userA.id);
check("a returned apartment is a copy (mutating it can't change what A gets next)", a2?.id === aptA?.id);
const sA = await stateRoute.GET(req(`https://${PREVIEW_HOST}/api/state`, { jar: browser1 }));
const sB = await stateRoute.GET(req(`https://${PREVIEW_HOST}/api/state`, { jar: browser2 }));
const bodyA = await sA.text();
const bodyB = await sB.text();
check("A's and B's states (both inside the 1 s cache) are their own bodies", sA.status === 200 && sB.status === 200 && bodyA !== bodyB);
dbLookups = 0;
const none1 = await resolve.apartmentForUser("33333333-3333-4333-8333-333333333333");
const none2 = await resolve.apartmentForUser("33333333-3333-4333-8333-333333333333");
check("a user with no apartment is never cached (asks every time, gets null)", none1 === null && none2 === null && dbLookups === 2, `lookups ${dbLookups}`);
const realNow = Date.now;
Date.now = () => realNow() + resolve.APARTMENT_CACHE_MS + 1000;
dbLookups = 0;
const aLater = await resolve.apartmentForUser(userA.id);
Date.now = realNow;
check("after ~30 s the entry expires and the database is asked again", aLater?.id === aptA?.id && dbLookups === 1, `lookups ${dbLookups}`);
dir.forUser = realForUser;

// ---------- APARTMENT_OWNER_SECRET (Security) ----------
const errors: string[] = [];
const realError = console.error;
console.error = (...args: unknown[]) => void errors.push(args.map(String).join(" "));
process.env.VERCEL_ENV = "production";
process.env.SUPABASE_SECRET_KEY = "stub-prod-secret";
delete process.env.APARTMENT_OWNER_SECRET;
let thrown: unknown = null;
try {
  accountIdentity(userA.id);
} catch (error) {
  thrown = error;
}
const failure = roomFailure(thrown);
const failureBody = failure ? ((await failure.json()) as { code?: string; error?: string }) : {};
check("production without APARTMENT_OWNER_SECRET: no fallback to the Supabase secret key (throws)", thrown instanceof Error && thrown.name === "OwnerSecretMissing");
check("...and fails closed: 503 server_misconfigured with a clear message", failure?.status === 503 && failureBody.code === "server_misconfigured" && /set up/.test(failureBody.error ?? ""));
check("...and writes one clear log line naming APARTMENT_OWNER_SECRET (never a value)", errors.some((e) => e.includes("APARTMENT_OWNER_SECRET is missing in production")) && !errors.some((e) => e.includes("stub-prod-secret")));
const meProd = await meRoute.GET(req("https://living-room-psi.vercel.app/api/me", { jar: browser1 }));
const meProdBody = (await meProd.json()) as { code?: string };
check("...so a signed-in /api/me in production answers 503 server_misconfigured (no apartment lookup)", meProd.status === 503 && meProdBody.code === "server_misconfigured", `status ${meProd.status}`);
process.env.APARTMENT_OWNER_SECRET = "stub-owner-secret-0123456789abcdef";
const withSecret = accountIdentity(userA.id);
process.env.VERCEL_ENV = "preview";
delete process.env.APARTMENT_OWNER_SECRET;
const previewFallback = accountIdentity(userA.id);
check("with APARTMENT_OWNER_SECRET production works; a preview without it may fall back (different identity)", /^acct_[0-9a-f]{64}$/.test(withSecret) && /^acct_[0-9a-f]{64}$/.test(previewFallback) && withSecret !== previewFallback);
delete process.env.SUPABASE_SECRET_KEY;
let previewThrows = false;
try {
  ownerSecret();
} catch {
  previewThrows = true;
}
delete process.env.VERCEL_ENV;
check("a preview with no secret at all also refuses; local (no VERCEL_ENV) uses the dev-only constant", previewThrows && ownerSecret() === "lr-local-dev-only");
console.error = realError;

const fail = results.filter((r) => !r).length;
console.log(`\nv21-unit: ${results.length - fail} passed, ${fail} failed, ${results.length} total`);
process.exit(fail ? 1 : 0);

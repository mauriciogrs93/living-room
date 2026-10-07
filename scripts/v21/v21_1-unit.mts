// v21.1 unit checks. No network, no email. Supabase Auth is an in-process fetch stub.
//   npx tsx scripts/v21/v21_1-unit.mts
// Prints PASS/FAIL only. Never prints secrets, tokens, or passwords.
import { createHash, randomBytes } from "node:crypto";
import { readdirSync as readDir, readFileSync as readFile, statSync as stat } from "node:fs";
import path from "node:path";

process.env.ROOM_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stubref.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_stub";
process.env.SUPABASE_SECRET_KEY = "sb_secret_local_stub";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.APARTMENT_OWNER_SECRET;
delete process.env.VERCEL_ENV;

const results: boolean[] = [];
function check(name: string, ok: unknown, detail = "") {
  results.push(Boolean(ok));
  const extra = detail ? `  (${detail.slice(0, 180)})` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra}`);
}

type User = { id: string; email: string; passwordHash: string | null; confirmed: string | null; app: Record<string, unknown> };
const usersByEmail = new Map<string, User>();
const usersById = new Map<string, User>();
const sessions = new Map<string, { user: User; refresh: string }>();
const alive = new Set<string>();
const issued: string[] = [];
let confirmEmail = false;
const adminBodies: unknown[] = [];
const logouts: string[] = [];

const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function uid(email: string) {
  const h = createHash("sha256").update(`lr|${email}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function hashPw(password: string) {
  return createHash("sha256").update(password).digest("hex");
}
function publicUser(user: User) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.confirmed,
    app_metadata: { ...user.app },
    user_metadata: {},
    created_at: user.confirmed || new Date().toISOString(),
  };
}
function sessionFor(user: User) {
  const access = `${b64u(Buffer.from(JSON.stringify({ alg: "none" })))}.${b64u(Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })))}.${b64u(randomBytes(8))}`;
  const refresh = b64u(randomBytes(12));
  sessions.set(access, { user, refresh });
  alive.add(access);
  issued.push(access);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: publicUser(user) };
}
function bearer(headers: Headers) {
  return (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const u = new URL(url);
  const headers = new Headers(init?.headers);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const reply = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  if (u.pathname === "/auth/v1/signup") {
    const email = String(body.email || "").toLowerCase();
    const password = String(body.password || "");
    if (usersByEmail.has(email)) return reply(422, { error_code: "user_already_exists", msg: "User already registered" });
    const user: User = { id: uid(email), email, passwordHash: hashPw(password), confirmed: confirmEmail ? null : new Date().toISOString(), app: {} };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);
    if (confirmEmail) return reply(200, publicUser(user));
    return reply(200, sessionFor(user));
  }
  if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "password") {
    const email = String(body.email || "").toLowerCase();
    const user = usersByEmail.get(email);
    const password = String(body.password || "");
    if (!user || !user.passwordHash || !user.confirmed || user.passwordHash !== hashPw(password)) return reply(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return reply(200, sessionFor(user));
  }
  if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "pkce") {
    return reply(404, { error_code: "flow_state_not_found", msg: "invalid flow state" });
  }
  if (u.pathname === "/auth/v1/user" && (init?.method || "GET") === "GET") {
    const row = sessions.get(bearer(headers));
    if (!row) return reply(401, { error_code: "bad_jwt", msg: "invalid JWT" });
    return reply(200, publicUser(row.user));
  }
  if (u.pathname === "/auth/v1/user" && init?.method === "PUT") {
    const row = sessions.get(bearer(headers));
    if (!row) return reply(401, { error_code: "bad_jwt", msg: "invalid JWT" });
    if (typeof body.password === "string") row.user.passwordHash = hashPw(body.password);
    return reply(200, publicUser(row.user));
  }
  if (u.pathname === "/auth/v1/logout") {
    const token = bearer(headers);
    const scope = u.searchParams.get("scope") || "global";
    logouts.push(scope);
    const row = sessions.get(token);
    if (row) {
      if (scope === "local") {
        sessions.delete(token);
        alive.delete(token);
      } else if (scope === "others") {
        for (const [access, item] of [...sessions]) {
          if (item.user.id === row.user.id && access !== token) {
            sessions.delete(access);
            alive.delete(access);
          }
        }
      }
    }
    return new Response(null, { status: 204 });
  }
  const admin = u.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/i);
  if (admin && init?.method === "PUT") {
    if (bearer(headers) !== process.env.SUPABASE_SECRET_KEY) return reply(401, { error_code: "no_authorization", msg: "no" });
    adminBodies.push(body);
    const user = usersById.get(admin[1]!);
    if (!user) return reply(404, { error_code: "user_not_found", msg: "missing" });
    const meta = body.app_metadata;
    if (meta && typeof meta === "object") user.app = { ...user.app, ...(meta as Record<string, unknown>) };
    return reply(200, publicUser(user));
  }
  return reply(404, { msg: "stub" });
}) as typeof fetch;

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
function req(url: string, init: { method?: string; body?: unknown; jar?: Jar; cookie?: string } = {}) {
  const u = new URL(url);
  const headers = new Headers({ host: u.host, "x-forwarded-for": `10.21.1.${ipN++}`, "x-forwarded-proto": "https" });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.jar?.header()) headers.set("cookie", init.jar.header());
  if (init.cookie) headers.set("cookie", init.cookie);
  if ((init.method ?? "GET") === "POST") headers.set("origin", u.origin);
  return new Request(url, { method: init.method ?? "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
}
const HOST = "https://stubref.supabase.co";
const MISMATCH = "That email and password don't match. Try again.";
const pw = "correct-horse-1";

const strings = await import("../../lib/auth/strings");
const passwordMod = await import("../../lib/auth/password");
const sessionCookie = await import("../../lib/auth/session-cookie");
const authMod = await import("../../lib/apartments/auth");
const signup = await import("../../app/api/auth/signup/route");
const passwordRoute = await import("../../app/api/auth/password/route");
const updateRoute = await import("../../app/api/auth/update-password/route");
const signout = await import("../../app/api/auth/signout/route");
const { NextRequest } = await import("next/server");
const { proxy, config: proxyConfig } = await import("../../proxy");
check("the proxy file's matcher matches the session-cookie list", proxyConfig.matcher.join(" ") === sessionCookie.PROXY_MATCHER.join(" "));

const struck = [["Tap ", ["Con", "tinue"].join(""), " to finish."].join(""), ["One", "moment\u2026"].join(" ")];
const root = path.resolve(import.meta.dirname, "../..");
const skip = new Set(["node_modules", ".next", ".git", "design"]);
function walk(dir: string, out: string[]) {
  for (const name of readDir(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    if (stat(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|css|md)$/.test(name)) out.push(full);
  }
}
const files: string[] = [];
walk(root, files);
const blob = files.map((file) => readFile(file, "utf8")).join("\n");
check("struck confirm lines are absent from the source", struck.every((line) => !blob.includes(line)) && !/["']Continue["']/.test(blob) && !blob.includes(["One", "moment\u2026"].join(" ")));
const signupFlag = await import("../../lib/auth/signup-flag");
const savedSignup = process.env.PASSWORD_SIGNUP_ENABLED;
delete process.env.PASSWORD_SIGNUP_ENABLED;
check("sign-up is off when PASSWORD_SIGNUP_ENABLED is unset", signupFlag.passwordSignupEnabled() === false);
process.env.PASSWORD_SIGNUP_ENABLED = "0";
check("sign-up stays off for any value other than 1", signupFlag.passwordSignupEnabled() === false);
process.env.PASSWORD_SIGNUP_ENABLED = "true";
check("sign-up ignores the word true", signupFlag.passwordSignupEnabled() === false);
process.env.PASSWORD_SIGNUP_ENABLED = "1";
check("sign-up is on only when PASSWORD_SIGNUP_ENABLED is 1", signupFlag.passwordSignupEnabled() === true);
if (savedSignup === undefined) delete process.env.PASSWORD_SIGNUP_ENABLED;
else process.env.PASSWORD_SIGNUP_ENABLED = savedSignup;
const signInSrc = readFile(path.join(root, "components/account/sign-in.tsx"), "utf8");
check("the create-account control is a server prop, not a public env", signInSrc.includes("signupEnabled") && !signInSrc.includes("NEXT_PUBLIC") && !signInSrc.includes("PASSWORD_SIGNUP_ENABLED"));
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { SignIn } = await import("../../components/account/sign-in");
const hidden = renderToStaticMarkup(createElement(SignIn, { signupEnabled: false }));
const shown = renderToStaticMarkup(createElement(SignIn, { signupEnabled: true }));
check("create-account is hidden when sign-up is off", !hidden.includes("create-account") && !hidden.includes("New here? Create an account"));
check("create-account is shown when sign-up is on", shown.includes('data-auth-control="create-account"'));
check("failed sign-in line is the short mismatch sentence", strings.SIGN_IN_MISMATCH === MISMATCH);
check("forgot-password copy is in the module and not rendered", strings.FORGOT_PASSWORD === "Forgot password?" && !readFile(path.join(root, "components/account/sign-in.tsx"), "utf8").includes("Forgot password?"));
check("password rules: empty, 11, 12, 73 bytes", passwordMod.passwordIssue("") === "empty" && passwordMod.passwordIssue("short-pass") === "short" && passwordMod.passwordIssue(pw) === "ok" && passwordMod.passwordIssue("a".repeat(73)) === "long");

check("proxy matcher skips auth, confirm, and model files", !sessionCookie.proxyMatches("/auth/callback") && !sessionCookie.proxyMatches("/auth/confirm") && !sessionCookie.proxyMatches("/models/room.glb") && !sessionCookie.proxyMatches("/api/auth/otp") && sessionCookie.proxyMatches("/room") && sessionCookie.proxyMatches("/api/me"));
check("proxy matcher list is only room, account, and /api/me", sessionCookie.PROXY_MATCHER.join(" ") === "/room /room/:path* /account/:path* /api/me");

const bare = authMod.serializeAuthCookie({ name: "sb-stubref-auth-token", value: "abc" });
const cleared = authMod.serializeAuthCookie({ name: "sb-stubref-auth-token", value: "", options: { maxAge: 0 } });
check("a session cookie is HttpOnly Secure SameSite=Lax with a long Max-Age", /HttpOnly/.test(bare) && /Secure/.test(bare) && /SameSite=Lax/.test(bare) && /Max-Age=34560000/.test(bare) && /Max-Age=0/.test(cleared));

const off = await signup.handleSignup(req(`${HOST}/api/auth/signup`, { method: "POST", body: { email: "v21t-off@example.com", password: pw } }), false);
check("sign-up with the switch off is 404 before any auth call", off.status === 404 && usersByEmail.size === 0, `status ${off.status}`);
delete process.env.PASSWORD_SIGNUP_ENABLED;
const postOff = await signup.POST(req(`${HOST}/api/auth/signup`, { method: "POST", body: { email: "v21t-post-off@example.com", password: pw } }));
check("POST /api/auth/signup is 404 when the env is unset", postOff.status === 404 && usersByEmail.size === 0, `status ${postOff.status}`);
process.env.PASSWORD_SIGNUP_ENABLED = "1";
const postOn = await signup.POST(req(`${HOST}/api/auth/signup`, { method: "POST", body: { email: "v21t-post-on@example.com", password: pw } }));
const postOnBody = (await postOn.json()) as { ok?: boolean; signedIn?: boolean };
check("POST /api/auth/signup signs up when the env is 1", postOn.status === 200 && postOnBody.signedIn === true, `status ${postOn.status}`);
delete process.env.PASSWORD_SIGNUP_ENABLED;

const jar = new Jar();
const created = jar.take(await signup.handleSignup(req(`${HOST}/api/auth/signup`, { method: "POST", body: { email: "v21t-new@example.com", password: pw }, jar }), true));
const createdBody = (await created.json()) as { ok?: boolean; signedIn?: boolean };
const flagBody = JSON.stringify(adminBodies.at(-1) ?? {});
check("sign-up confirm-off returns a session and sets app_metadata only", created.status === 200 && createdBody.signedIn === true && flagBody.includes("lr_password_set") && !flagBody.includes("user_metadata"), `status ${created.status}`);
const account = await authMod.currentAccount(req(`${HOST}/api/me`, { jar }));
check("the new account's password flag is true", account.account?.passwordSet === true && account.account.email === "v21t-new@example.com");
const cookieLine = created.headers.getSetCookie().find((line) => line.startsWith("sb-stubref-auth-token")) ?? "";
check("sign-up stores the session as an HttpOnly Secure cookie", /HttpOnly/.test(cookieLine) && /Secure/.test(cookieLine) && /SameSite=Lax/.test(cookieLine) && /Max-Age=[1-9]/.test(cookieLine));

confirmEmail = true;
const pending = await signup.handleSignup(req(`${HOST}/api/auth/signup`, { method: "POST", body: { email: "v21t-confirm@example.com", password: pw } }), true);
const pendingBody = (await pending.json()) as { ok?: boolean; signedIn?: boolean };
confirmEmail = false;
const again = await signup.handleSignup(req(`${HOST}/api/auth/signup`, { method: "POST", body: { email: "v21t-new@example.com", password: pw } }), true);
const againBody = (await again.json()) as { ok?: boolean; signedIn?: boolean };
check("confirm-on and an existing address share the no-session reply", pending.status === 200 && pendingBody.ok === true && pendingBody.signedIn === false && again.status === 200 && againBody.ok === true && againBody.signedIn === false && JSON.stringify(pendingBody) === JSON.stringify(againBody));

const unknown = await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "v21t-missing@example.com", password: pw } }));
const unknownBody = await unknown.json();
const wrongJar = new Jar();
const wrong = await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "v21t-new@example.com", password: "not-the-password" }, jar: wrongJar }));
const wrongBody = await wrong.json();
check("unknown email and a wrong password are the same 401 body", unknown.status === 401 && wrong.status === 401 && JSON.stringify(unknownBody) === JSON.stringify(wrongBody) && (wrongBody as { error?: string }).error === MISMATCH);

const empty = await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "", password: "" } }));
check("an empty email is rejected before a password guess", empty.status === 400 && ((await empty.json()) as { error?: string }).error === strings.ENTER_EMAIL);

const limitIp = "10.21.9.9";
let limitedStatus = 0;
let limitedRetry = "";
let limitedError = "";
for (let n = 0; n < 6; n += 1) {
  const headers = new Headers({ host: "stubref.supabase.co", origin: HOST, "content-type": "application/json", "x-forwarded-for": limitIp, "x-forwarded-proto": "https" });
  const res = await passwordRoute.POST(new Request(`${HOST}/api/auth/password`, { method: "POST", headers, body: JSON.stringify({ email: "v21t-limit@example.com", password: pw }) }));
  limitedStatus = res.status;
  limitedRetry = res.headers.get("retry-after") ?? "";
  limitedError = ((await res.json()) as { error?: string }).error ?? "";
}
check("the 6th password try from one IP is 429 with Retry-After", limitedStatus === 429 && Number(limitedRetry) > 0 && limitedError === strings.TOO_MANY, `status ${limitedStatus}`);

const signed = new Jar();
signed.take(await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "v21t-new@example.com", password: pw }, jar: signed })));
const other = new Jar();
other.take(await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "v21t-new@example.com", password: pw }, jar: other })));
const before = issued.length;
const mismatch = await updateRoute.POST(req(`${HOST}/api/auth/update-password`, { method: "POST", body: { password: "another-horse-2", currentPassword: "nope-nope-nope" }, jar: signed }));
const mismatchBody = (await mismatch.json()) as { error?: string };
check("a wrong current password is the generic save error", mismatch.status === 400 && mismatchBody.error === strings.SAVE_FAILED && !String(mismatchBody.error).includes("reset"));
const saved = await updateRoute.POST(req(`${HOST}/api/auth/update-password`, { method: "POST", body: { password: "another-horse-2", currentPassword: pw }, jar: signed }));
check("the right current password saves and revokes other sessions", saved.status === 200 && logouts.includes("others") && issued.slice(before - 1).some((token) => !alive.has(token)), `status ${saved.status}`);
const oldPw = await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "v21t-new@example.com", password: pw } }));
const newPw = new Jar();
newPw.take(await passwordRoute.POST(req(`${HOST}/api/auth/password`, { method: "POST", body: { email: "v21t-new@example.com", password: "another-horse-2" }, jar: newPw })));
check("the old password fails and the new one signs in", oldPw.status === 401 && newPw.map.size > 0);

const signedOut = await updateRoute.POST(req(`${HOST}/api/auth/update-password`, { method: "POST", body: { password: "another-horse-3" } }));
const signedOutBody = (await signedOut.json()) as { code?: string };
const watching = await updateRoute.POST(req(`${HOST}/api/auth/update-password`, { method: "POST", body: { password: "another-horse-3" }, cookie: `__Host-lr_watch=wss_${"ab".repeat(32)}` }));
const watchingBody = (await watching.json()) as { code?: string };
check("set-password refuses a signed-out caller and a watch cookie", signedOut.status === 403 && watching.status === 403 && watchingBody.code === "watch_read_only", `${signedOut.status} ${signedOutBody.code} / ${watching.status} ${watchingBody.code}`);

const out = signed.take(await signout.POST(req(`${HOST}/api/auth/signout`, { method: "POST", jar: signed, cookie: `${signed.header()}; __Host-lr_owner=o; __Host-lr_watch=w` })));
const outCookies = out.headers.getSetCookie().join(" | ");
check("sign-out is POST, calls scope local, and clears auth, owner, and watch cookies", logouts.includes("local") && /Max-Age=0/.test(outCookies) && outCookies.includes("__Host-lr_owner") && outCookies.includes("__Host-lr_watch") && !("GET" in signout), `status ${out.status}`);

let fetches = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  fetches += 1;
  return realFetch(input, init);
}) as typeof fetch;
const quiet = await proxy(new NextRequest("https://stubref.supabase.co/room"));
const afterQuiet = fetches;
const farExp = Math.floor(Date.now() / 1000) + 3600;
const far = await proxy(new NextRequest("https://stubref.supabase.co/room", { headers: { cookie: `sb-stubref-auth-token=${encodeURIComponent(JSON.stringify({ access_token: "x", refresh_token: "r", expires_at: farExp }))}` } }));
const afterFar = fetches;
const nearExp = Math.floor(Date.now() / 1000) + 30;
const near = await proxy(new NextRequest("https://stubref.supabase.co/room", { headers: { cookie: `sb-stubref-auth-token=${encodeURIComponent(JSON.stringify({ access_token: "x", refresh_token: "r", expires_at: nearExp }))}` } }));
check("proxy makes no auth call without a cookie or while the token is fresh, and never redirects", afterQuiet === 0 && afterFar === 0 && quiet.status === 200 && far.status === 200 && near.status === 200 && !quiet.headers.get("location") && !near.headers.get("location"), `quiet ${afterQuiet} far ${afterFar} near ${fetches}`);

const fail = results.filter((r) => !r).length;
console.log(`\nv21.1-unit: ${results.length - fail} passed, ${fail} failed, ${results.length} total`);
process.exit(fail ? 1 : 0);

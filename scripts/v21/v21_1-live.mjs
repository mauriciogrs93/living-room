// v21.1 checks a supervisor can run against a non-production project.
// Creates v21t- users with the admin API (email already confirmed). Does not send email.
//   node scripts/v21/v21_1-live.mjs --help
//   BASE=https://<preview> NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/v21/v21_1-live.mjs
// The secret is read from the environment and never printed. Refuses the production host.
import { createClient } from "@supabase/supabase-js";

const HELP = `v21.1 live checks (no email is sent).

Required env:
  BASE                         preview origin, not the production host
  NEXT_PUBLIC_SUPABASE_URL     project URL
  SUPABASE_SECRET_KEY          service role key (never printed)

What it does:
  1. Admin-creates a v21t- user with email_confirm true and a password.
  2. Signs in through POST /api/auth/password and checks the session cookie flags.
  3. Sends a wrong password and expects the generic mismatch line.
  4. Signs out with POST /api/auth/signout and checks the auth cookies are cleared.

The set-password offer after an email link is not part of this script: that path
would need a message sent to the user. It is covered by scripts/v21/v21_1-wiring.mjs,
which uses the local auth stub and /auth/callback?code= in the same browser.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const BASE = (process.env.BASE || "").replace(/\/$/, "");
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY || "";
function fail(message) {
  console.error(message);
  process.exit(2);
}
if (!BASE) fail("BASE is required");
let host = "";
try {
  host = new URL(BASE).hostname;
} catch {
  fail("BASE is not a URL");
}
if (host === "living-room-psi.vercel.app") fail("refusing production host");
if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is required");
if (!key) fail("SUPABASE_SECRET_KEY is required");

const email = `v21t-live-${Date.now().toString(36)}@example.com`;
const password = `v21t-live-pass-${Date.now().toString(36)}-ok`;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user?.id) {
  console.error("admin create failed", created.error?.status ?? 0, created.error?.code ?? "");
  process.exit(1);
}
console.log("admin user created");

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, cookies: res.headers.getSetCookie?.() ?? [] };
}

const good = await post("/api/auth/password", { email, password });
const cookie = good.cookies.find((line) => /^sb-[a-z0-9]+-auth-token/.test(line)) ?? "";
const flagsOk = /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Max-Age=([1-9]\d*)/i.test(cookie);
console.log(good.status === 200 && flagsOk ? "PASS  password sign-in cookie flags" : `FAIL  password sign-in (${good.status}, flags ${flagsOk})`);

const bad = await post("/api/auth/password", { email, password: `${password}-no` });
const mismatch = bad.status === 401 && bad.json?.error === "That email and password don't match. Try again.";
console.log(mismatch ? "PASS  wrong password" : `FAIL  wrong password (${bad.status})`);

const header = good.cookies
  .map((line) => line.split(";")[0])
  .filter(Boolean)
  .join("; ");
const out = await fetch(`${BASE}/api/auth/signout`, { method: "POST", headers: { origin: BASE, cookie: header } });
const cleared = (out.headers.getSetCookie?.() ?? []).some((line) => /Max-Age=0/i.test(line) && /^sb-[a-z0-9]+-auth-token/.test(line));
console.log(out.status === 200 && cleared ? "PASS  sign out cleared auth cookies" : `FAIL  sign out (${out.status})`);

console.log("offer after an email link: see scripts/v21/v21_1-wiring.mjs (local PKCE, no mail)");
if (!(good.status === 200 && flagsOk && mismatch && out.status === 200 && cleared)) process.exit(1);

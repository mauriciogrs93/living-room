// v21.1 HTTP checks against the local Next server and the auth stub. No email is sent.
//   BASE=http://127.0.0.1:3921 node scripts/v21/v21_1-http.mjs
import { BASE, Jar, call, check, done } from "./v21-lib.mjs";

const MISMATCH = "That email and password don't match. Try again.";
const pw = "correct-horse-1";
const nextPw = "another-horse-2";
const tag = Math.random().toString(36).slice(2, 8);
const email = `v21t-http-${tag}@example.com`;
const ip = `10.31.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;

const confirm = await call("GET", "/auth/confirm?token_hash=abc&type=magiclink");
check("GET /auth/confirm is 404", confirm.status === 404, `status ${confirm.status}`);
const room = await call("GET", "/room", { headers: { accept: "text/html" } });
const html = room.text || "";
const struck = [["Tap ", ["Con", "tinue"].join("")].join(""), ["One", "moment"].join(" ")];
check("the room document has no confirm-page lines and no forgot-password control", room.status === 200 && struck.every((line) => !html.includes(line)) && !html.includes("Forgot password?"));

const empty = await call("POST", "/api/auth/password", { body: { email: "", password: "" }, ip });
check("empty email is 400", empty.status === 400 && empty.json?.error === "Enter your email.", `${empty.status}`);
const short = await call("POST", "/api/auth/password", { body: { email, password: "short" }, ip: `${ip}1` });
check("a short password is rejected with the 12-character line", short.status === 400 && short.json?.error === "Use at least 12 characters.", `${short.status}`);

const missing = await call("POST", "/api/auth/password", { body: { email: `v21t-missing-${tag}@example.com`, password: pw }, ip: `${ip}2` });
const jar = new Jar();
const created = await call("POST", "/api/auth/signup", { body: { email, password: pw }, jar, ip: `${ip}3` });
const wrong = await call("POST", "/api/auth/password", { body: { email, password: "not-the-password" }, ip: `${ip}4` });
check("sign-up returns a session", created.status === 200 && created.json?.signedIn === true, `${created.status}`);
const sessionCookie = created.cookies.find((line) => /sb-[a-z0-9]+-auth-token/.test(line)) ?? "";
check("the session cookie is HttpOnly Secure SameSite=Lax with Max-Age", /HttpOnly/i.test(sessionCookie) && /Secure/i.test(sessionCookie) && /SameSite=Lax/i.test(sessionCookie) && /Max-Age=[1-9]/.test(sessionCookie));
check("unknown email and a wrong password share one body", missing.status === 401 && wrong.status === 401 && missing.json?.error === MISMATCH && wrong.json?.error === MISMATCH && missing.json?.code === wrong.json?.code);

const me = await call("GET", "/api/me", { jar });
check("a password sign-up is marked as having a password", me.status === 200 && me.json?.role === "owner" && me.json?.passwordSet === true, `${me.status} ${me.json?.role}`);

const dup = await call("POST", "/api/auth/signup", { body: { email, password: pw }, ip: `${ip}5` });
check("signing up an existing address does not say the address exists", dup.status === 200 && dup.json?.ok === true && dup.json?.signedIn === false && !/already|exists/i.test(JSON.stringify(dup.json)));

const noSession = await call("POST", "/api/auth/update-password", { body: { password: nextPw }, ip: `${ip}6` });
const watch = await call("POST", "/api/auth/update-password", { body: { password: nextPw }, headers: { cookie: `__Host-lr_watch=wss_${"ab".repeat(32)}` }, ip: `${ip}7` });
check("set-password is 403 signed out and 403 for a watch cookie", noSession.status === 403 && watch.status === 403 && watch.json?.code === "watch_read_only", `${noSession.status} ${watch.status}`);

const badCurrent = await call("POST", "/api/auth/update-password", { body: { password: nextPw, currentPassword: "nope-nope-nope" }, jar, ip: `${ip}8` });
check("the wrong current password is the generic save error", badCurrent.status === 400 && badCurrent.json?.error === "Couldn't save your password. Try again.", `${badCurrent.status}`);
const other = new Jar();
await call("POST", "/api/auth/password", { body: { email, password: pw }, jar: other, ip: `${ip}9` });
const saved = await call("POST", "/api/auth/update-password", { body: { password: nextPw, currentPassword: pw }, jar, ip: `${ip}0` });
const otherMe = await call("GET", "/api/me", { jar: other });
check("saving revokes the other session and keeps this one", saved.status === 200 && saved.json?.passwordSet === true && otherMe.json?.role !== "owner", `${saved.status} ${otherMe.json?.role}`);
const old = await call("POST", "/api/auth/password", { body: { email, password: pw }, ip: `${ip}a` });
const fresh = new Jar();
const neu = await call("POST", "/api/auth/password", { body: { email, password: nextPw }, jar: fresh, ip: `${ip}b` });
check("the old password fails and the new one works", old.status === 401 && old.json?.error === MISMATCH && neu.status === 200, `${old.status} ${neu.status}`);

jar.map.set("__Host-lr_owner", "owner");
jar.map.set("__Host-lr_watch", "watch");
const out = await call("POST", "/api/auth/signout", { jar, ip: `${ip}c` });
const cleared = out.cookies.join(" | ");
check("sign-out clears auth, owner, and watch cookies", out.status === 200 && /Max-Age=0/i.test(cleared) && /__Host-lr_owner/.test(cleared) && /__Host-lr_watch/.test(cleared) && !jar.has(/^sb-/) && !jar.has(/__Host-lr_/));
const getOut = await call("GET", "/api/auth/signout");
check("sign-out has no GET", getOut.status === 405, `${getOut.status}`);

let limited = null;
const limitIp = `10.32.${tag.length}.${Math.floor(Math.random() * 200)}`;
for (let n = 0; n < 6; n += 1) limited = await call("POST", "/api/auth/password", { body: { email: `v21t-limit-${tag}@example.com`, password: pw }, ip: limitIp });
check("the 6th try from one IP is 429", limited?.status === 429 && limited.json?.error === "Too many tries. Wait 15 minutes, then try again." && Number(limited.headers.get("retry-after")) > 0, `${limited?.status}`);

console.log(`# v21.1-http against ${BASE}`);
process.exit(done("v21.1-http") ? 1 : 0);

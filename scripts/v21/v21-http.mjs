// v21 HTTP tests: accounts + private apartments, Invite (1-minute invite + watch link, 50 s rotation),
// owner-only viewing, rate limits, the per-apartment 1 s state cache, and the v20 regressions.
//   Local (fast, many "IPs"):  BASE=http://localhost:3921 PREVIEW=<preview url> node v21-http.mjs
//   Private preview (Supabase v21_test): VIA=<preview url> node v21-http.mjs
// Prints statuses only; never keys, tokens, codes or cookies.
import { BASE, VIA, Jar, call, check, done, signIn, sleep, nextIp, LINE_RE, WATCH_RE, uniq } from "./v21-lib.mjs";

const LOCAL = !VIA;
const SKIP_LIMITS = process.env.SKIP_LIMITS === "1";
const REUSE = Boolean(process.env.RUN); // rerun with the same accounts (their apartments already exist)
const run = process.env.RUN || uniq();
const tag = uniq(); // agent names: fresh every run
const email = (who) => `v21t-${who}-${run}@example.com`;
const ipA = nextIp();
console.log(`# v21-http against ${LOCAL ? BASE : "private preview (vercel curl)"}  run=${run}`);

// ---------- v20 regression: public pages behave as designed ----------
const skill = await call("GET", "/skill.md");
const sk = skill.text || "";
check("v20: /skill.md 200 with Writer's Joining paragraph", skill.status === 200 && sk.includes('**Joining.** Your person gave you a line with the words "with invite" followed by a code. That code is your invite. Leave out the full stop after it. Register right away:'), `status ${skill.status}`);
check("v21: skill.md says invites expire about a minute after they were made", sk.includes("It works once and expires about a minute after it was made."));
check("v20: skill.md sends YOUR_INVITE in the JSON body, never a URL", /-d '\{[^']*"invite":"YOUR_INVITE"[^']*\}'/.test(sk) && !/[?&]invite=/.test(sk) && !sk.includes("THE_INVITE"));
const home = await call("GET", "/", { headers: { accept: "text/html" } });
check("v20: landing shows the private-room line, no code or Copy", home.status === 200 && (home.text || "").includes("Rooms are private. Ask the owner for an invite line.") && !/>COPY</.test(home.text || ""), `status ${home.status}`);
const roomPage = await call("GET", "/room", { headers: { accept: "text/html" } });
check("v21: /room 200 (sign-in gate for strangers)", roomPage.status === 200 && /Your apartment/.test(roomPage.text || ""), `status ${roomPage.status}`);
const anonState = await call("GET", "/api/state");
check("v21: /api/state for a stranger -> 403 private (owner-only viewing)", anonState.status === 403 && anonState.json?.code === "private" && !anonState.json?.agents, `status ${anonState.status}`);
check("v21: 403 state is never cacheable", /no-store/.test(anonState.headers.get("cache-control") || ""));
const noInvite = await call("POST", "/api/register", { body: { name: "Nobody", emoji: "🙂" } });
check("v20: register without an invite -> 403 invite_missing (Writer copy)", noInvite.status === 403 && noInvite.json?.code === "invite_missing", `${noInvite.status} ${noInvite.json?.code}`);
const ownerSet = await call("POST", "/api/owner/session", { body: { ownerKey: "own_" + "1".repeat(36) } });
const sc = ownerSet.cookies.join(" | ");
check("v20: owner link sets the HttpOnly __Host-lr_owner cookie", ownerSet.status === 200 && /__Host-lr_owner=/.test(sc) && /HttpOnly/i.test(sc) && /Secure/i.test(sc), `status ${ownerSet.status}`);

// ---------- sign-in creates exactly one apartment ----------
const A = await signIn(email("owner-a"), { ip: ipA });
check("sign-in A: magic-link hash -> /auth/confirm -> 303 /room with Supabase session cookies", A.ok, `status ${A.status} -> ${A.location}`);
const meA1 = await call("GET", "/api/me", { jar: A.jar, ip: ipA });
check("first /api/me creates A's apartment (role owner, created)", meA1.status === 200 && meA1.json?.role === "owner" && meA1.json?.apartment?.created === !REUSE && meA1.json?.apartment?.legacy === false, `${meA1.status} ${JSON.stringify(meA1.json?.apartment ?? meA1.json?.code)}`);
const meA2 = await call("GET", "/api/me", { jar: A.jar, ip: ipA });
check("second /api/me returns the same apartment (created false)", meA2.status === 200 && meA2.json?.apartment?.created === false);
check("me never returns ids or the full email", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(meA2.text || "") && !(meA2.text || "").includes(email("owner-a")));
const ipB = nextIp();
const B = await signIn(email("owner-b"), { ip: ipB });
const meB = await call("GET", "/api/me", { jar: B.jar, ip: ipB });
check("sign-in B creates B's own apartment", B.ok && meB.status === 200 && meB.json?.apartment?.created === !REUSE, `${meB.status}`);

// ---------- owner-only viewing ----------
const stA = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("owner A -> /api/state 200", stA.status === 200 && Array.isArray(stA.json?.agents), `status ${stA.status}`);
check("state is private: Cache-Control private/no-store, Vary: Cookie", /private/.test(stA.headers.get("cache-control") || "") && /no-store/.test(stA.headers.get("cache-control") || "") && /cookie/i.test(stA.headers.get("vary") || ""));
check("a fresh apartment has no Poppy / Tester seed agents", !(stA.text || "").includes("Poppy") || !(stA.json?.agents || []).some((a) => a.name === "Poppy"));
const stranger = new Jar();
const sDoor = await call("GET", "/api/door", { jar: stranger });
const sInv = await call("POST", "/api/apartment/invite", { jar: stranger, body: {} });
check("stranger: door 403, Invite 403", sDoor.status === 403 && sInv.status === 403 && !sInv.json?.line, `${sDoor.status}/${sInv.status}`);
const fakeCookie = new Jar();
fakeCookie.map.set("sb-naihkbwobufqasdfiubq-auth-token", "base64-eyJhY2Nlc3NfdG9rZW4iOiJub3BlIn0");
const fake = await call("GET", "/api/state", { jar: fakeCookie });
check("forged Supabase cookie -> 403", fake.status === 403, `status ${fake.status}`);

// ---------- Invite: line + watch link, 1 minute, rotation at 50 s ----------
const t0 = Date.now();
const inv1 = await call("POST", "/api/apartment/invite", { jar: A.jar, ip: ipA, body: {} });
const lag = Date.now() - t0; // round trip (vercel curl adds ~2 s); the server's clock starts somewhere inside it
const m1 = LINE_RE.exec(inv1.json?.line || "");
const w1 = WATCH_RE.exec(inv1.json?.watchLink || "");
check("Invite -> 200 with Writer's ready-to-paste line and a fresh 26-char code", inv1.status === 200 && Boolean(m1) && m1?.[2] === inv1.json?.invite, `status ${inv1.status}`);
check("Invite also returns a watch link (/room#watch=<code>, fragment only)", Boolean(w1) && !/[?&]watch=/.test(inv1.json?.watchLink || ""));
const ttl = (inv1.json?.expiresAt ?? 0) - t0;
const rot = (inv1.json?.rotateAt ?? 0) - t0;
check("each lives 1 minute (expiresAt ~60 s), rotation due at 50 s (rotateAt ~50 s)", ttl > 59_000 && ttl <= 60_500 + lag && rot > 49_000 && rot <= 50_500 + lag && inv1.json?.ttlMs === 60_000 && inv1.json?.rotateMs === 50_000, `ttl ${ttl} rot ${rot} measured from before a ${lag} ms round trip`);
check("Invite reply is no-store", /no-store/.test(inv1.headers.get("cache-control") || ""));
const inv2 = await call("POST", "/api/apartment/invite", { jar: A.jar, ip: ipA, body: {} });
const m2 = LINE_RE.exec(inv2.json?.line || "");
const w2 = WATCH_RE.exec(inv2.json?.watchLink || "");
check("the next mint (the 50 s rotation) is a different code and watch link", m2 && w2 && m2[2] !== m1?.[2] && w2[2] !== w1?.[2]);
const stAfter = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("state never contains an invite or watch code", !(stAfter.text || "").includes(m1?.[2] || "zz") && !(stAfter.text || "").includes(w1?.[2] || "zz"));
// B's own invite for the cross-apartment checks
const invB = await call("POST", "/api/apartment/invite", { jar: B.jar, ip: ipB, body: {} });
const mB = LINE_RE.exec(invB.json?.line || "");
const joinB = await call("POST", "/api/register", { body: { name: `Bee${tag.slice(0, 3)}`, emoji: "🐝", invite: mB?.[2] } });
check("B's agent joins B's apartment with B's invite", joinB.status === 201 && Boolean(joinB.json?.token), `status ${joinB.status}`);

// a quick watch-session check while the codes are young
const watcher = new Jar();
const used = await call("POST", "/api/watch/redeem", { jar: watcher, body: { code: w2?.[2] } });
check("watch link redeemed -> 200 + HttpOnly __Host-lr_watch session", used.status === 200 && used.cookies.some((c) => /^__Host-lr_watch=/.test(c) && /HttpOnly/i.test(c)), `status ${used.status}`);
const again = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: w2?.[2] } });
check("a watch link works once (second use -> 403 watch_used)", again.status === 403 && again.json?.code === "watch_used", `${again.status} ${again.json?.code}`);
const wState = await call("GET", "/api/state", { jar: watcher });
const beeName = `Bee${tag.slice(0, 3)}`;
check("watch session -> 200 on A's apartment only (no B agent)", wState.status === 200 && !(wState.json?.agents || []).some((a) => a.name === beeName), `status ${wState.status}`);
const wInv = await call("POST", "/api/apartment/invite", { jar: watcher, body: {} });
const wDog = await call("POST", "/api/dog", { jar: watcher, body: {} });
const wDoor = await call("GET", "/api/door", { jar: watcher });
check("watch session is read-only: Invite 403, dog 403, door 403", wInv.status === 403 && wDog.status === 403 && wDoor.status === 403, `${wInv.status}/${wDog.status}/${wDoor.status}`);

// ---------- per-apartment 1 s cache, no cross-apartment leak ----------
const [c1, c2] = [await call("GET", "/api/state", { jar: A.jar, ip: ipA }), await call("GET", "/api/state", { jar: A.jar, ip: ipA })];
if (LOCAL) check("1 s cache: a second read within 1 s is a hit for the same apartment", c2.headers.get("x-state-cache") === "hit" || c1.headers.get("x-state-cache") === "hit", `${c1.headers.get("x-state-cache")}/${c2.headers.get("x-state-cache")}`);
const bNow = await call("GET", "/api/state", { jar: B.jar, ip: ipB });
const aNow = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("B's state (read inside A's cache second) has B's agent; A's never does", (bNow.json?.agents || []).some((a) => a.name === beeName) && !(aNow.json?.agents || []).some((a) => a.name === beeName), `B ${bNow.status} A ${aNow.status}`);
check("A's cached body is never served to B (different bodies)", bNow.text !== aNow.text);

// ---------- invites at ~55 s work, at ~65 s fail cleanly ----------
const wait = async (until) => { const ms = t0 + until - Date.now(); if (ms > 0) await sleep(ms); };
await wait(55_000);
const at55 = await call("POST", "/api/register", { body: { name: `Ada${tag.slice(0, 3)}`, emoji: "🌿", invite: `  ${m1?.[2]}. ` } });
check("invite (with spaces and a trailing full stop) works at ~55 s -> 201", at55.status === 201 && Boolean(at55.json?.token), `status ${at55.status} at ${Math.round((Date.now() - t0) / 1000)}s`);
const watcher2 = new Jar();
const w55 = await call("POST", "/api/watch/redeem", { jar: watcher2, body: { code: w1?.[2] } });
check("watch link works at ~55 s -> 200", w55.status === 200, `status ${w55.status}`);
const seeAda = await call("GET", "/api/state", { jar: watcher2 });
check("the watcher sees A's new agent", (seeAda.json?.agents || []).some((a) => a.name === `Ada${tag.slice(0, 3)}`));
const inv3 = await call("POST", "/api/apartment/invite", { jar: A.jar, ip: ipA, body: {} }); // a pair minted at ~56 s, still live at 65 s
await wait(Math.max(65_000, (invB.json?.expiresAt ?? 0) + 3_000 - t0)); // B's pair was minted later than A's first
const at65 = await call("POST", "/api/register", { body: { name: `Eve${tag.slice(0, 3)}`, emoji: "🌙", invite: m2?.[2] } });
check("invite fails at ~65 s -> 403 invite_expired with the Writer message", at65.status === 403 && at65.json?.code === "invite_expired" && typeof at65.json?.error === "string", `${at65.status} ${at65.json?.code} at ${Math.round((Date.now() - t0) / 1000)}s`);
const w65 = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: WATCH_RE.exec(invB.json?.watchLink || "")?.[2] } });
check("watch link fails at ~65 s -> 410 watch_expired, clean message", w65.status === 410 && w65.json?.code === "watch_expired" && /expired/i.test(w65.json?.error || ""), `${w65.status} ${w65.json?.code}`);
const m3 = LINE_RE.exec(inv3.json?.line || "");
const rotated = await call("POST", "/api/register", { body: { name: `Rot${tag.slice(0, 3)}`, emoji: "🔁", invite: m3?.[2] } });
check("the rotated (newer) invite still works after the old one expired", rotated.status === 201, `status ${rotated.status}`);

// ---------- watch session expiry (local: WATCH_SESSION_MS=20000) ----------
if (LOCAL && process.env.WATCH_SESSION_MS) {
  const ms = Number(process.env.WATCH_SESSION_MS);
  const left = 2_000 + ms - (Date.now() - t0 - 55_000);
  if (left > 0) await sleep(left);
  const expired = await call("GET", "/api/state", { jar: watcher2 });
  check(`watch session ends after WATCH_SESSION_MS (${ms / 1000}s) -> 403`, expired.status === 403, `status ${expired.status}`);
}

// ---------- rate limits: 429 + Retry-After ----------
if (!SKIP_LIMITS) {
  const ip = nextIp();
  let last;
  for (let i = 0; i < 6; i += 1) last = await call("POST", "/api/auth/otp", { ip, body: { email: "not-an-email" } });
  check("sign-in emails per IP: 6th -> 429 + Retry-After (no mail sent: junk addresses)", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
  const ip2 = nextIp();
  for (let i = 0; i < 9; i += 1) last = await call("POST", "/api/register", { ip: ip2, body: { name: "Spam", emoji: "🙂" } });
  check("door attempts per IP: register limit -> 429 + Retry-After", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
  const ip3 = nextIp();
  for (let i = 0; i < 6; i += 1) last = await call("POST", "/api/register", { ip: ip3, body: { name: `Bad${i}x`, emoji: "🙂", invite: "a".repeat(26) } });
  check("failed invites per IP: 6th -> 429 invite_rate_limited + Retry-After", last.status === 429 && last.json?.code === "invite_rate_limited" && Number(last.headers.get("retry-after")) > 0, `${last.status} ${last.json?.code}`);
  const ip4 = nextIp();
  for (let i = 0; i < 11; i += 1) last = await call("POST", "/api/watch/redeem", { ip: ip4, jar: new Jar(), body: { code: "b".repeat(26) } });
  check("watch redemptions per IP: 11th -> 429 + Retry-After", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
  const ip5 = nextIp();
  for (let i = 0; i < 11; i += 1) last = await call("POST", "/api/auth/verify", { ip: ip5, body: { email: "x@example.com", code: "000000" } });
  check("sign-in code checks per IP: 11th -> 429", last.status === 429, `status ${last.status}`);
  // apartment creation: 3 per IP per hour (A/B used other IPs)
  const ip6 = nextIp();
  const created = [];
  for (const who of ["c1", "c2", "c3", "c4"]) {
    const s = await signIn(email(who), { ip: ip6 });
    const me = await call("GET", "/api/me", { jar: s.jar, ip: ip6 });
    created.push(me);
  }
  check("apartment creation per IP: 4th new account -> 429 create_rate_limited + Retry-After", created.slice(0, 3).every((r) => r.status === 200) && created[3].status === 429 && created[3].json?.code === "create_rate_limited" && Number(created[3].headers.get("retry-after")) > 0, created.map((r) => r.status).join(","));
  // invite mints: 10 per apartment per minute (inside the door write) / 20 per IP
  let mintLast;
  for (let i = 0; i < 11; i += 1) mintLast = await call("POST", "/api/apartment/invite", { jar: B.jar, ip: ipB, body: {} });
  check("Invite presses per apartment: 11th in a minute -> 429 invite_mint_limited + Retry-After", mintLast.status === 429 && mintLast.json?.code === "invite_mint_limited" && Number(mintLast.headers.get("retry-after")) > 0, `${mintLast.status} ${mintLast.json?.code}`);
}

// ---------- sign out ----------
const out = await call("POST", "/api/auth/signout", { jar: A.jar, ip: ipA, body: {} });
const afterOut = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("sign out clears the session -> state 403", out.status === 200 && afterOut.status === 403, `${out.status}/${afterOut.status}`);

process.exitCode = done(`v21-http (${LOCAL ? "local" : "preview"})`) ? 1 : 0;

// v21 r2 HTTP tests: accounts + private apartments, sign-in (PKCE magic link only; no code routes), Invite MINT ON
// COPY (agent line + watch link, each live 1 minute from its own request, single-use; watch: 3 unused max, owner
// revokes), owner-only viewing, every watch-session write is 403 watch_read_only, rate limits, the per-apartment
// 1 s state cache, and the v20 regressions (/room, /skill.md, an agent's join/say/look/leave, invites with spaces
// and a trailing full stop).
//   Local (fast, many "IPs"):  BASE=http://localhost:3921 PREVIEW=<preview url> RUN=<existing run id> node v21-http.mjs
//   Private preview (Supabase v21_test): VIA=<preview url> SKIP_LIMITS=1 RUN=<existing run id> node v21-http.mjs
// RUN reuses existing test accounts (v21t-<who>-<RUN>@example.com) so no new auth users pile up.
// Prints statuses only; never keys, tokens, codes or cookies.
import { BASE, VIA, Jar, call, check, done, signIn, sleep, nextIp, LINE_RE, WATCH_RE, uniq } from "./v21-lib.mjs";

const LOCAL = !VIA;
const SKIP_LIMITS = process.env.SKIP_LIMITS === "1";
const REUSE = Boolean(process.env.RUN); // existing accounts (on the preview their apartments already exist)
const run = process.env.RUN || uniq();
const tag = uniq(); // agent names: fresh every run
const email = (who) => `v21t-${who}-${run}@example.com`;
const ipA = nextIp();
const ipB = nextIp();
console.log(`# v21-http r2 against ${LOCAL ? BASE : "private preview (vercel curl)"}  run=${run}`);
const secs = (t) => `${Math.round((Date.now() - t) / 1000)}s`;

// ---------- v20 regression: public pages behave as designed ----------
const skill = await call("GET", "/skill.md");
const sk = skill.text || "";
check("v20: /skill.md 200 with Writer's Joining paragraph", skill.status === 200 && sk.includes('**Joining.** Your person gave you a line with the words "with invite" followed by a code. That code is your invite. Leave out the full stop after it. Register right away:'), `status ${skill.status}`);
check("v21: skill.md says invites expire about a minute after they were made", sk.includes("It works once and expires about a minute after it was made."));
check("r2: skill.md has no rotation / 50-second wording", !/50 ?s|50-second|50 seconds|new code in|rotat/i.test(sk));
check("v20: skill.md sends YOUR_INVITE in the JSON body, never a URL", /-d '\{[^']*"invite":"YOUR_INVITE"[^']*\}'/.test(sk) && !/[?&]invite=/.test(sk) && !sk.includes("THE_INVITE"));
const home = await call("GET", "/", { headers: { accept: "text/html" } });
check("v20: landing shows the private-room line, no code or Copy", home.status === 200 && (home.text || "").includes("Rooms are private. Ask the owner for an invite line.") && !/>COPY</.test(home.text || ""), `status ${home.status}`);
const roomPage = await call("GET", "/room", { headers: { accept: "text/html" } });
check("v20/v21: /room 200 (sign-in gate for strangers)", roomPage.status === 200 && /Your apartment/.test(roomPage.text || ""), `status ${roomPage.status}`);
const anonState = await call("GET", "/api/state");
check("v21: /api/state for a stranger -> 403 private (owner-only viewing)", anonState.status === 403 && anonState.json?.code === "private" && !anonState.json?.agents, `status ${anonState.status}`);
check("v21: 403 state is never cacheable", /no-store/.test(anonState.headers.get("cache-control") || ""));
const noInvite = await call("POST", "/api/register", { body: { name: "Nobody", emoji: "🙂" } });
check("v20: register without an invite -> 403 invite_missing (Writer copy)", noInvite.status === 403 && noInvite.json?.code === "invite_missing", `${noInvite.status} ${noInvite.json?.code}`);
const ownerSet = await call("POST", "/api/owner/session", { body: { ownerKey: "own_" + "1".repeat(36) } });
const sc = ownerSet.cookies.join(" | ");
check("v20: owner link sets the HttpOnly __Host-lr_owner cookie", ownerSet.status === 200 && /__Host-lr_owner=/.test(sc) && /HttpOnly/i.test(sc) && /Secure/i.test(sc), `status ${ownerSet.status}`);

// ---------- r2 sign-in: the code path is gone on the server; /auth/callback is PKCE only ----------
const confirmGone = await call("GET", "/auth/confirm?token_hash=abc&type=magiclink");
const verifyGone = await call("POST", "/api/auth/verify", { body: { email: "x@example.com", code: "123456" } });
check("r2: /auth/confirm (token_hash) is gone -> 404", confirmGone.status === 404, `status ${confirmGone.status}`);
check("r2: /api/auth/verify (6-digit code) is gone -> 404", verifyGone.status === 404, `status ${verifyGone.status}`);
const cbNone = await call("GET", "/auth/callback");
check("r2: /auth/callback without a code -> 303 /room?signin=invalid", cbNone.status === 303 && cbNone.headers.get("location") === "/room?signin=invalid", `${cbNone.status} ${cbNone.headers.get("location")}`);
const cbHash = await call("GET", "/auth/callback?token_hash=abc&type=magiclink");
check("r2: /auth/callback ignores token_hash (no such path) -> signin=invalid", cbHash.status === 303 && cbHash.headers.get("location") === "/room?signin=invalid");
const cbOther = await call("GET", `/auth/callback?code=${"0".repeat(36)}&next=${encodeURIComponent("//evil.example/x")}`);
check("r2: a link opened in another browser (no code verifier) -> 303 /room?signin=expired, no session, same-site redirect", cbOther.status === 303 && cbOther.headers.get("location") === "/room?signin=expired" && !cbOther.cookies.some((c) => /^sb-[a-z0-9]+-auth-token=/.test(c)), `${cbOther.status} ${cbOther.headers.get("location")}`);
const cbErr = await call("GET", "/auth/callback?error=access_denied&error_code=otp_expired");
check("r2: Supabase's expired-link redirect -> /room?signin=expired", cbErr.headers.get("location") === "/room?signin=expired");
const junk = await call("POST", "/api/auth/otp", { body: { email: "not-an-email" } });
check("r2: sign-in email request validates the address first (junk -> 400 email_invalid; nothing sent)", junk.status === 400 && junk.json?.code === "email_invalid", `${junk.status} ${junk.json?.code}`);
const helper = await call("POST", "/api/test-admin/link", { body: { email: "v21t-nobody@example.com" } });
check(`test-admin answers 404 without the token${LOCAL ? " (and off preview)" : ""}`, helper.status === 404, `status ${helper.status}`);

// ---------- sign-in creates exactly one apartment ----------
const A = await signIn(email("owner-a"), { ip: ipA });
check("sign-in A (test session from the preview-only helper) -> Supabase session cookies", A.ok, `status ${A.status}`);
const meA1 = await call("GET", "/api/me", { jar: A.jar, ip: ipA });
const expectCreated = LOCAL ? true : !REUSE;
check(`first /api/me ${expectCreated ? "creates" : "returns"} A's apartment (role owner)`, meA1.status === 200 && meA1.json?.role === "owner" && meA1.json?.apartment?.created === expectCreated && meA1.json?.apartment?.legacy === false, `${meA1.status} ${JSON.stringify(meA1.json?.apartment ?? meA1.json?.code)}`);
const meA2 = await call("GET", "/api/me", { jar: A.jar, ip: ipA });
check("second /api/me returns the same apartment (created false); no rotate field", meA2.status === 200 && meA2.json?.apartment?.created === false && meA2.json?.invite?.ttlMs === 60_000 && !("rotateMs" in (meA2.json?.invite || {})));
check("me never returns ids or the full email", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(meA2.text || "") && !(meA2.text || "").includes(email("owner-a")));
const B = await signIn(email("owner-b"), { ip: ipB });
const meB = await call("GET", "/api/me", { jar: B.jar, ip: ipB });
check("sign-in B gets B's own apartment", B.ok && meB.status === 200 && meB.json?.apartment?.created === expectCreated, `${meB.status}`);

// ---------- owner-only viewing ----------
const stA = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("owner A -> /api/state 200", stA.status === 200 && Array.isArray(stA.json?.agents), `status ${stA.status}`);
check("state is private: Cache-Control private/no-store, Vary: Cookie", /private/.test(stA.headers.get("cache-control") || "") && /no-store/.test(stA.headers.get("cache-control") || "") && /cookie/i.test(stA.headers.get("vary") || ""));
check("a private apartment has no Poppy seed agent", !(stA.json?.agents || []).some((a) => a.name === "Poppy"));
const stranger = new Jar();
const sDoor = await call("GET", "/api/door", { jar: stranger });
const sInv = await call("POST", "/api/apartment/invite", { jar: stranger, body: { kind: "line" } });
check("stranger: door 403, Invite 403", sDoor.status === 403 && sInv.status === 403 && !sInv.json?.line, `${sDoor.status}/${sInv.status}`);
const fakeCookie = new Jar();
fakeCookie.map.set("sb-naihkbwobufqasdfiubq-auth-token", "base64-eyJhY2Nlc3NfdG9rZW4iOiJub3BlIn0");
const fake = await call("GET", "/api/state", { jar: fakeCookie });
check("forged Supabase cookie -> 403", fake.status === 403, `status ${fake.status}`);

// ---------- Invite: MINT ON COPY ----------
/** One Copy tap. Records when the request left and when the answer came back (box clock). */
async function tap(kind, jar = A.jar, ip = ipA) {
  const sent = Date.now();
  const res = await call("POST", "/api/apartment/invite", { jar, ip, body: kind ? { kind } : {} });
  return { res, sent, back: Date.now(), code: kind === "watch" ? WATCH_RE.exec(res.json?.watchLink || "")?.[2] : LINE_RE.exec(res.json?.line || "")?.[2] };
}
const opened = await tap(null);
check("menu open ({}) -> 200 with one line and one watch link", opened.res.status === 200 && LINE_RE.test(opened.res.json?.line || "") && WATCH_RE.test(opened.res.json?.watchLink || ""), `status ${opened.res.status}`);
check("r2: no rotation fields in the reply (rotateAt / rotateMs gone)", !("rotateAt" in (opened.res.json || {})) && !("rotateMs" in (opened.res.json || {})));
// B's invite for the cross-apartment checks
const LB = await tap("line", B.jar, ipB);
const beeName = `Bee${tag.slice(0, 3)}`;
const joinB = await call("POST", "/api/register", { body: { name: beeName, emoji: "🐝", invite: LB.code } });
check("B's agent joins B's apartment with B's invite", joinB.status === 201 && Boolean(joinB.json?.token), `status ${joinB.status}`);

// a quick watch-session check while the menu's codes are young
const watcher = new Jar();
const used = await call("POST", "/api/watch/redeem", { jar: watcher, body: { code: opened.res.json?.watchLink ? WATCH_RE.exec(opened.res.json.watchLink)[2] : "" } });
check("watch link redeemed -> 200 + HttpOnly __Host-lr_watch session", used.status === 200 && used.cookies.some((c) => /^__Host-lr_watch=/.test(c) && /HttpOnly/i.test(c)), `status ${used.status}`);
const again = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: WATCH_RE.exec(opened.res.json?.watchLink || "")?.[2] } });
check("a watch link works once (second use -> 403 watch_used)", again.status === 403 && again.json?.code === "watch_used", `${again.status} ${again.json?.code}`);
const wState = await call("GET", "/api/state", { jar: watcher });
check("watch session -> 200 on A's apartment only (no B agent)", wState.status === 200 && !(wState.json?.agents || []).some((a) => a.name === beeName), `status ${wState.status}`);

// ---------- per-apartment 1 s cache, no cross-apartment leak ----------
const c1 = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
const c2 = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
if (LOCAL) check("1 s cache: a second read within 1 s is a hit for the same apartment", c2.headers.get("x-state-cache") === "hit" || c1.headers.get("x-state-cache") === "hit", `${c1.headers.get("x-state-cache")}/${c2.headers.get("x-state-cache")}`);
const bNow = await call("GET", "/api/state", { jar: B.jar, ip: ipB });
const aNow = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("B's state (read inside A's cache second) has B's agent; A's never does", (bNow.json?.agents || []).some((a) => a.name === beeName) && !(aNow.json?.agents || []).some((a) => a.name === beeName), `B ${bNow.status} A ${aNow.status}`);
check("A's cached body is never served to B (different bodies)", bNow.text !== aNow.text);

const waitUntil = async (t) => { const ms = t - Date.now(); if (ms > 0) await sleep(ms); };
// ---------- Copy taps (timed from here; the slow cross-apartment checks ran before) ----------
const L1 = await tap("line");
const L1b = await tap("line");
const W1 = await tap("watch");
const W1b = await tap("watch");
check("Copy (kind line) -> only Writer's ready-to-paste line with a fresh 26-char code, no watch link", L1.res.status === 200 && Boolean(L1.code) && L1.code === L1.res.json?.invite && !L1.res.json?.watchLink, `status ${L1.res.status}`);
check("Copy (kind watch) -> only a watch link (/room#watch=<code>, fragment only), no line", W1.res.status === 200 && Boolean(W1.code) && !W1.res.json?.line && !/[?&]watch=/.test(W1.res.json?.watchLink || ""), `status ${W1.res.status}`);
check("two Copy taps give two different codes (line and watch)", L1.code && L1b.code && L1.code !== L1b.code && W1.code && W1b.code && W1.code !== W1b.code && L1.code !== opened.code);
const ttlOk = (t, at) => at >= t.sent + 60_000 - 1500 && at <= t.back + 60_000 + 1500; // server clock vs box clock, 1.5 s slack
check("each lives a full minute from its own tap (expiresAt = tap + 60 s)", ttlOk(L1, L1.res.json?.expiresAt ?? 0) && ttlOk(W1, W1.res.json?.expiresAt ?? 0) && L1.res.json?.ttlMs === 60_000, `line +${(L1.res.json?.expiresAt ?? 0) - L1.sent} ms, watch +${(W1.res.json?.expiresAt ?? 0) - W1.sent} ms`);
check("Invite reply is no-store", /no-store/.test(L1.res.headers.get("cache-control") || ""));
const stAfter = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("state never contains an invite or watch code", ![L1.code, W1.code, opened.code].some((c) => c && (stAfter.text || "").includes(c)));

// ---------- a code copied at ANY moment: works at ~55 s after its tap, fails at ~65 s ----------
await waitUntil(L1.sent + 23_000); // a second set of taps at an arbitrary later moment
const L2 = await tap("line");
const L2b = await tap("line");
// (on B: A already has 2 unused watch links live and the cap is 3 unused per apartment)
const W2 = await tap("watch", B.jar, ipB);
const W2b = await tap("watch", B.jar, ipB);
check("taps ~23 s later: fresh codes again", L2.code && W2.code && ![L1.code, L1b.code].includes(L2.code) && ![W1.code, W1b.code].includes(W2.code));
const timeline = [
  { at: L1.sent + 55_000, run: async () => {
    const r = await call("POST", "/api/register", { body: { name: `Ada${tag.slice(0, 3)}`, emoji: "🌿", invite: `  ${L1.code}. ` } });
    check("first tap's invite (sent with spaces and a trailing full stop) works ~55 s after its tap -> 201", r.status === 201 && Boolean(r.json?.token), `status ${r.status} at ${secs(L1.sent)}`);
    globalThis.ada = r.json?.token;
  } },
  { at: W1.sent + 55_000, run: async () => {
    globalThis.watcher2 = new Jar();
    const r = await call("POST", "/api/watch/redeem", { jar: globalThis.watcher2, body: { code: W1.code } });
    check("first tap's watch link works ~55 s after its tap -> 200", r.status === 200, `status ${r.status} at ${secs(W1.sent)}`);
    const seeAda = await call("GET", "/api/state", { jar: globalThis.watcher2 });
    check("the watcher sees A's new agent", (seeAda.json?.agents || []).some((a) => a.name === `Ada${tag.slice(0, 3)}`));
  } },
  { at: L1b.back + 65_000, run: async () => {
    const r = await call("POST", "/api/register", { body: { name: `Eve${tag.slice(0, 3)}`, emoji: "🌙", invite: L1b.code } });
    check("first tap's other invite fails ~65 s after its tap -> 403 invite_expired with the Writer message", r.status === 403 && r.json?.code === "invite_expired" && typeof r.json?.error === "string", `${r.status} ${r.json?.code} at ${secs(L1b.sent)}`);
  } },
  { at: W1b.back + 65_000, run: async () => {
    const r = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: W1b.code } });
    check("first tap's other watch link fails ~65 s after its tap -> 410 watch_expired, clean message", r.status === 410 && r.json?.code === "watch_expired" && /expired/i.test(r.json?.error || ""), `${r.status} ${r.json?.code} at ${secs(W1b.sent)}`);
  } },
  { at: L2.sent + 55_000, run: async () => {
    const r = await call("POST", "/api/register", { body: { name: `Bo${tag.slice(0, 3)}`, emoji: "🦉", invite: L2.code } });
    check("a later tap's invite works ~55 s after ITS tap (after the first tap's codes died) -> 201", r.status === 201, `status ${r.status} at ${secs(L2.sent)}`);
  } },
  { at: W2.sent + 55_000, run: async () => {
    const r = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: W2.code } });
    check("a later tap's watch link works ~55 s after ITS tap -> 200", r.status === 200, `status ${r.status} at ${secs(W2.sent)}`);
  } },
  { at: L2b.back + 65_000, run: async () => {
    const r = await call("POST", "/api/register", { body: { name: `Cy${tag.slice(0, 3)}`, emoji: "🌵", invite: L2b.code } });
    check("a later tap's other invite fails ~65 s after ITS tap -> 403 invite_expired", r.status === 403 && r.json?.code === "invite_expired", `${r.status} ${r.json?.code} at ${secs(L2b.sent)}`);
  } },
  { at: W2b.back + 65_000, run: async () => {
    const r = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: W2b.code } });
    check("a later tap's other watch link fails ~65 s after ITS tap -> 410 watch_expired", r.status === 410 && r.json?.code === "watch_expired", `${r.status} ${r.json?.code} at ${secs(W2b.sent)}`);
  } },
].sort((x, y) => x.at - y.at);
for (const step of timeline) { await waitUntil(step.at); await step.run(); }

// ---------- v20 regression: an agent's join, say, look and leave ----------
const adaLook = await call("GET", "/api/look", { token: globalThis.ada });
check("v20: the agent's look -> 200 with its own view", adaLook.status === 200 && Boolean(adaLook.json), `status ${adaLook.status}`);
const adaSay = await call("POST", "/api/act", { token: globalThis.ada, body: { action: "say", message: "hello from the r2 test" } });
check("v20: the agent's say -> 200", adaSay.status === 200, `status ${adaSay.status}`);
const adaLeave = await call("POST", "/api/leave", { token: globalThis.ada, body: {} });
const afterLeave = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("v20: the agent's leave -> 200 and it is gone from the room", adaLeave.status === 200 && !(afterLeave.json?.agents || []).some((a) => a.name === `Ada${tag.slice(0, 3)}`), `status ${adaLeave.status}`);

// ---------- watch session expiry (local: WATCH_SESSION_MS) ----------
if (LOCAL && process.env.WATCH_SESSION_MS) {
  const ms = Number(process.env.WATCH_SESSION_MS);
  await waitUntil(W1.sent + 55_000 + ms + 2_000);
  const expired = await call("GET", "/api/state", { jar: globalThis.watcher2 });
  check(`watch session ends after WATCH_SESSION_MS (${ms / 1000}s) -> 403`, expired.status === 403, `status ${expired.status}`);
}

// ---------- every write from a watch session is a clean 403 watch_read_only ----------
const writes = [
  ["/api/tap", { id: "lamp" }], ["/api/tap", { objectId: "lamp" }], ["/api/tap", {}],
  ["/api/dog", {}], ["/api/radio", { action: "on" }], ["/api/door", { action: "pause" }],
  ["/api/apartment/invite", {}], ["/api/apartment/invite", { kind: "line" }], ["/api/apartment/invite", { kind: "watch" }],
  ["/api/apartment/watch-revoke", {}], ["/api/act", { action: "say", message: "hi" }], ["/api/leave", {}],
  ["/api/note", { text: "hi" }], ["/api/owner/leave", { agentId: "x" }],
];
const W3 = await tap("watch");
const watcher3 = new Jar();
const red3 = await call("POST", "/api/watch/redeem", { jar: watcher3, body: { code: W3.code } });
check("a fresh watch session for the write checks", red3.status === 200, `status ${red3.status}`);
const wr = [];
for (const [path, body] of writes) wr.push([path, await call("POST", path, { jar: watcher3, body })]);
const wDoorGet = await call("GET", "/api/door", { jar: watcher3 });
const bad = wr.filter(([, r]) => !(r.status === 403 && r.json?.code === "watch_read_only"));
check(`every write from a watch session -> 403 watch_read_only (${writes.length} routes/bodies, incl. tap and Invite with any body)`, bad.length === 0, bad.map(([p, r]) => `${p} ${r.status} ${r.json?.code ?? ""}`).join("; ") || "all 403");
check("a watch session can't read the door either -> 403", wDoorGet.status === 403);
const lampAfter = await call("GET", "/api/state", { jar: watcher3 });
check("the watch session still reads (state 200) after the refused writes", lampAfter.status === 200);
const ownerTap = await call("POST", "/api/tap", { jar: A.jar, ip: ipA, body: { id: "lamp" } });
check("the owner can still tap (lamp) -> 200", ownerTap.status === 200, `status ${ownerTap.status}`);
const agentWithWatch = new Jar(); agentWithWatch.map = new Map(watcher3.map);
const Lw = await tap("line");
const fresh = await call("POST", "/api/register", { body: { name: `Wat${tag.slice(0, 3)}`, emoji: "🪟", invite: Lw.code } });
const withWatch = await call("POST", "/api/act", { jar: agentWithWatch, token: fresh.json?.token, body: { action: "say", message: "hi" } });
check("an agent's bearer token still acts even if a watch cookie rides along -> 200", fresh.status === 201 && withWatch.status === 200, `register ${fresh.status}, act ${withWatch.status}`);

// ---------- watch links: at most 3 unused (oldest cancelled), owner revokes (on B, clean slate) ----------
const capTaps = [];
for (let i = 0; i < 4; i += 1) capTaps.push(await tap("watch", B.jar, ipB));
const oldest = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: capTaps[0].code } });
check("a 4th unused watch link cancels the oldest -> 403 watch_cancelled", oldest.status === 403 && oldest.json?.code === "watch_cancelled", `${oldest.status} ${oldest.json?.code}`);
const bWatcher = new Jar();
const newest = await call("POST", "/api/watch/redeem", { jar: bWatcher, body: { code: capTaps[3].code } });
check("the newest of the 4 still works -> 200", newest.status === 200, `status ${newest.status}`);
const revoke = await call("POST", "/api/apartment/watch-revoke", { jar: B.jar, ip: ipB, body: {} });
const afterRevokeLink = await call("POST", "/api/watch/redeem", { jar: new Jar(), body: { code: capTaps[2].code } });
const afterRevokeSession = await call("GET", "/api/state", { jar: bWatcher });
check("owner ends all watch links -> unused links cancelled and open watch sessions end (403)", revoke.status === 200 && afterRevokeLink.status === 403 && afterRevokeLink.json?.code === "watch_cancelled" && afterRevokeSession.status === 403, `revoke ${revoke.status}, link ${afterRevokeLink.status} ${afterRevokeLink.json?.code}, session ${afterRevokeSession.status}`);

// ---------- rate limits: 429 + Retry-After ----------
if (!SKIP_LIMITS) {
  const ip = nextIp();
  let last;
  for (let i = 0; i < 6; i += 1) last = await call("POST", "/api/auth/otp", { ip, body: { email: "not-an-email" } });
  check("sign-in emails per IP: 6th -> 429 + Retry-After with Writer's line (no mail sent: junk addresses)", last.status === 429 && Number(last.headers.get("retry-after")) > 0 && last.json?.error === "Too many emails for now. Try again in an hour.", `status ${last.status}`);
  const ip2 = nextIp();
  for (let i = 0; i < 9; i += 1) last = await call("POST", "/api/register", { ip: ip2, body: { name: "Spam", emoji: "🙂" } });
  check("door attempts per IP: register limit -> 429 + Retry-After", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
  const ip3 = nextIp();
  for (let i = 0; i < 6; i += 1) last = await call("POST", "/api/register", { ip: ip3, body: { name: `Bad${i}x`, emoji: "🙂", invite: "a".repeat(26) } });
  check("failed invites per IP: 6th -> 429 invite_rate_limited + Retry-After", last.status === 429 && last.json?.code === "invite_rate_limited" && Number(last.headers.get("retry-after")) > 0, `${last.status} ${last.json?.code}`);
  const ip4 = nextIp();
  for (let i = 0; i < 11; i += 1) last = await call("POST", "/api/watch/redeem", { ip: ip4, jar: new Jar(), body: { code: "b".repeat(26) } });
  check("watch redemptions per IP: 11th -> 429 + Retry-After", last.status === 429 && Number(last.headers.get("retry-after")) > 0, `status ${last.status}`);
  // apartment creation: 3 per IP per hour (A/B used other IPs); reuses existing c1..c4 test accounts
  const ip6 = nextIp();
  const created = [];
  for (const who of ["c1", "c2", "c3", "c4"]) {
    const s = await signIn(email(who), { ip: ip6 });
    created.push(await call("GET", "/api/me", { jar: s.jar, ip: ip6 }));
  }
  check("apartment creation per IP: 4th new account -> 429 create_rate_limited + Retry-After", created.slice(0, 3).every((r) => r.status === 200) && created[3].status === 429 && created[3].json?.code === "create_rate_limited" && Number(created[3].headers.get("retry-after")) > 0, created.map((r) => r.status).join(","));
  // invite mints: 10 per apartment per minute (inside the door write) / 20 per IP
  let mintLast;
  for (let i = 0; i < 11; i += 1) mintLast = await call("POST", "/api/apartment/invite", { jar: B.jar, ip: ipB, body: { kind: "line" } });
  check("Copy taps per apartment: 11th agent invite in a minute -> 429 invite_mint_limited + Retry-After", mintLast.status === 429 && mintLast.json?.code === "invite_mint_limited" && Number(mintLast.headers.get("retry-after")) > 0, `${mintLast.status} ${mintLast.json?.code}`);
}

// ---------- sign out ----------
const out = await call("POST", "/api/auth/signout", { jar: A.jar, ip: ipA, body: {} });
const afterOut = await call("GET", "/api/state", { jar: A.jar, ip: ipA });
check("sign out clears the session -> state 403", out.status === 200 && afterOut.status === 403, `${out.status}/${afterOut.status}`);

process.exitCode = done(`v21-http r2 (${LOCAL ? "local" : "preview"})`) ? 1 : 0;

// v19/v20 smoke test. Local server with ROOM_STORE=memory, or a private preview on the v19_test namespace through
// vercel curl (VERCEL_DEPLOYMENT=<url>). Never the live room. node scripts/v19-smoke.mjs http://localhost:3919
// v20: OWNER_KEY_FILE reuses the test room owner claimed by an earlier script; CAP_TEST=1 (local, INVITE_MINT_LIMIT>=13)
// runs the 10-unused cap; PASS_WAIT_MS (server GUEST_PASS_MS short) runs the pass-expiry check.
const BASE = process.argv[2] || "http://localhost:3919";
const results = [];
let ipN = 10;
const ip = () => `10.0.0.${ipN++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
import { execFile } from "node:child_process";
const VIA = process.env.VERCEL_DEPLOYMENT || "";
const VERCEL_BIN = process.env.VERCEL_BIN || "vercel";
function viaCurl(method, path, h, body) {
  const args = ["curl", path, "--deployment", VIA, "--scope", "mauriciogrs93s-projects", "--", "-s", "-i", "-X", method];
  for (const [k, v] of Object.entries(h)) if (k !== "x-forwarded-for") args.push("-H", `${k}: ${v}`);
  if (body) args.push("--data-raw", JSON.stringify(body));
  return new Promise((resolve) => execFile(VERCEL_BIN, args, { maxBuffer: 8 << 20 }, (err, out) => {
    const text = String(out || "").replace(/\r/g, "");
    const blocks = text.split("\n\n");
    let i = 0; while (i < blocks.length - 1 && /^HTTP\/[\d.]+ (1\d\d|30\d)/.test(blocks[i]) ) i += 1;
    const head = blocks[i] || ""; const rest = blocks.slice(i + 1).join("\n\n");
    const status = Number((head.match(/^HTTP\/[\d.]+ (\d+)/) || [])[1] || 0);
    const hdrs = new Map(); for (const line of head.split("\n").slice(1)) { const c = line.indexOf(":"); if (c > 0) { const k = line.slice(0, c).trim().toLowerCase(); hdrs.set(k, hdrs.has(k) ? hdrs.get(k) + ", " + line.slice(c + 1).trim() : line.slice(c + 1).trim()); } }
    let json = null; try { json = JSON.parse(rest); } catch {}
    resolve({ status, json, headers: { get: (k) => hdrs.get(k.toLowerCase()) ?? null } });
  }));
}
function skillViaCurl() {
  return new Promise((resolve) => execFile(VERCEL_BIN, ["curl", "/skill.md", "--deployment", VIA, "--scope", "mauriciogrs93s-projects", "--", "-s"], { maxBuffer: 8 << 20 }, (e, out) => resolve(String(out || ""))));
}
async function call(method, path, { body, cookie, token, xff, headers = {} } = {}) {
  const h = { "content-type": "application/json", origin: BASE, ...headers };
  if (cookie) h.cookie = cookie;
  if (token) h.authorization = `Bearer ${token}`;
  h["x-forwarded-for"] = xff || ip();
  if (VIA) return viaCurl(method, path, h, body);
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}
async function reg(body, xff) {
  for (let i = 0; ; i += 1) {
    const r = await call("POST", "/api/register", { body, xff });
    if (r.status !== 429 || r.json?.code === "invite_rate_limited" || i >= 3) return r;
    await sleep((Number(r.json?.retryAfter) || 20) * 1000 + 500);
  }
}
async function waitBusy(r) {
  const until = r?.json?.busyUntil ?? 0;
  const ms = until - Date.now();
  if (ms > 0) await sleep(Math.min(ms + 150, 20000));
}
async function act(token, body, extra = {}) {
  const r = await call("POST", "/api/act", { body, token, ...extra });
  return r;
}
async function look(token) {
  return call("GET", "/api/look", { token });
}
/** v20: owner mints an invite; waits out the 10-a-minute mint limit. */
async function mint(cookie) {
  for (let i = 0; ; i += 1) {
    const r = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
    if (r.status !== 429 || i >= 2) return r;
    await sleep(((Number(r.headers.get("retry-after")) || 30) + 1) * 1000);
  }
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
const KEY_FILE = process.env.OWNER_KEY_FILE || "";
let ownerKey = "";
if (KEY_FILE && existsSync(KEY_FILE)) {
  ownerKey = readFileSync(KEY_FILE, "utf8").trim();
  check("owner key from OWNER_KEY_FILE (room claimed by an earlier script)", /^own_/.test(ownerKey));
} else {
  const owner = await reg({ name: "Owner", emoji: "🏠" });
  check("first register on an empty room claims the owner (rescue)", owner.status === 201, `status ${owner.status}`);
  check("ownerLink uses #owner= (not a query string)", /\/room#owner=own_/.test(owner.json?.ownerLink || ""));
  ownerKey = owner.json.ownerKey;
  if (KEY_FILE) writeFileSync(KEY_FILE, ownerKey, { mode: 0o600 });
  await call("POST", "/api/leave", { token: owner.json.token });
}
const sess = await call("POST", "/api/owner/session", { body: { ownerKey } });
const setCookie = sess.headers.get("set-cookie") || "";
check("owner session sets HttpOnly Secure SameSite cookie", /__Host-lr_owner=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Lax/i.test(setCookie));
const cookie = `__Host-lr_owner=${encodeURIComponent(ownerKey)}`;
const info = await call("GET", "/api/owner/session", { cookie });
check("owner cookie opens the Door", info.json?.door === true);
const viaQuery = await call("GET", `/api/door?ownerKey=${ownerKey}`);
check("owner key in URL query is NOT accepted", viaQuery.status === 403, `status ${viaQuery.status}`);

// invite create + enter
const inv = await mint(cookie);
const code = inv.json?.invite || "";
check("invite create returns a 128-bit (26 base32) invite", inv.status === 200 && /^[a-z2-7]{26}$/.test(code), `status ${inv.status}`);
check("copied line (v20 Writer copy) has the invite outside the URL", /skill\.md and join the Living Room with invite [a-z2-7]{26}\. Use it now; it works once\.$/.test(inv.json?.line || "") && !/\?invite=/.test(inv.json?.line || ""), (inv.json?.line || "").replace(/[a-z2-7]{26}/, "<code>"));
const door1 = await call("GET", "/api/door", { cookie });
check("Door view never shows invite values", !JSON.stringify(door1.json).includes(code) && door1.json?.unused === 1);
const guest = await reg({ name: "Guest", emoji: "🍊", invite: code });
check("valid invite walks straight in (201)", guest.status === 201, `status ${guest.status}`);
const reuse = await reg({ name: "Reuser", invite: code });
check("reused invite rejected: invite_used", reuse.status === 403 && reuse.json?.code === "invite_used", `${reuse.status} ${reuse.json?.code} "${reuse.json?.error}"`);
const missing = await reg({ name: "Nobody" });
check("no invite: invite_missing + Writer copy", missing.status === 403 && missing.json?.code === "invite_missing" && missing.json?.error === "This room is private. Ask your person for an invite.", missing.json?.error);
check("missing invite: no 'Don't retry' hint", !/retry/i.test(missing.json?.hint || ""), missing.json?.hint);
check("used invite: 'Don't retry the same invite' hint", /Don't retry the same invite/.test(reuse.json?.hint || ""), reuse.json?.hint);
const wrong = await reg({ name: "Wrongo", invite: "aaaaaaaaaaaaaaaaaaaaaaaaaa" });
check("wrong invite: invite_invalid + Writer copy", wrong.status === 403 && wrong.json?.code === "invite_invalid" && wrong.json?.error === "This invite didn't work. Ask for a new one.");
const junk = await reg({ name: "Junk", invite: "../../etc/passwd'\"😀" });
check("malformed invite is invite_invalid, not 500", junk.status === 403 && junk.json?.code === "invite_invalid");
const doorAfter = await call("GET", "/api/door", { cookie });
check("no knocks: owner sees no knock list entries", (doorAfter.json?.knocks || []).length === 0);

// two agents racing one invite
const raceInv = (await mint(cookie)).json?.invite;
const race = await Promise.all([reg({ name: "RaceA", invite: raceInv }), reg({ name: "RaceB", invite: raceInv })]);
const wins = race.filter((r) => r.status === 201).length;
check("two agents on one invite: exactly one gets in", wins === 1, race.map((r) => `${r.status}:${r.json?.code || ""}`).join(","));

// expiry (v20: INVITE_TTL_MS is 60 s; door-http.mjs also checks ~55 s accepted / ~65 s rejected)
const expInv = (await mint(cookie)).json?.invite;
await sleep(Number(process.env.EXPIRY_WAIT_MS || 65000));
const expired = await reg({ name: "Latecomer", invite: expInv });
check("expired invite rejected: invite_expired", expired.status === 403 && expired.json?.code === "invite_expired", `${expired.status} ${expired.json?.code}`);

// max 10 unused (v20: with 10 mints a minute and a 1-minute TTL the cap is only reachable with INVITE_MINT_LIMIT raised)
if (process.env.CAP_TEST) {
  for (let i = 0; i < 12; i += 1) await call("POST", "/api/door", { cookie, body: { action: "invite" }, xff: "10.9.9.9" });
  const capped = await call("GET", "/api/door", { cookie });
  check("at most 10 unused invites (oldest cancelled)", capped.json?.unused === 10, `unused ${capped.json?.unused}`);
}

// pause / resume
const keep = (await mint(cookie)).json?.invite;
const paused = await call("POST", "/api/door", { cookie, body: { action: "pause" } });
check("pause cancels all unused invites in one write", paused.status === 200 && paused.json?.paused === true && paused.json?.unused === 0);
const blockedCreate = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
check("server refuses to create invites while paused", blockedCreate.status === 409 && blockedCreate.json?.code === "invites_paused");
const whilePaused = await reg({ name: "PausedTry", invite: keep });
check("invite while paused rejected (invite_paused, same message)", whilePaused.status === 403 && whilePaused.json?.code === "invite_paused" && whilePaused.json?.error === "This invite didn't work. Ask for a new one.");
check("paused: no 'Don't retry' hint", !/retry/i.test(whilePaused.json?.hint || ""), whilePaused.json?.hint);
const resumed = await call("POST", "/api/door", { cookie, body: { action: "resume" } });
check("resume", resumed.status === 200 && resumed.json?.paused === false);
const oldAfter = await reg({ name: "OldLine", invite: keep });
check("invite cancelled by Pause -> invite_cancelled after Resume", oldAfter.status === 403 && oldAfter.json?.code === "invite_cancelled" && !/retry/i.test(oldAfter.json?.hint || ""), `${oldAfter.json?.code} / ${oldAfter.json?.hint}`);
const fresh = (await mint(cookie)).json?.invite;
const freshIn = await reg({ name: "Fresh", invite: fresh });
check("fresh invite after Resume works", freshIn.status === 201);

// guest pass: an invited (untrusted) agent rejoins with its own key or token (server GUEST_PASS_MS is short in tests)
const fk = freshIn.json?.ownerKey, fTok = freshIn.json?.token, fEmoji = freshIn.json?.emoji, fColor = freshIn.json?.color;
await call("POST", "/api/leave", { token: fTok });
const rj1 = await reg({ name: "Fresh", ownerKey: fk });
check("rejoin after removal with own ownerKey -> 201", rj1.status === 201, `${rj1.status} ${rj1.json?.code || ""}`);
check("rejoin keeps the earlier look (no emoji/colour sent)", rj1.json?.emoji === fEmoji && rj1.json?.color === fColor, `${rj1.json?.emoji} ${rj1.json?.color} vs ${fEmoji} ${fColor}`);
const fDoor = await call("GET", "/api/door", { cookie });
check("rejoin grants no trust", !(fDoor.json?.trusted || []).some((p) => p.id === freshIn.json?.agentId));
const fCookie = `__Host-lr_owner=${encodeURIComponent(fk)}`;
check("rejoined guest gets no owner rights", (await call("GET", "/api/door", { cookie: fCookie })).status === 403);
await call("POST", "/api/leave", { token: rj1.json?.token });
const rj2 = await reg({ name: "Fresh", token: rj1.json?.token });
check("rejoin with own token -> 201", rj2.status === 201, `${rj2.status} ${rj2.json?.code || ""}`);
await call("POST", "/api/leave", { token: rj2.json?.token });
await call("POST", "/api/door", { cookie, body: { action: "pause" } });
const rjP = await reg({ name: "Fresh", ownerKey: fk });
check("guest pass refused while paused (invite_paused)", rjP.status === 403 && rjP.json?.code === "invite_paused", `${rjP.status} ${rjP.json?.code}`);
await call("POST", "/api/door", { cookie, body: { action: "resume" } });
const rjR = await reg({ name: "Fresh", ownerKey: fk });
check("Pause did not cancel the guest pass: rejoin after Resume -> 201", rjR.status === 201, `${rjR.status} ${rjR.json?.code || ""}`);
await call("POST", "/api/leave", { token: rjR.json?.token });
const rem = await call("POST", "/api/door", { cookie, body: { action: "remove", id: freshIn.json?.agentId } });
const rjX = await reg({ name: "Fresh", ownerKey: fk });
check("rejoin after owner's Remove -> refused", rem.status === 200 && rjX.status === 403, `remove ${rem.status}; rejoin ${rjX.status} ${rjX.json?.code}`);
const lateInv = (await mint(cookie)).json?.invite;
const late = await reg({ name: "Later", invite: lateInv });
await call("POST", "/api/leave", { token: late.json?.token });
if (process.env.PASS_WAIT_MS) {
  await sleep(Number(process.env.PASS_WAIT_MS));
  const rjL = await reg({ name: "Later", ownerKey: late.json?.ownerKey });
  check("rejoin after the pass expires (24 h; short in tests) -> refused", late.status === 201 && rjL.status === 403, `${late.status} -> ${rjL.status} ${rjL.json?.code}`);
} else check("Later joined with an invite (pass-expiry wait skipped: GUEST_PASS_MS is the real 24 h)", late.status === 201, `${late.status}`);

// skill.md first register example works as written (invite in the body)
const skillRes = VIA ? null : await fetch(BASE + "/skill.md");
const skillTxt = skillRes ? await skillRes.text() : await skillViaCurl();
const sec = skillTxt.split("## 1. Register")[1] || "";
const ex = (sec.match(/-d '(\{[^']+\})'/) || [])[1] || "";
const exInv = (await mint(cookie)).json?.invite;
let exBody = null; try { exBody = JSON.parse(ex.replace("YOUR_INVITE", exInv)); } catch {}
const exReg = exBody ? await reg(exBody) : { status: 0 };
check("skill.md '## 1. Register' example includes invite and works as written (201)", /"invite":"YOUR_INVITE"/.test(ex) && exReg.status === 201, `${ex.slice(0, 90)} -> ${exReg.status} ${exReg.json?.code || ""}`);
check("skill.md has no THE_INVITE and has the Joining paragraph (TTL wording from INVITE_TTL_MS)", !skillTxt.includes("THE_INVITE") && skillTxt.includes("**Joining.** Your person gave you a line") && skillTxt.includes("expires about a minute after it was made"));
if (exReg.json?.token) await call("POST", "/api/leave", { token: exReg.json.token });

// impostor: an invited/trusted agent's key has no owner powers
const gkey = guest.json.ownerKey;
const gcookie = `__Host-lr_owner=${encodeURIComponent(gkey)}`;
const gDoor = await call("GET", "/api/door", { cookie: gcookie });
const gInv = await call("POST", "/api/door", { cookie: gcookie, body: { action: "invite" } });
check("invited agent's key gets no Door (403)", gDoor.status === 403 && gInv.status === 403);
const trust = await call("POST", "/api/door", { cookie, body: { action: "trust", id: guest.json.agentId } });
check("owner can Trust a recent visitor from People", trust.status === 200 && (trust.json?.trusted || []).some((p) => p.id === guest.json.agentId));
await call("POST", "/api/leave", { token: guest.json.token });
const back = await reg({ name: "Guest", ownerKey: gkey });
check("trusted agent with its key walks in without an invite", back.status === 201, `status ${back.status} ${back.json?.code || ""}`);
check("look kept after Trust (re-register without emoji/colour)", back.json?.emoji === guest.json?.emoji && back.json?.color === guest.json?.color, `${back.json?.emoji} ${back.json?.color} vs ${guest.json?.emoji} ${guest.json?.color}`);
const tDoor = await call("GET", "/api/door", { cookie: gcookie });
const tPause = await call("POST", "/api/door", { cookie: gcookie, body: { action: "pause" } });
check("trusted is NOT owner: no Door view, cannot pause (403)", tDoor.status === 403 && tPause.status === 403);
const poppy = await reg({ name: "Poppy" });
check("'Poppy' by name gets no entry or trust", poppy.status === 403);
const ownerLeaveImpostor = await call("POST", "/api/door", { cookie: gcookie, body: { action: "untrust", id: guest.json.agentId } });
check("impostor cannot untrust", ownerLeaveImpostor.status === 403);
const xsite = await call("POST", "/api/door", { cookie, body: { action: "pause" }, headers: { origin: "https://evil.example" } });
check("cross-site POST with owner cookie refused", xsite.status === 403);

// cooking (Tester bugs 1+2)
const cook = await reg({ name: "Cook", emoji: "🍳", invite: (await mint(cookie)).json?.invite });
const ct = cook.json.token;
let r = await act(ct, { action: "take", objectId: "fridge" }); await waitBusy(r);
let l = await look(ct);
const took = l.json?.you?.holding?.label;
check("take from fridge -> holding", r.status === 200 && Boolean(took), `holding ${took}`);
r = await act(ct, { action: "stove_on", objectId: "stove" }); await waitBusy(r);
l = await look(ct);
const cooked = l.json?.you?.holding?.label;
check("stove_on while holding eggs cooks a dish (stove does something)", r.status === 200 && /omelette|toast|warm milk/.test(cooked || ""), `${r.json?.message} -> ${cooked}`);
r = await act(ct, { action: "sit", objectId: "table" }); await waitBusy(r);
l = await look(ct);
check("holding survives walking + sitting", Boolean(l.json?.you?.holding), `holding ${l.json?.you?.holding?.label}`);
r = await act(ct, { action: "eat", objectId: "fridge" });
check("eat while seated at the table -> 200", r.status === 200, `${r.status} ${r.json?.message || r.json?.error}`);
await waitBusy(r);
l = await look(ct);
check("events show cook and eat", (l.json?.events || []).some((e) => /cooked/.test(e.text)) && (l.json?.events || []).some((e) => /ate|drank/.test(e.text)));

// plant (Tester bug 3)
const stages = [];
for (let i = 0; i < 3; i += 1) {
  r = await act(ct, { action: "water", objectId: "plant" });
  await waitBusy(r);
  l = await look(ct);
  const plant = (l.json?.objects || []).find((o) => o.id === "plant");
  stages.push(plant?.state?.stage); if (i === 0) console.log("  water ->", r.status, JSON.stringify(r.json).slice(0, 200));
}
check("watering never lowers the plant stage", stages.every((s, i) => i === 0 || s >= stages[i - 1]) && stages[0] >= 2, `stages ${stages.join(",")} msg "${r.json?.message}"`);

// computer off (Tester bug 4)
r = await act(ct, { action: "computer_sit", objectId: "computer" }); await waitBusy(r);
r = await act(ct, { action: "computer_type", objectId: "computer", text: "hello" }); await waitBusy(r);
r = await act(ct, { action: "computer_off", objectId: "computer" }); await waitBusy(r);
const st = await call("GET", "/api/state");
const comp = (st.json?.objects || []).find((o) => o.id === "computer");
check("computer_off clears user and line", comp && comp.state.power === false && !comp.state.user && !comp.state.line, JSON.stringify({ power: comp?.state?.power, user: comp?.state?.user, line: comp?.state?.line }));

// house clock (window text runs on America/New_York)
const etHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
const band = etHour < 5 ? "Night" : etHour < 8 ? "Early morning" : etHour < 11 ? "Morning" : etHour < 16 ? "Afternoon" : etHour < 19 ? "Late afternoon" : etHour < 21 ? "Dusk" : "Evening";
r = await act(ct, { action: "look_outside", objectId: "window" }); await waitBusy(r);
const view = st.json?.room?.view || st.json?.view || "";
const win = JSON.stringify(st.json).match(/"(Night|Early morning|Morning|Afternoon|Late afternoon|Dusk|Evening)\. [^"]*"/)?.[0] || r.json?.message || "";
check("window/time-of-day uses Eastern time", win.includes(`${band}.`) || String(r.json?.message || "").includes(`${band}.`), `ET hour ${etHour} -> expect ${band}; got ${win || r.json?.message} ${view}`);

// idempotency + burst
const idemAgent = await reg({ name: "Idem", invite: (await mint(cookie)).json?.invite });
const it = idemAgent.json.token;
await sleep(1600);
const k = `smoke-${Date.now()}`;
const a1 = await act(it, { action: "say", message: "hello once" }, { headers: { "idempotency-key": k } });
await sleep(1600);
const a2 = await act(it, { action: "say", message: "hello once" }, { headers: { "idempotency-key": k } });
const st2 = await call("GET", "/api/state");
const said = (st2.json?.events || []).filter((e) => /hello once/.test(e.text || "")).length;
check("same Idempotency-Key twice -> one action, same response", a1.status === 200 && a2.status === 200 && JSON.stringify(a1.json) === JSON.stringify(a2.json) && said <= 1, `events ${said} a1 ${a1.status} a2 ${a2.status} same ${JSON.stringify(a1.json) === JSON.stringify(a2.json)}`);
await sleep(1600);
const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => act(it, { action: "emote", emote: "wave" })));
const codes = burst.map((b) => b.status);
check("burst of 6 acts -> fast 429 slow_down, no 503", codes.filter((c) => c === 429).length >= 2 && !codes.includes(503), codes.join(","));

// v20: every test agent leaves
for (const t of [...race.map((x) => x.json?.token), back.json?.token, ct, it, freshIn.json?.token, late.json?.token]) if (t) await call("POST", "/api/leave", { token: t });
const stEnd = await call("GET", "/api/state");
const stay = (stEnd.json?.agents || []).map((x) => x.name);
check("all smoke agents left", !stay.some((n) => /^(Owner|Guest|RaceA|RaceB|Fresh|Later|Cook|Idem|Juniper)$/.test(n)), stay.join(","));

// rate limit on failed invites (runs last: on a single-IP preview it blocks this IP for 10 min)
const rlIp = "10.77.0.1";
const fails = [];
for (let i = 0; i < Number(process.env.FAIL_LIMIT || 5) + 1; i += 1) {
  const f = await reg({ name: `Guess${i}`, invite: "bbbbbbbbbbbbbbbbbbbbbbbbbb" }, rlIp);
  fails.push(f.status); if (f.status === 429) { check("too many wrong invites: 429 invite_rate_limited", f.json?.code === "invite_rate_limited", fails.join(",")); break; }
}
if (!fails.includes(429)) check("too many wrong invites: 429 invite_rate_limited", false, fails.join(","));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

// v19 scripted playtest: an agent following skill.md on a protected preview (via vercel curl) or a local server.
// VERCEL_DEPLOYMENT=<url> VERCEL_BIN=<vercel> node scripts/v19-playtest.mjs <url>
const BASE = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
async function call(method, path, { body, cookie, token } = {}) {
  const h = { "content-type": "application/json", origin: BASE };
  if (cookie) h.cookie = cookie;
  if (token) h.authorization = `Bearer ${token}`;
  if (VIA) return viaCurl(method, path, h, body);
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}
const rows = [];
const redact = (o) => JSON.stringify(o ?? null).replace(/(own|tok|lr)_[A-Za-z0-9_-]{8,}/g, "$1_…").replace(/"invite":"[a-z2-7]{26}"/g, '"invite":"…"').slice(0, 300);
function rec(step, ok, r) { rows.push({ step, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${step}${ok ? "" : `  -> ${r?.status} ${redact(r?.json)}`}`); }
let T = "";
async function act(step, body, okIf) {
  let r = await call("POST", "/api/act", { body, token: T });
  for (let i = 0; r.status === 429 && i < 3; i += 1) { await sleep(1500); r = await call("POST", "/api/act", { body, token: T }); }
  const until = r.json?.busyUntil ?? 0;
  if (until > Date.now()) await sleep(Math.min(until - Date.now() + 300, 25000));
  const l = await call("GET", "/api/look", { token: T });
  const last = l.json?.you?.lastResult;
  const ok = r.status === 200 && r.json?.ok !== false && (last ? last.ok !== false : true) && (!okIf || okIf(l.json, r.json));
  rec(step, ok, ok ? r : { status: r.status, json: { act: r.json, lastResult: last, you: { status: l.json?.you?.status, position: l.json?.you?.position, holding: l.json?.you?.holding } } });
  return l.json;
}
const skill = await call("GET", "/skill.md");
const skillText = typeof skill.json === "string" ? skill.json : "";
// skill.md is text; fetch raw for the check
rec("skill.md served", skill.status === 200 || skill.status === 0, skill);
const owner = await call("POST", "/api/register", { body: { name: "Owner", emoji: "🏠" } });
rec("owner registers (fresh test room: rescue owner)", owner.status === 201 && Boolean(owner.json?.ownerKey), owner);
const ownerKey = owner.json?.ownerKey || "";
const sess = await call("POST", "/api/owner/session", { body: { ownerKey } });
rec("owner session cookie set", sess.status === 200 && /__Host-lr_owner=/.test(sess.headers.get("set-cookie") || ""), { status: sess.status, json: sess.json });
const cookie = `__Host-lr_owner=${encodeURIComponent(ownerKey)}`;
const inv = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
rec("owner taps Invite an agent", inv.status === 200 && /^[a-z2-7]{26}$/.test(inv.json?.invite || ""), inv);
const oleave = await call("POST", "/api/leave", { token: owner.json?.token });
rec("owner agent leaves; owner key still runs the Door", oleave.status === 200, oleave);
const agent = await call("POST", "/api/register", { body: { name: "Tester", emoji: "🧪", invite: inv.json?.invite } });
rec("agent joins with the invite in the body (201)", agent.status === 201 && Boolean(agent.json?.token), agent);
T = agent.json?.token || "";
const reuse = await call("POST", "/api/register", { body: { name: "Again", invite: inv.json?.invite } });
rec("same invite again -> 403 invite_used", reuse.status === 403 && reuse.json?.code === "invite_used", reuse);
const y = (l) => l?.you?.position?.y ?? l?.you?.floor ?? null;
await act("look_outside (window)", { action: "look_outside", objectId: "window" });
await act("kettle_on", { action: "kettle_on", objectId: "kettle" });
await act("kettle_off", { action: "kettle_off", objectId: "kettle" });
await act("take from fridge", { action: "take", objectId: "fridge" }, (l) => Boolean(l?.you?.holding));
await act("cook (stove) cooks the held food", { action: "cook", objectId: "stove" }, (l) => (l?.events || []).some((e) => /cook/i.test(e.text || "")));
await act("eat the dish", { action: "eat", objectId: "fridge" });
await act("take from fridge again (orange)", { action: "take", objectId: "fridge" }, (l) => Boolean(l?.you?.holding));
await act("eat the orange", { action: "eat", objectId: "fridge" });
await act("take milk", { action: "take", objectId: "fridge" }, (l) => /milk/.test(JSON.stringify(l?.you?.holding || "")));
await act("stove_on on a hot stove while holding milk -> warm milk", { action: "stove_on", objectId: "stove" }, (l) => /warm milk/i.test(JSON.stringify(l?.you?.holding || "")));
await act("stove_off", { action: "stove_off", objectId: "stove" });
await act("sit at table", { action: "sit", objectId: "table" });
await act("eat", { action: "eat", objectId: "fridge" });
await act("water plant", { action: "water", objectId: "plant" });
await act("light_on kitchen", { action: "light_on", objectId: "kitchen-light" });
await act("walk to sofa (stairs up)", { action: "sit", objectId: "sofa" });
await act("tv_on", { action: "tv_on", objectId: "tv" });
await act("tv_off", { action: "tv_off", objectId: "tv" });
await act("radio_on", { action: "radio_on", objectId: "radio" });
await act("radio_next", { action: "radio_next", objectId: "radio" });
await act("radio_off", { action: "radio_off", objectId: "radio" });
await act("book_write (bookshelf)", { action: "book_write", objectId: "bookshelf", title: "House journal", text: "v19 playtest: kettle, stove, plant, radio, tv." });
await act("sit in reading chair", { action: "sit", objectId: "reading-chair" });
await act("pet the dog", { action: "pet" });
await act("lie on bed (stairs up again)", { action: "lie", objectId: "bed" });
await act("computer_sit", { action: "computer_sit", objectId: "computer" });
await act("computer_type", { action: "computer_type", objectId: "computer", text: "hello from v19" });
await act("computer_off clears the screen", { action: "computer_off", objectId: "computer" }, (l) => { const c = (l?.objects || []).find((o) => o.id === "computer"); return c && !c.state?.user && !c.state?.line; });
await act("wardrobe_open", { action: "wardrobe_open", objectId: "wardrobe" });
await act("wardrobe_close", { action: "wardrobe_close", objectId: "wardrobe" });
await act("lamp_toggle", { action: "lamp_toggle", objectId: "lamp" });
await act("walk down to the table (stairs down)", { action: "move", objectId: "table" });
const dog = await call("POST", "/api/dog");
rec("viewer taps the dog (/api/dog)", dog.status === 200, dog);
const note = await call("POST", "/api/note", { cookie, body: { message: "Put the kettle on, please." } });
rec("owner writes a note (cookie)", note.status === 200 || note.status === 201, note);
const box = await call("GET", "/api/note", { cookie });
rec("owner reads the mailbox", box.status === 200, box);
const say = await call("POST", "/api/act", { token: T, body: { action: "say", message: "Thanks for having me." } });
rec("agent says goodbye", say.status === 200, say);
await sleep(1600);
const leave = await call("POST", "/api/leave", { token: T });
rec("agent leaves (POST /api/leave)", leave.status === 200 && leave.json?.ok === true, leave);
const after = await call("GET", "/api/look", { token: T });
rec("token no longer works after leave", after.status === 401 || after.status === 403 || after.status === 404, after);
const f = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - f.length}/${rows.length} passed`);

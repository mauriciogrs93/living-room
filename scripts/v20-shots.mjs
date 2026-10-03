// v20 screenshots + phone/desktop GL stats (empty room first, then with agents) and the owner/non-owner join spot.
// Local memory-store server (the preview's login wall blocks a headless browser without a share link):
// PW_CORE=… PW_CHROME=… OUT=/workspace/engineer-kb/v20/ node scripts/v20-shots.mjs http://127.0.0.1:3920
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE);
const BASE = process.argv[2] || "http://127.0.0.1:3920";
const OUT = (process.env.OUT || new URL("../shots/", import.meta.url).pathname).replace(/\/?$/, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 50;
async function call(method, path, { body, cookie, token } = {}) {
  const h = { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.1.0.${n++}` };
  if (cookie) h.cookie = cookie;
  if (token) h.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  if (opts.clip) await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
  return { ctx, p: await ctx.newPage() };
}
const PHONE = [{ width: 390, height: 844 }, { dpr: 2, mobile: true }];
const DESK = [{ width: 1440, height: 900 }, {}];
async function stats(label, [vp, o], file) {
  const { ctx, p } = await page(vp, o);
  await p.goto(`${BASE}/room?debug=1`, { waitUntil: "networkidle" });
  await sleep(10000);
  const s = await p.evaluate(() => window.__glStats || null);
  console.log(`glStats ${label}`, JSON.stringify(s));
  if (file) await p.screenshot({ path: OUT + file });
  await ctx.close();
}
// empty room (only the dog): perf sanity
await stats("phone 390x844 empty", PHONE, "v20-room-phone-390x844-empty.png");
await stats("desktop 1440x900 empty", DESK, "v20-room-desktop-1440x900-empty.png");
// owner + three agents
const owner = await call("POST", "/api/register", { body: { name: "Basil", emoji: "🌿" } });
const ownerKey = owner.json.ownerKey;
const cookie = `__Host-lr_owner=${encodeURIComponent(ownerKey)}`;
const tokens = [owner.json.token];
for (const [name, emoji] of [["Juniper", "🫐"], ["Poppy", "🌺"], ["Cook", "🍳"]]) {
  const inv = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
  const r = await call("POST", "/api/register", { body: { name, emoji, invite: inv.json.invite } });
  tokens.push(r.json?.token);
  if (name === "Juniper") await call("POST", "/api/act", { token: r.json.token, body: { action: "say", message: "Morning! The kettle is on." } });
}
for (const [label, cfg, file] of [["desktop", DESK, "v20-room-desktop-1440x900.png"], ["phone", PHONE, "v20-room-phone-390x844.png"]]) {
  const { ctx, p } = await page(cfg[0], cfg[1]);
  await p.goto(`${BASE}/room`, { waitUntil: "networkidle" });
  await sleep(10000);
  await p.screenshot({ path: OUT + file });
  console.log("shot", label);
  await ctx.close();
}
await stats("phone 390x844 with 4 agents", PHONE);
// non-owner join spot: landing + Activity
{
  const { ctx, p } = await page(DESK[0]);
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1500);
  await p.screenshot({ path: OUT + "v20-landing-nonowner-1440x900.png" });
  await ctx.close();
  const ph = await page(PHONE[0], PHONE[1]);
  await ph.p.goto(`${BASE}/room#activity`, { waitUntil: "load" });
  await sleep(8000);
  await ph.p.screenshot({ path: OUT + "v20-activity-nonowner-phone.png" });
  await ph.ctx.close();
}
// owner: landing Copy -> Copied, Activity Copy, Door tab
{
  const { ctx, p } = await page(DESK[0], { clip: true });
  await p.goto(`${BASE}/room#owner=${ownerKey}`, { waitUntil: "load" });
  await sleep(4000);
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1500);
  await p.screenshot({ path: OUT + "v20-landing-owner-idle.png" });
  await p.locator("[data-owner-copy] button").click();
  await p.waitForSelector('[data-copy-state="copied"]', { timeout: 10000 }).catch(() => {});
  await p.screenshot({ path: OUT + "v20-landing-owner-copied.png" });
  await p.goto(`${BASE}/room#activity`, { waitUntil: "load" });
  await sleep(8000);
  await p.locator("[data-owner-copy] button").click();
  await p.waitForSelector('[data-copy-state="copied"]', { timeout: 10000 }).catch(() => {});
  await p.screenshot({ path: OUT + "v20-activity-owner-copied.png" });
  await ctx.close();
}
for (const t of tokens) if (t) await call("POST", "/api/leave", { token: t });
await browser.close();

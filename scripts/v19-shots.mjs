// v19 screenshots against a local memory-store server. node scripts/v19-shots.mjs http://localhost:3919
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE);
const BASE = process.argv[2] || "http://localhost:3919";
const OUT = new URL("../shots/", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 50;
async function call(method, path, { body, cookie } = {}) {
  const h = { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.1.0.${n++}` };
  if (cookie) h.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const owner = await call("POST", "/api/register", { body: { name: "Basil", emoji: "🌿" } });
const ownerKey = owner.json.ownerKey;
const cookie = `__Host-lr_owner=${encodeURIComponent(ownerKey)}`;
for (const [name, emoji] of [["Juniper", "🫐"], ["Poppy", "🌺"], ["Cook", "🍳"]]) {
  const inv = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
  const r = await call("POST", "/api/register", { body: { name, emoji, invite: inv.json.invite } });
  console.log("registered", name, r.status);
  if (name === "Juniper" && r.json?.token) {
    await fetch(BASE + "/api/act", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${r.json.token}`, origin: BASE }, body: JSON.stringify({ action: "say", message: "Morning! The kettle is on." }) });
  }
}
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, permissions: opts.clip ? ["clipboard-read", "clipboard-write"] : [] });
  const p = await ctx.newPage();
  return { ctx, p };
}
// desktop room + gl stats
if (!process.env.SKIP_ROOM) {
  const { ctx, p } = await page({ width: 1440, height: 900 });
  await p.goto(`${BASE}/room?debug=1`, { waitUntil: "networkidle" });
  await sleep(9000);
  await p.screenshot({ path: OUT + "room-desktop-1440x900.png" });
  const stats = await p.evaluate(() => window.__glStats || null);
  console.log("glStats", JSON.stringify(stats));
  await p.getByRole("button", { name: /HERE/ }).first().click().catch(() => {});
  await sleep(1500);
  const clock = p.locator(".hud-tb-row.is-muted").first();
  if (await clock.count()) { console.log("clock", await clock.innerText()); await p.screenshot({ path: OUT + "corner-clock-panel.png" }); const b = await clock.locator("xpath=..").boundingBox(); if (b) await p.screenshot({ path: OUT + "corner-clock.png", clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 140) } }); }
  else console.log("clock row not found");
  await ctx.close();
}
// phone
if (!process.env.SKIP_ROOM) {
  const { ctx, p } = await page({ width: 390, height: 844 }, { dpr: 2, mobile: true });
  await p.goto(`${BASE}/room`, { waitUntil: "networkidle" });
  await sleep(9000);
  await p.screenshot({ path: OUT + "room-phone-390x844.png" });
  await ctx.close();
}
// door tab states (owner session via #owner= bootstrap)
{
  const { ctx, p } = await page({ width: 1440, height: 900 }, { clip: true });
  await p.goto(`${BASE}/room#owner=${ownerKey}`, { waitUntil: "load" });
  await sleep(4000);
  await p.evaluate(() => { window.location.hash = "door"; });
  await sleep(2500);
  const tab = p.locator("[data-door-section]");
  console.log("door visible", await tab.count(), "url has key", p.url().includes(ownerKey));
  await p.screenshot({ path: OUT + "door-idle.png" });
  const row = p.locator(".hud-tb-row.is-muted").first();
  console.log("clock", await row.innerText());
  const b = await row.boundingBox();
  if (b) await p.screenshot({ path: OUT + "corner-clock.png", clip: { x: b.x - 16, y: b.y - 60, width: b.width + 32, height: b.height + 76 } });
  await p.getByRole("button", { name: /Invite an agent/i }).click();
  await p.waitForSelector('[data-door-state="copied"], [data-door-state="failed"]', { timeout: 10000 }).catch(() => {});
  console.log("after tap state", await tab.getAttribute("data-door-state"));
  await p.screenshot({ path: OUT + "door-copied.png" });
  await p.getByRole("button", { name: "More" }).click();
  await sleep(400);
  await p.screenshot({ path: OUT + "door-menu.png" });
  await p.getByRole("menuitem", { name: /Pause invites/i }).click();
  await p.waitForSelector('[data-door-state="paused"]', { timeout: 8000 }).catch(() => {});
  await sleep(600);
  console.log("after pause state", await tab.getAttribute("data-door-state"));
  await p.screenshot({ path: OUT + "door-paused.png" });
  await ctx.close();
}
await browser.close();

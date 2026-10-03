// v21 browser check + screenshots (codes and links blurred via [data-secret]; nothing secret is printed).
//   BASE=http://localhost:3921 PREVIEW=<preview url> node v21-shots.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const BASE = (process.env.BASE || "http://localhost:3921").replace(/\/$/, "");
const PREVIEW = process.env.PREVIEW;
const OUT = "/workspace/engineer-kb/v21";
const BLUR = "[data-secret]{filter:blur(7px)!important;user-select:none}";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`); };

function tokenHash(email) {
  const token = readFileSync("/workspace/.secrets/v21-test-admin.token", "utf8").trim();
  const out = execFileSync(`${process.env.HOME}/.local/bin/vercel`, ["curl", "/api/test-admin/link", "--deployment", PREVIEW, "--scope", "mauriciogrs93s-projects", "--", "-s", "-X", "POST", "-H", "content-type: application/json", "-H", `x-v21-test-token: ${token}`, "--data-raw", JSON.stringify({ email })], { encoding: "utf8" });
  return JSON.parse(out).tokenHash;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const vp = { width: 1280, height: 800 };
const ip = () => `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; // local server: a fresh "IP" per actor
const opts = () => ({ viewport: vp, ...(BASE.includes("localhost") ? { extraHTTPHeaders: { "x-forwarded-for": ip() } } : {}) });
try {
  // 1. Stranger: sign-in screen.
  const anon = await browser.newContext(opts());
  const p0 = await anon.newPage();
  await p0.goto(`${BASE}/room`, { waitUntil: "networkidle" });
  await p0.waitForSelector("[data-signin] input[type=email]", { timeout: 20000 });
  await p0.screenshot({ path: `${OUT}/01-sign-in.png` });
  check("stranger at /room sees the sign-in screen (email field), no room", (await p0.locator("[data-signin]").count()) === 1);

  // 2. Owner: sign in (magic-link hash from the preview-only helper), land in the room, open the menu.
  const ctx = await browser.newContext(opts());
  await ctx.addInitScript((css) => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }); }, BLUR);
  const page = await ctx.newPage();
  const email = `v21t-shots-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto(`${BASE}/auth/confirm?token_hash=${encodeURIComponent(tokenHash(email))}&type=magiclink`, { waitUntil: "networkidle" });
  check("magic link lands on /room signed in", new URL(page.url()).pathname === "/room", new URL(page.url()).pathname);
  await page.waitForSelector("[data-hud=fab]", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click("[data-hud=fab]");
  await page.waitForSelector("[data-hud=invite]", { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-menu-invite-button.png` });
  check("owner's menu shows the Invite button", await page.locator("[data-hud=invite]").isVisible());

  // 3. Invite tab: line + watch link (blurred), countdown.
  await page.click("[data-hud=invite]");
  await page.waitForSelector("[data-invite-section][data-invite-state=live]", { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-invite-line-and-watch-link.png` });
  const line1 = await page.locator("[data-invite-value=line]").innerText();
  const link1 = await page.locator("[data-invite-value=watch]").innerText();
  check("Invite shows Writer's line with a fresh code", /^Read https?:\/\/\S+\/skill\.md and join the Living Room with invite [a-z2-7]{26}\. Use it now; it works once\.$/.test(line1.trim()));
  check("Invite shows a watch link (/room#watch=…)", /\/room#watch=[a-z2-7]{26}$/.test(link1.trim()));
  check("codes are blurred in screenshots", (await page.locator("[data-secret]").first().evaluate((el) => getComputedStyle(el).filter)).includes("blur"));

  // 5. Rotation: while the tab stays open, a new pair appears at ~50 s.
  const t = Date.now();
  await page.waitForFunction((old) => { const el = document.querySelector("[data-invite-value=line]"); return el && el.textContent.trim() && el.textContent.trim() !== old; }, line1.trim(), { timeout: 70000, polling: 1000 });
  const secs = Math.round((Date.now() - t) / 1000);
  const line2 = await page.locator("[data-invite-value=line]").innerText();
  check("open Invite tab rotates to a new line before the old one expires (~50 s)", line2.trim() !== line1.trim() && secs <= 55, `${secs}s after first shown`);
  await page.screenshot({ path: `${OUT}/05-invite-rotated.png` });
  const link2 = (await page.locator("[data-invite-value=watch]").innerText()).trim();
  await ctx.close();

  // 4. A person opens the watch link: read-only view of this apartment.
  const guest = await browser.newContext(opts());
  const gp = await guest.newPage();
  await gp.goto(link2.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" }).catch(() => { throw new Error("watch link page did not load"); });
  await gp.waitForFunction(() => document.body.innerText.includes("READ-ONLY"), null, { timeout: 30000 });
  await gp.waitForTimeout(1500);
  await gp.screenshot({ path: `${OUT}/04-watch-link-read-only.png`, timeout: 90000 });
  check("watch link opens the apartment read-only (badge), code removed from the address bar", (await gp.evaluate(() => document.body.innerText)).includes("READ-ONLY") && !gp.url().includes("watch="));
  check("guest sees no Invite button", (await gp.locator("[data-hud=invite]").count()) === 0);

} catch (e) {
  check("browser run completed", false, String(e.message || e).split("\n")[0].replace(/\b[a-z2-7]{26}\b/g, "<code>"));
} finally {
  await browser.close();
}
const fail = results.filter((r) => !r).length;
console.log(`\nv21-shots: ${results.length - fail} passed, ${fail} failed, ${results.length} total`);
process.exitCode = fail ? 1 : 0;

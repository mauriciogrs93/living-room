// Draw-call probe. SwiftShader frame times are not a performance result.
//   BASE=http://127.0.0.1:3921 node scripts/hud/hud-perf.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/tmp/pw/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || "/opt/google/chrome/chrome";
const BASE = (process.env.BASE || "http://127.0.0.1:3921").replace(/\/$/, "");
const tag = Math.random().toString(36).slice(2, 8);
const password = "correct-horse-1";

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  extraHTTPHeaders: { "x-forwarded-for": "10.90.7.7" },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/room?debug=1`, { waitUntil: "domcontentloaded" });
await page.click("[data-auth-control=create-account]");
await page.fill("#signin-email", `hud-perf-${tag}@example.com`);
await page.fill("#signin-password", password);
await page.click("[data-auth-control=create-submit]");
await page.waitForSelector("canvas", { timeout: 25000 });
await page.waitForFunction(() => window.__glStats && window.__glStats.frame > 8, null, { timeout: 20000 });
const closed = await page.evaluate(() => ({ ...window.__glStats }));
await page.click("[data-ctl=rail-today]");
await page.waitForTimeout(500);
const open = await page.evaluate(() => ({ ...window.__glStats }));
await browser.close();

const lines = [
  "SwiftShader frame times are not meaningful. This table is draw calls and triangles only.",
  "The frame is DOM, so opening a card must not change the canvas draw.",
  "A second build with the frame flag off was not made. Card closed vs open is the parity check.",
  "Figures: 0. House guests are not spawned.",
  "",
  "| state | calls | triangles | meshes |",
  "| --- | --- | --- | --- |",
  `| card closed | ${closed.calls} | ${closed.triangles} | ${closed.meshes} |`,
  `| Today open | ${open.calls} | ${open.triangles} | ${open.meshes} |`,
  "",
  `parity: ${closed.calls === open.calls ? "calls match" : "CALLS DIFFER"}`,
];
const text = lines.join("\n");
writeFileSync("/opt/cursor/artifacts/hud/draw-calls.md", text);
console.log(text);
if (closed.calls !== open.calls) process.exit(1);

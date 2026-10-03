// v20 ground-plane check: forced house clock + weather via the existing QA overrides (sessionStorage
// "living-room-hour" and "living-room-sky", read by components/room/atmosphere.tsx; nothing to set in production).
// PW_CORE=… PW_CHROME=… OUT=/workspace/engineer-kb/v20/ node scripts/v20-grade-shots.mjs http://127.0.0.1:3920
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE);
const BASE = process.argv[2] || "http://127.0.0.1:3920";
const OUT = (process.env.OUT || new URL("../shots/", import.meta.url).pathname).replace(/\/?$/, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CASES = [
  { tag: "1300-sun", hour: 13, sky: "sun" },
  { tag: "1700-sun", hour: 17, sky: "sun" },
  { tag: "1700-rain", hour: 17, sky: "rain" },
  { tag: "1700-clouds", hour: 17, sky: "clouds" },
];
const VIEWS = [
  { tag: "desktop-1440x900", viewport: { width: 1440, height: 900 }, opts: {} },
  { tag: "phone-390x844", viewport: { width: 390, height: 844 }, opts: { deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const c of CASES) {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: v.viewport, ...v.opts });
    await ctx.addInitScript(({ hour, sky }) => { sessionStorage.setItem("living-room-hour", String(hour)); sessionStorage.setItem("living-room-sky", sky); }, c);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/room`, { waitUntil: "networkidle" });
    await sleep(10000);
    const file = `v20-ground-${c.tag}-${v.tag}.png`;
    await p.screenshot({ path: OUT + file });
    console.log("shot", file);
    await ctx.close();
  }
}
await browser.close();

// HUD screenshots. No email. Outside media is aborted.
//   BASE=http://127.0.0.1:3921 node scripts/hud/hud-shots.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/tmp/pw/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || "/opt/google/chrome/chrome";
const BASE = (process.env.BASE || "http://127.0.0.1:3921").replace(/\/$/, "");
const DIR = "/opt/cursor/artifacts/hud/shots";
mkdirSync(DIR, { recursive: true });
const tag = Math.random().toString(36).slice(2, 8);
const password = "correct-horse-1";
const sizes = [[360, 740], [390, 844], [390, 664], [768, 1024], [1280, 800], [1440, 900]];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function shot(page, width, height, role, state) {
  await page.screenshot({ path: `${DIR}/${width}x${height}-${role}-${state}.png` });
  console.log(`shot ${width}x${height} ${role} ${state}`);
}

async function signup(page, email) {
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-auth-control=create-account]", { timeout: 20000 });
  await page.click("[data-auth-control=create-account]");
  await page.fill("#signin-email", email);
  await page.fill("#signin-password", password);
  await page.click("[data-auth-control=create-submit]");
  await page.waitForSelector("[data-hud-frame]", { timeout: 25000 });
  await page.waitForSelector("canvas", { timeout: 20000 });
}

function abortOutside(page) {
  return page.route("**/*", (route) => {
    const url = route.request().url();
    if (/youtube|ytimg|spotify|open-meteo|17track|somafm|googleapis|gstatic/i.test(url)) return route.abort();
    return route.continue();
  });
}

try {
  const sign = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const signPage = await sign.newPage();
  await signPage.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await signPage.waitForSelector("[data-auth-control=sign-in]", { timeout: 20000 });
  for (const [width, height] of [[390, 844], [390, 664], [1440, 900]]) {
    await signPage.setViewportSize({ width, height });
    await shot(signPage, width, height, "none", "signin");
  }
  // The homepage polls /api/state, so networkidle never settles.
  await signPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await signPage.waitForSelector(".landing-title", { timeout: 20000 });
  for (const [width, height] of [[390, 844], [390, 664], [1440, 900]]) {
    await signPage.setViewportSize({ width, height });
    await shot(signPage, width, height, "none", "hero");
  }
  await signPage.goto(`${BASE}/no-such-page`, { waitUntil: "domcontentloaded" });
  await signPage.waitForSelector(".not-found-page h1", { timeout: 20000 });
  await shot(signPage, 1440, 900, "none", "404");
  await signPage.goto(`${BASE}/watch/not-a-real-code`, { waitUntil: "domcontentloaded" });
  await signPage.waitForSelector(".not-found-page h1", { timeout: 20000 });
  await shot(signPage, 1440, 900, "none", "watch-404");
  await sign.close();

  let ip = 40;
  const ownerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    extraHTTPHeaders: { "x-forwarded-for": `10.89.${ip}.1` },
  });
  const owner = await ownerCtx.newPage();
  await abortOutside(owner);
  await signup(owner, `hud-shot-${tag}@example.com`);

  for (const [width, height] of sizes) {
    await owner.setViewportSize({ width, height });
    await owner.waitForTimeout(250);
    await shot(owner, width, height, "owner", "default");
    await owner.click("[data-ctl=rail-today]");
    await owner.waitForSelector(".hudf-card");
    await shot(owner, width, height, "owner", "today");
    await owner.keyboard.press("Escape");
    await owner.click("[data-ctl=rail-radio]");
    await shot(owner, width, height, "owner", "radio-idle");
    await owner.click("[data-ctl=radio-play]");
    await owner.waitForTimeout(300);
    await shot(owner, width, height, "owner", "radio-playing");
    await owner.click("[data-ctl=radio-stop]");
    await owner.keyboard.press("Escape");
    await owner.click("[data-ctl=rail-tv]");
    await owner.click("[data-ctl=tv-chip-1]");
    await owner.waitForTimeout(250);
    await shot(owner, width, height, "owner", "tv-on");
    await owner.click("[data-ctl=tv-power]");
    await owner.waitForTimeout(250);
    await shot(owner, width, height, "owner", "tv-off");
    await owner.keyboard.press("Escape");
    await owner.click("[data-ctl=rail-sky]");
    await shot(owner, width, height, "owner", "sky");
    await owner.keyboard.press("Escape");
    await owner.click("[data-ctl=here-tab]");
    await shot(owner, width, height, "owner", "here");
    await owner.keyboard.press("Escape");
    await owner.click("[data-ctl=nav-people]");
    await shot(owner, width, height, "owner", "people");
    await owner.keyboard.press("Escape");
    await owner.click("[data-ctl=nav-you]");
    await shot(owner, width, height, "owner", "you");
    await owner.keyboard.press("Escape");
  }

  ip += 1;
  const minted = await owner.evaluate(async () => {
    const res = await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "watch" }) });
    const body = await res.json();
    return res.ok ? body.watchLink : "";
  });
  if (!minted) throw new Error("no watch link");
  const watchCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    extraHTTPHeaders: { "x-forwarded-for": `10.89.${ip}.2` },
  });
  const watcher = await watchCtx.newPage();
  await abortOutside(watcher);
  await watcher.goto(minted, { waitUntil: "domcontentloaded" });
  await watcher.waitForSelector("[data-watch-badge]", { timeout: 25000 });
  for (const [width, height] of sizes) {
    await watcher.setViewportSize({ width, height });
    await watcher.waitForTimeout(200);
    await shot(watcher, width, height, "watch", "default");
    await watcher.click("[data-ctl=rail-radio]");
    await shot(watcher, width, height, "watch", "radio-idle");
    await watcher.keyboard.press("Escape");
  }
  await owner.click("[data-ctl=rail-radio]");
  await owner.click("[data-ctl=radio-play]");
  await owner.keyboard.press("Escape");
  await watcher.waitForTimeout(600);
  for (const [width, height] of sizes) {
    await watcher.setViewportSize({ width, height });
    await watcher.waitForTimeout(200);
    await watcher.click("[data-ctl=rail-radio]");
    await shot(watcher, width, height, "watch", "radio-playing");
    await watcher.keyboard.press("Escape");
    await watcher.click("[data-ctl=rail-tv]");
    await shot(watcher, width, height, "watch", "tv");
    await watcher.keyboard.press("Escape");
    await watcher.click("[data-ctl=nav-you]");
    await shot(watcher, width, height, "watch", "you");
    await watcher.keyboard.press("Escape");
  }

  await owner.evaluate(() => localStorage.setItem("lr-hud-seen", "1"));
  await owner.clock.install();
  await owner.reload({ waitUntil: "domcontentloaded" });
  await owner.waitForSelector("[data-hud-frame]", { timeout: 25000 });
  await owner.clock.fastForward(9000);
  await owner.waitForSelector(".hudf.is-tucked", { timeout: 5000 });
  for (const [width, height] of sizes) {
    await owner.setViewportSize({ width, height });
    await shot(owner, width, height, "owner", "tucked");
  }
  await watcher.evaluate(() => localStorage.setItem("lr-hud-seen", "1"));
  await watcher.clock.install();
  await watcher.reload({ waitUntil: "domcontentloaded" });
  await watcher.waitForSelector("[data-watch-badge]", { timeout: 25000 });
  await watcher.clock.fastForward(9000);
  await watcher.waitForSelector(".hudf.is-tucked", { timeout: 5000 });
  for (const [width, height] of sizes) {
    await watcher.setViewportSize({ width, height });
    await shot(watcher, width, height, "watch", "tucked");
  }
  console.log("shots done");
} finally {
  await browser.close();
}

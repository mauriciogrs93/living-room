// HUD wiring. No email. Streams are aborted. Nothing outside this origin may load.
//   BASE=http://127.0.0.1:3921 PW_CORE=/tmp/pw/node_modules/playwright-core node scripts/hud/hud-wiring.mjs
import { createRequire } from "node:module";
import { mkdirSync, appendFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/tmp/pw/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || "/opt/google/chrome/chrome";
const BASE = (process.env.BASE || "http://127.0.0.1:3921").replace(/\/$/, "");
const OUT = process.env.HUD_OUT || "/tmp/hud-logs";
mkdirSync(OUT, { recursive: true });
const taps = [];
const results = [];
const check = (name, ok, detail = "") => {
  results.push(Boolean(ok));
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${String(detail).slice(0, 200)})` : ""}`;
  console.log(line);
  return ok;
};
const tag = Math.random().toString(36).slice(2, 8);
const password = "correct-horse-1";
let ipN = 20;

function contextOptions(width, height, touch) {
  ipN += 1;
  return {
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch && width < 720,
    deviceScaleFactor: 1,
    extraHTTPHeaders: { "x-forwarded-for": `10.88.${ipN}.${ipN + 3}` },
  };
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

function watchNetwork(page, bag) {
  page.on("request", (req) => {
    let host = "";
    try { host = new URL(req.url()).hostname; } catch { host = "bad"; }
    const local = host === "127.0.0.1" || host === "localhost";
    if (!local) bag.outside.push(req.url().slice(0, 120));
    if (/\/api\/(tap|dog|radio)/.test(req.url())) bag.api.push(`${req.method} ${req.url()}`);
  });
  return page.route("**/*", (route) => {
    const url = route.request().url();
    if (/youtube|ytimg|spotify|open-meteo|17track|somafm|googleapis|gstatic|fonts\.g/i.test(url)) {
      bag.aborted.push(url.slice(0, 120));
      return route.abort();
    }
    return route.continue();
  });
}

async function arm(context) {
  await context.addInitScript(() => {
    let n = 0;
    const geo = {
      getCurrentPosition() { n += 1; },
      watchPosition() { n += 1; return 0; },
      clearWatch() {},
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, get() { return geo; } });
    Object.defineProperty(window, "__geoCalls", { get() { return n; } });
  });
}

async function signup(page, email) {
  await page.goto(`${BASE}/room?debug=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-auth-control=create-account]", { timeout: 20000 });
  await page.click("[data-auth-control=create-account]");
  await page.fill("#signin-email", email);
  await page.fill("#signin-password", password);
  await page.click("[data-auth-control=create-submit]");
  await page.waitForSelector("[data-hud-frame]", { timeout: 25000 });
}

async function boxes(page) {
  return page.locator("[data-ctl]").evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hidden = style.display === "none" || style.visibility === "hidden" || rect.width < 1 || rect.height < 1;
      let inert = style.pointerEvents === "none";
      for (let node = el.parentElement; node && !inert; node = node.parentElement) {
        if (getComputedStyle(node).pointerEvents === "none") inert = true;
      }
      return { ctl: el.getAttribute("data-ctl") || "", w: rect.width, h: rect.height, x: rect.left, y: rect.top, hidden: hidden || inert };
    }),
  );
}

function overlaps(items) {
  const bad = [];
  const visible = items.filter((item) => !item.hidden);
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i];
      const b = visible[j];
      // The sheet scrim is a full-viewport layer under the chrome (z-index 30 vs 50).
      if (a.ctl === "sheet-scrim" || b.ctl === "sheet-scrim") continue;
      const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (x > 4 && y > 4) bad.push(`${a.ctl}~${b.ctl}`);
    }
  }
  return bad;
}

async function clickCtl(page, ctl, role, size) {
  const el = page.locator(`[data-ctl="${ctl}"]`).first();
  await el.click();
  taps.push({ role, ctl, size, at: Date.now() });
}

async function canvasBox(page) {
  const box = await page.locator("canvas").boundingBox();
  return box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
}

try {
  const sizes = [
    [390, 844, true, "phone"],
    [1440, 900, false, "desk"],
    [390, 664, true, "short"],
    [768, 1024, true, "tablet"],
  ];
  let watchLink = "";

  for (const [width, height, touch, name] of sizes) {
    const ctx = await browser.newContext(contextOptions(width, height, touch));
    await arm(ctx);
    const page = await ctx.newPage();
    const bag = { outside: [], aborted: [], api: [] };
    await watchNetwork(page, bag);
    const email = `hud-${name}-${tag}@example.com`;
    await signup(page, email);
    check(`${name}: frame is up`, (await page.locator(".hudf").count()) === 1);
    check(`${name}: owner title`, (await page.locator(".hudf-title b").innerText()) === "Your apartment");
    const loadedOutside = bag.outside.length;
    check(`${name}: no outside request on load`, loadedOutside === 0, bag.outside.join(" "));
    check(`${name}: no forbidden origin on first paint`, bag.aborted.length === 0, bag.aborted.join(" "));
    const stageOf = () => page.evaluate(() => {
      const stage = document.querySelector(".hudf-stage")?.getBoundingClientRect();
      return stage ? { x: Math.round(stage.x), y: Math.round(stage.y), w: Math.round(stage.width), h: Math.round(stage.height) } : null;
    });
    const stageBefore = await stageOf();
    const before = await canvasBox(page);
    await clickCtl(page, "rail-today", "owner", name);
    await page.waitForSelector(".hudf-card h2");
    const after = await canvasBox(page);
    const stageAfter = await stageOf();
    check(`${name}: opening Today does not resize the canvas`, Boolean(before && after && before.w === after.w && before.h === after.h), `${before?.w}x${before?.h} -> ${after?.w}x${after?.h}`);
    check(`${name}: stage rect is unchanged when Today opens`, Boolean(stageBefore && stageAfter && JSON.stringify(stageBefore) === JSON.stringify(stageAfter)), `${stageBefore?.w}x${stageBefore?.h} -> ${stageAfter?.w}x${stageAfter?.h}`);
    check(`${name}: stage is the full viewport`, Boolean(stageBefore && stageBefore.x === 0 && stageBefore.y === 0 && stageBefore.w === width && stageBefore.h === height), JSON.stringify(stageBefore));
    const sheet = (await page.locator(".hudf.is-sheet").count()) > 0;
    const scrim = (await page.locator("[data-ctl=sheet-scrim]").count()) > 0;
    const floating = (await page.locator(".hudf-card.is-float").count()) > 0;
    if (name === "desk") check("desk: card floats and has no scrim", floating && !sheet && !scrim);
    else check(`${name}: card is a sheet over a scrim`, sheet && scrim && !floating);
    if (name === "phone") {
      const scrimBg = await page.evaluate(() => getComputedStyle(document.querySelector("[data-ctl=sheet-scrim]")).backgroundColor);
      check("phone: scrim wash is rgba(43, 45, 49, 0.28)", scrimBg === "rgba(43, 45, 49, 0.28)", scrimBg);
    }
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    check(`${name}: Today moves focus into the card`, focused === "H2", focused || "");
    if (name !== "desk") {
      const gap = await page.evaluate(() => {
        const card = document.querySelector(".hudf-card")?.getBoundingClientRect();
        if (!card) return null;
        return { x: card.left + card.width / 2, y: card.top - 16 };
      });
      if (gap) await page.mouse.click(gap.x, gap.y);
      taps.push({ role: "owner", ctl: "sheet-scrim", size: name, at: Date.now() });
      check(`${name}: scrim closes the sheet`, (await page.locator(".hudf-card").count()) === 0);
      if (name === "phone") {
        await clickCtl(page, "here-tab", "owner", name);
        await page.waitForSelector(".hudf-card h2");
        check("phone: owner Here stays blank when nobody is home", (await page.locator("[data-here-empty]").count()) === 0);
        await page.keyboard.press("Escape");
      }
    } else {
      await page.keyboard.press("Escape");
      check("desk: Escape closes the card", (await page.locator(".hudf-card").count()) === 0);
    }

    if (name === "phone") {
      await clickCtl(page, "rail-radio", "owner", name);
      await clickCtl(page, "radio-play", "owner", name);
      await page.waitForTimeout(400);
      check("phone: Play calls the radio route", bag.api.some((line) => line.includes("/api/radio")));
      await clickCtl(page, "radio-stop", "owner", name);
      await page.keyboard.press("Escape");
      await clickCtl(page, "rail-tv", "owner", name);
      await clickCtl(page, "tv-chip-3", "owner", name);
      await page.waitForTimeout(300);
      check("phone: a channel chip calls tap", bag.api.some((line) => line.includes("/api/tap")));
      const canvasLive = await canvasBox(page);
      const stageLive = await stageOf();
      check("phone: no watch iframe before Watch live", (await page.locator("iframe.hudf-watch").count()) === 0);
      await page.waitForSelector("[data-ctl=tv-watch]", { timeout: 8000 });
      const sheetHits = await page.evaluate(() => {
        function topCtl(node) {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit?.closest?.("[data-ctl]")?.getAttribute("data-ctl") || "";
        }
        const stolen = [...document.querySelectorAll(".hudf-rail [data-ctl]")].flatMap((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return [];
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const ctl = hit?.closest?.("[data-ctl]")?.getAttribute("data-ctl") || "";
          return ctl.startsWith("rail-") || hit?.closest?.(".hudf-rail") ? [ctl || "rail"] : [];
        });
        const missed = ["tv-watch", "card-close", "tv-power", "tv-chip-3"].flatMap((id) => {
          const node = document.querySelector(`[data-ctl="${id}"]`);
          if (!node) return [`${id}:missing`];
          const ctl = topCtl(node);
          return ctl === id ? [] : [`${id}->${ctl || "none"}`];
        });
        return { stolen, missed };
      });
      check("phone: TV sheet controls win taps over the rail", sheetHits.stolen.length === 0 && sheetHits.missed.length === 0, [...sheetHits.stolen, ...sheetHits.missed].join(" "));
      await clickCtl(page, "tv-watch", "owner", name);
      await page.waitForSelector("iframe.hudf-watch", { timeout: 4000 });
      const src = await page.locator("iframe.hudf-watch").getAttribute("src");
      const pageOrigin = new URL(page.url()).origin;
      check("phone: Watch live uses the nocookie host", Boolean(src && src.startsWith("https://www.youtube-nocookie.com/embed/") && src.includes("enablejsapi=1") && src.includes(`origin=${encodeURIComponent(pageOrigin)}`) && !src.includes("ytimg") && !src.includes("www.youtube.com/") && !src.includes("mute=1")), src || "");
      const canvasHeld = await canvasBox(page);
      const stageHeld = await stageOf();
      check("phone: Watch live does not resize the canvas", Boolean(canvasLive && canvasHeld && canvasLive.w === canvasHeld.w && canvasLive.h === canvasHeld.h), `${canvasLive?.w}x${canvasLive?.h} -> ${canvasHeld?.w}x${canvasHeld?.h}`);
      check("phone: Watch live does not move the stage", Boolean(stageLive && stageHeld && JSON.stringify(stageLive) === JSON.stringify(stageHeld)));
      await clickCtl(page, "card-close", "owner", name);
      check("phone: Close removes the watch iframe", (await page.locator("iframe.hudf-watch").count()) === 0);
      const railBack = await page.evaluate(() => {
        const node = document.querySelector("[data-ctl=rail-tv]");
        if (!node) return "";
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit?.closest?.("[data-ctl]")?.getAttribute("data-ctl") || "";
      });
      check("phone: rail takes taps again after the TV sheet closes", railBack === "rail-tv", railBack);
      const minted = await page.evaluate(async () => {
        const res = await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "watch" }) });
        const body = await res.json();
        return { ok: res.ok, link: typeof body.watchLink === "string" ? body.watchLink : "" };
      });
      check("phone: owner can mint a watch link", minted.ok && minted.link.includes("#watch="));
      watchLink = minted.link;
      await clickCtl(page, "nav-you", "owner", name);
      check("phone: You offers Change password and sign out", (await page.locator("[data-ctl=you-set-password]").innerText()) === "Change password" && (await page.locator("[data-ctl=you-signout]").count()) === 1);
    }
    if (name === "short") {
      await clickCtl(page, "rail-tv", "owner", name);
      check("short: channel chips are one swipe row", (await page.locator(".hudf-chips.is-snap").count()) === 1);
    }
    const measured = await boxes(page);
    const tiny = measured.filter((item) => !item.hidden && (item.w < 44 || item.h < 44));
    check(`${name}: visible controls are at least 44px`, tiny.length === 0, tiny.map((item) => `${item.ctl}:${Math.round(item.w)}x${Math.round(item.h)}`).join(" "));
    const piled = overlaps(measured);
    check(`${name}: visible controls do not overlap`, piled.length === 0, piled.slice(0, 6).join(" "));
    const geo = await page.evaluate(() => window.__geoCalls || 0);
    check(`${name}: geolocation was not called`, geo === 0, String(geo));
    const body = await page.locator("body").innerText();
    check(`${name}: no video-site copy`, !/youtube|watch live|°/i.test(body));
    await ctx.close();
  }

  check("a watch link was minted", watchLink.startsWith(BASE));
  const watchCtx = await browser.newContext(contextOptions(390, 844, true));
  await arm(watchCtx);
  const watcher = await watchCtx.newPage();
  const watchBag = { outside: [], aborted: [], api: [] };
  await watchNetwork(watcher, watchBag);
  const apiBefore = () => watchBag.api.length;
  await watcher.goto(watchLink.includes("debug=1") ? watchLink : watchLink.replace("/room#", "/room?debug=1#"), { waitUntil: "domcontentloaded" });
  await watcher.waitForSelector("[data-watch-badge]", { timeout: 25000 });
  check("watcher: title is The apartment", (await watcher.locator(".hudf-title b").innerText()) === "The apartment");
  check("watcher: Invite is not in the nav", (await watcher.locator("[data-ctl=nav-invite]").count()) === 0);
  check("watcher: no outside request on load", watchBag.outside.length === 0, watchBag.outside.join(" "));
  await watcher.waitForFunction(() => window.__anchors && window.__anchors["object:lamp"], null, { timeout: 20000 });
  const beforeLamp = apiBefore();
  const lamp = await watcher.evaluate(() => {
    const point = window.__anchors["object:lamp"];
    const root = document.querySelector(".room-root").getBoundingClientRect();
    return { x: root.left + point.x, y: root.top + point.y };
  });
  await watcher.mouse.click(lamp.x, lamp.y);
  await watcher.waitForSelector(".hudf-toast", { timeout: 4000 }).catch(() => null);
  const toast = (await watcher.locator(".hudf-toast").count()) ? await watcher.locator(".hudf-toast").innerText() : "";
  check("watcher: lamp shows the owner-only toast", toast === "Only the owner can change things here.", toast);
  check("watcher: lamp sends no tap or dog request", watchBag.api.length === beforeLamp, watchBag.api.slice(beforeLamp).join(" "));
  await watcher.waitForSelector(".hudf-toast", { state: "detached", timeout: 4000 }).catch(() => null);
  const beforeDoor = apiBefore();
  const door = await watcher.evaluate(() => {
    const point = window.__anchors["object:door"];
    const root = document.querySelector(".room-root").getBoundingClientRect();
    return point ? { x: root.left + point.x, y: root.top + point.y } : null;
  });
  const hit = door
    ? await watcher.evaluate((point) => {
        const el = document.elementFromPoint(point.x, point.y);
        return el ? `${el.tagName}.${el.getAttribute("data-ctl") || el.className}`.slice(0, 80) : "none";
      }, door)
    : "no-anchor";
  if (door) await watcher.mouse.click(door.x, door.y);
  await watcher.waitForTimeout(400);
  const hereTitle = (await watcher.locator(".hudf-card h2").count()) ? await watcher.locator(".hudf-card h2").innerText() : "";
  check("watcher: the door opens Here", hereTitle === "Here", `${hereTitle} @ ${hit}`);
  const hereNames = await watcher.locator("[data-ctl=here-name]").count();
  const hereEmpty = (await watcher.locator("[data-here-empty]").count()) ? await watcher.locator("[data-here-empty]").innerText() : "";
  if (hereNames === 0) check("watcher: an empty Here says no one's home", hereEmpty === "No one's home right now.", hereEmpty);
  else check("watcher: Here drops the empty line once someone is home", hereEmpty === "", hereEmpty);
  check("watcher: the door does not toast", (await watcher.locator(".hudf-toast").count()) === 0);
  check("watcher: the door sends no request", watchBag.api.length === beforeDoor);
  await watcher.keyboard.press("Escape");
  await clickCtl(watcher, "nav-you", "watch", "phone");
  check("watcher: You says they are watching and offers Leave", (await watcher.locator(".hudf-card").innerText()).includes("You're watching") && (await watcher.locator("[data-ctl=you-leave]").count()) === 1);
  const soundLabel = await watcher.locator("[data-ctl=room-sound]").innerText();
  check("watcher: Room sound stays labeled and shows on or off", soundLabel.includes("Room sound") && !soundLabel.includes("Unmute") && /\b(On|Off)\b/.test(soundLabel), soundLabel);
  const zoneText = await watcher.locator("[data-zone-pill]").innerText();
  const titleText = await watcher.locator("[data-title-pill]").innerText();
  check("watcher: phone zone pill is ET and neither pill ellipsizes", zoneText.startsWith("ET") && !zoneText.includes("Eastern Time") && !zoneText.endsWith("…") && !titleText.endsWith("…") && titleText.endsWith("apartment"), `${titleText} | ${zoneText}`);
  await watcher.keyboard.press("Escape");
  const beforeStation = apiBefore();
  await clickCtl(watcher, "rail-radio", "watch", "phone");
  await clickCtl(watcher, "radio-row-watch-0", "watch", "phone");
  await watcher.waitForSelector(".hudf-toast", { timeout: 4000 }).catch(() => null);
  const stationToast = (await watcher.locator(".hudf-toast").count()) ? await watcher.locator(".hudf-toast").innerText() : "";
  check("watcher: a station row says only the owner can change it", stationToast === "Only the owner can change the station.", stationToast);
  check("watcher: a station row sends no radio request", !watchBag.api.slice(beforeStation).some((line) => line.includes("/api/radio")), watchBag.api.slice(beforeStation).join(" "));
  await watcher.keyboard.press("Escape");
  const beforeChannel = apiBefore();
  await clickCtl(watcher, "rail-tv", "watch", "phone");
  await clickCtl(watcher, "tv-chip-watch-1", "watch", "phone");
  await watcher.waitForSelector(".hudf-toast", { timeout: 4000 }).catch(() => null);
  const channelToast = (await watcher.locator(".hudf-toast").count()) ? await watcher.locator(".hudf-toast").innerText() : "";
  check("watcher: a channel pill says only the owner can change it", channelToast === "Only the owner can change the channel.", channelToast);
  check("watcher: a channel pill sends no tap", !watchBag.api.slice(beforeChannel).some((line) => line.includes("/api/tap")), watchBag.api.slice(beforeChannel).join(" "));
  if ((await watcher.locator("[data-ctl=tv-watch]").count()) === 1) {
    await clickCtl(watcher, "tv-watch", "watch", "phone");
    await watcher.waitForSelector("iframe.hudf-watch", { timeout: 4000 });
    const liveSrc = await watcher.locator("iframe.hudf-watch").getAttribute("src");
    await clickCtl(watcher, "nav-you", "watch", "phone");
    for (let i = 0; i < 3; i += 1) await clickCtl(watcher, "room-sound", "watch", "phone");
    const heldSrc = await watcher.locator("iframe.hudf-watch").getAttribute("src");
    check("watcher: Room sound toggles leave the player src unchanged", Boolean(liveSrc && heldSrc === liveSrc && (await watcher.locator("iframe.hudf-watch").count()) === 1), heldSrc || "");
  } else {
    check("watcher: Room sound toggles leave the player src unchanged", false, "tv-watch missing");
  }
  const geoW = await watcher.evaluate(() => window.__geoCalls || 0);
  check("watcher: geolocation was not called", geoW === 0);
  await watchCtx.close();

  const tuckCtx = await browser.newContext(contextOptions(1440, 900, false));
  await arm(tuckCtx);
  const tuck = await tuckCtx.newPage();
  await tuck.goto(`${BASE}/room?debug=1`, { waitUntil: "domcontentloaded" });
  await tuck.waitForSelector("[data-auth-control=create-account]");
  await tuck.evaluate(() => localStorage.setItem("lr-hud-seen", "1"));
  await tuck.clock.install();
  await tuck.click("[data-auth-control=create-account]");
  await tuck.fill("#signin-email", `hud-tuck-${tag}@example.com`);
  await tuck.fill("#signin-password", password);
  await tuck.click("[data-auth-control=create-submit]");
  await tuck.waitForSelector("[data-hud-frame]", { timeout: 25000 });
  check("first paint is not tucked", (await tuck.locator(".hudf.is-tucked").count()) === 0);
  await tuck.clock.fastForward(9000);
  await tuck.waitForSelector(".hudf.is-tucked", { timeout: 4000 });
  check("the frame tucks after 8s once the room has been seen", (await tuck.locator(".hudf.is-tucked").count()) === 1);
  await tuck.keyboard.press("Escape");
  check("Escape untucks", (await tuck.locator(".hudf.is-tucked").count()) === 0);
  await tuckCtx.close();

  const fresh = await browser.newContext(contextOptions(390, 844, true));
  const freshPage = await fresh.newPage();
  await freshPage.goto(`${BASE}/room?debug=1`, { waitUntil: "domcontentloaded" });
  await freshPage.waitForSelector("[data-auth-control=create-account]");
  await freshPage.clock.install();
  await freshPage.click("[data-auth-control=create-account]");
  await freshPage.fill("#signin-email", `hud-first-${tag}@example.com`);
  await freshPage.fill("#signin-password", password);
  await freshPage.click("[data-auth-control=create-submit]");
  await freshPage.waitForSelector("[data-hud-frame]", { timeout: 25000 });
  await freshPage.clock.fastForward(9000);
  check("a first visit does not tuck", (await freshPage.locator(".hudf.is-tucked").count()) === 0);
  await fresh.close();
} finally {
  await browser.close();
  appendFileSync(`${OUT}/taps.jsonl`, taps.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);

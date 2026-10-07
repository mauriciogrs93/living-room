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
let ipN = Number((process.hrtime.bigint() % 180n) + 60n);

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

async function assertCatalog(page, role, size) {
  await clickCtl(page, "rail-radio", role, size);
  await page.waitForSelector(".hudf-list [data-ctl^=radio-row]", { timeout: 8000 });
  const radio = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".hudf-list [data-ctl^=radio-row]")];
    const line = document.querySelector("[data-owner-line=station]");
    return {
      count: rows.length,
      buttons: rows.filter((row) => row.tagName === "BUTTON").length,
      disabled: rows.filter((row) => row.getAttribute("aria-disabled") === "true").length,
      line: line ? line.textContent : "",
      cursor: rows[0] ? getComputedStyle(rows[0]).cursor : "",
    };
  });
  if (role === "watch") {
    check(`${size}: watcher sees the station rows`, radio.count > 0 && radio.buttons === 0 && radio.disabled === radio.count, JSON.stringify(radio));
    check(`${size}: watcher station line matches the phone`, radio.line === "Only the owner can change the station.", radio.line);
    check(`${size}: watcher station rows are not pressable`, radio.cursor === "default", radio.cursor);
  } else {
    check(`${size}: owner can press the station rows`, radio.count > 0 && radio.buttons === radio.count && radio.disabled === 0 && radio.line === "", JSON.stringify(radio));
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector(".hudf-card", { state: "detached", timeout: 4000 }).catch(() => null);
  await clickCtl(page, "rail-tv", role, size);
  await page.waitForSelector(".hudf-chips [data-ctl^=tv-chip]", { timeout: 8000 });
  const tv = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".hudf-chips [data-ctl^=tv-chip]")];
    const line = document.querySelector("[data-owner-line=channel]");
    const sample = chips[0];
    if (sample) sample.classList.add("is-on");
    const onFill = sample ? getComputedStyle(sample).backgroundColor : "";
    if (sample) sample.classList.remove("is-on");
    const plainFill = sample ? getComputedStyle(sample).backgroundColor : "";
    return {
      count: chips.length,
      buttons: chips.filter((chip) => chip.tagName === "BUTTON").length,
      disabled: chips.filter((chip) => chip.getAttribute("aria-disabled") === "true").length,
      line: line ? line.textContent : "",
      cursor: sample ? getComputedStyle(sample).cursor : "",
      onFill,
      plainFill,
    };
  });
  if (role === "watch") {
    check(`${size}: watcher sees the TV chips`, tv.count >= 5 && tv.buttons === 0 && tv.disabled === tv.count, JSON.stringify(tv));
    check(`${size}: watcher channel line matches the phone`, tv.line === "Only the owner can change the channel.", tv.line);
    check(`${size}: watcher chips stay ink or plain with no press`, tv.cursor === "default" && tv.onFill === "rgb(43, 45, 49)" && tv.plainFill === "rgb(250, 248, 243)", JSON.stringify(tv));
  } else {
    check(`${size}: owner can press the TV chips`, tv.count >= 5 && tv.buttons === tv.count && tv.disabled === 0 && tv.line === "", JSON.stringify(tv));
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector(".hudf-card", { state: "detached", timeout: 4000 }).catch(() => null);
}

async function stackRows(page, size) {
  await page.evaluate(() => {
    const layer = document.querySelector("[data-name-tags]");
    if (!layer) return;
    layer.querySelector("[data-stack-test]")?.remove();
    layer.querySelector("[data-name-stack]")?.remove();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agent-tag";
    btn.dataset.nameTag = "";
    btn.dataset.stackTest = "";
    btn.dataset.stackIds = "agent-ada\nagent-bea";
    btn.dataset.stackNames = "Ada\nBea";
    btn.dataset.stackColors = "#6fa35a\n#3c6d94";
    btn.dataset.tagKey = "stack-test";
    btn.setAttribute("aria-label", "2 more: Ada, Bea");
    btn.textContent = "+2";
    btn.style.left = "80px";
    btn.style.top = "420px";
    btn.style.pointerEvents = "auto";
    layer.append(btn);
    btn.click();
  });
  await page.waitForSelector("[data-stack-pick]", { timeout: 4000 });
  const names = await page.locator("[data-stack-pick]").evaluateAll((rows) =>
    rows.map((row) => ({
      name: row.getAttribute("aria-label") || "",
      text: row.querySelector("span")?.textContent || "",
      h: row.getBoundingClientRect().height,
      w: row.getBoundingClientRect().width,
      tag: row.tagName,
      chevron: row.querySelector("b")?.textContent || "",
      links: row.querySelectorAll("a").length,
    })),
  );
  check(`${size}: each stack row is a full-width name button`, names.length === 2 && names.every((row) => row.tag === "BUTTON" && row.h >= 44 && row.w > 100 && row.name === row.text && row.chevron === "›" && row.links === 0 && !/view|open/i.test(row.name)), JSON.stringify(names));
  for (const row of names) {
    await page.locator(`[data-stack-pick]`).filter({ hasText: row.name }).first().click();
    await page.waitForSelector(".hudf-card h2", { timeout: 4000 });
    const title = await page.locator(".hudf-card h2").innerText();
    check(`${size}: ${row.name} opens that agent's sheet`, title === "Activity", title);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".hudf-card", { state: "detached", timeout: 4000 }).catch(() => null);
    if ((await page.locator("[data-name-stack]").count()) === 0) {
      await page.locator("[data-tag-key='stack-test']").click();
      await page.waitForSelector("[data-stack-pick]", { timeout: 4000 });
    }
  }
  await page.locator("[data-stack-close]").click();
  const back = await page.evaluate(() => document.activeElement?.getAttribute("data-tag-key") || "");
  check(`${size}: × closes the list and returns to the pill`, (await page.locator("[data-name-stack]").count()) === 0 && back === "stack-test", back);
  await page.evaluate(() => document.querySelector("[data-stack-test]")?.remove());
}

async function stackCrowd(page, size, count) {
  const report = await page.evaluate((count) => {
    const layer = document.querySelector("[data-name-tags]");
    if (!layer) return { err: "no-layer" };
    document.querySelector("[data-stack-test]")?.remove();
    document.querySelector("[data-name-stack]")?.remove();
    const all = ["Ada", "Bea", "Cid", "Dee", "Eve", "Fay", "Gil", "Hua", "Ian", "Jo"];
    const names = all.slice(0, count);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agent-tag";
    btn.dataset.nameTag = "";
    btn.dataset.stackTest = "";
    btn.dataset.stackIds = names.map((_, index) => `agent-${index}`).join("\n");
    btn.dataset.stackNames = names.join("\n");
    btn.dataset.stackColors = names.map(() => "#6fa35a").join("\n");
    btn.dataset.tagKey = "stack-crowd";
    btn.setAttribute("aria-label", `${count} more: ${names.join(", ")}`);
    btn.textContent = `+${count}`;
    btn.style.left = "48px";
    btn.style.top = "360px";
    btn.style.pointerEvents = "auto";
    layer.append(btn);
    btn.click();
    const menu = document.querySelector("[data-name-stack]");
    const scroll = menu?.querySelector(".tag-stack-scroll");
    const rows = [...(menu?.querySelectorAll("[data-stack-pick]") || [])];
    if (!menu || !scroll) return { err: "no-menu", count: rows.length };
    const menuBox = menu.getBoundingClientRect();
    const pill = btn.getBoundingClientRect();
    const port = scroll.getBoundingClientRect();
    const obstacles = [".hudf-here", ".hudf-nav", ".hudf-toast", ".hudf-strip.is-chat", ".hudf-strip.is-task"].flatMap((sel) => {
      const node = document.querySelector(sel);
      if (!node) return [];
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return [];
      return [box];
    });
    const overlap = obstacles.some((box) => menuBox.left < box.right && menuBox.right > box.left && menuBox.top < box.bottom && menuBox.bottom > box.top);
    const hits = rows.map((row) => {
      row.scrollIntoView({ block: "center" });
      const rect = row.getBoundingClientRect();
      const y = Math.min(port.bottom - 4, Math.max(port.top + 4, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(rect.left + 28, y);
      return {
        name: row.querySelector("span")?.textContent || "",
        label: row.getAttribute("aria-label") || "",
        h: Math.round(rect.height),
        ok: hit === row || (hit instanceof Node && row.contains(hit)),
      };
    });
    return {
      count: rows.length,
      hits,
      above: Math.abs(menuBox.bottom - pill.top) <= 2,
      inView: menuBox.top >= 0 && menuBox.left >= 0 && menuBox.right <= window.innerWidth && menuBox.bottom <= window.innerHeight,
      overlap,
      cap: Math.round(parseFloat(menu.style.maxHeight) || 0),
      overflow: getComputedStyle(scroll).overflowY,
      scrollbar: getComputedStyle(scroll).scrollbarWidth,
      z: getComputedStyle(menu).zIndex,
      links: menu.querySelectorAll("a").length,
    };
  }, count);
  const rowsOk = Array.isArray(report.hits) && report.hits.length === count && report.hits.every((row) => row.ok && row.h >= 44 && row.name === row.label);
  check(`${size}: ${count} stack rows scroll, hit, and stay in view`, report.count === count && report.above && report.inView && !report.overlap && report.overflow === "auto" && report.scrollbar === "none" && Number(report.z) > 60 && report.links === 0 && rowsOk, JSON.stringify(report).slice(0, 500));
  await page.keyboard.press("Escape");
  const back = await page.evaluate(() => ({
    menu: document.querySelectorAll("[data-name-stack]").length,
    focus: document.activeElement?.getAttribute("data-tag-key") || "",
  }));
  check(`${size}: Esc closes the crowd list and returns to the pill`, back.menu === 0 && back.focus === "stack-crowd", JSON.stringify(back));
  await page.evaluate(() => document.querySelector("[data-stack-test]")?.remove());
}

async function missBesideTag(page, role, size, anchorKey, expect) {
  await page.waitForFunction((key) => window.__anchors && window.__anchors[key], anchorKey, { timeout: 20000 });
  const point = await page.evaluate((key) => {
    const anchor = window.__anchors[key];
    const root = document.querySelector(".room-root").getBoundingClientRect();
    const layer = document.querySelector("[data-name-tags]");
    layer?.querySelector("[data-miss-probe]")?.remove();
    const probe = document.createElement("button");
    probe.type = "button";
    probe.className = "agent-tag";
    probe.dataset.nameTag = "";
    probe.dataset.missProbe = "";
    probe.textContent = "Beside";
    probe.style.pointerEvents = "auto";
    probe.style.left = `${anchor.x - 48}px`;
    probe.style.top = `${anchor.y - 48}px`;
    layer.append(probe);
    const tag = probe.getBoundingClientRect();
    const x = root.left + anchor.x;
    const y = root.top + anchor.y;
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      under: tag.bottom < y,
      canvas: hit?.tagName === "CANVAS",
      layer: getComputedStyle(layer).pointerEvents,
      pill: getComputedStyle(probe).pointerEvents,
    };
  }, anchorKey);
  check(`${size} ${role}: a miss beside a tag reaches the canvas`, point.canvas && point.under && point.layer === "none" && point.pill === "auto", JSON.stringify(point));
  await page.mouse.click(point.x, point.y);
  if (expect === "notice") {
    await page.waitForSelector(".hudf-toast", { timeout: 4000 }).catch(() => null);
    const toast = (await page.locator(".hudf-toast").count()) ? await page.locator(".hudf-toast").innerText() : "";
    check(`${size}: a watcher miss says only the owner can change this`, toast === "Only the owner can change this.", toast);
    await page.waitForSelector(".hudf-toast", { state: "detached", timeout: 4000 }).catch(() => null);
  } else {
    await page.waitForSelector(".hudf-card h2", { timeout: 4000 });
    const title = await page.locator(".hudf-card h2").innerText();
    check(`${size}: an owner miss opens the furniture card`, title.startsWith("TV"), title);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".hudf-card", { state: "detached", timeout: 4000 }).catch(() => null);
  }
  await page.evaluate(() => document.querySelector("[data-miss-probe]")?.remove());
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
  let deskWatchLink = "";

  for (const [width, height, touch, name] of sizes) {
    const ctx = await browser.newContext(contextOptions(width, height, touch));
    await arm(ctx);
    const page = await ctx.newPage();
    const bag = { outside: [], aborted: [], api: [] };
    await watchNetwork(page, bag);
    const email = `hud-${name}-${tag}@example.com`;
    await signup(page, email);
    check(`${name}: frame is up`, (await page.locator(".hudf").count()) === 1);
    if (name === "phone" || name === "desk") {
      const zoomLoad = await page.evaluate(() => document.documentElement.dataset.roomZoom || "");
      await page.waitForTimeout(700);
      const zoomSettled = await page.evaluate(() => document.documentElement.dataset.roomZoom || "");
      check(`${name}: roomZoom is stable from load`, zoomLoad !== "" && zoomLoad === zoomSettled, `${zoomLoad} -> ${zoomSettled}`);
      for (const ctl of ["rail-tv", "rail-radio", "nav-you"]) {
        const dot = await page.evaluate((id) => {
          const btn = document.querySelector(`[data-ctl="${id}"]`);
          btn.click();
          const after = document.querySelector(".hudf-dot");
          const style = after ? getComputedStyle(after) : null;
          const box = after ? after.getBoundingClientRect() : null;
          return {
            present: Boolean(after),
            visibility: style?.visibility || "",
            display: style?.display || "",
            w: box ? Math.round(box.width) : 0,
          };
        }, ctl);
        taps.push({ role: "owner", ctl, size: name, at: Date.now() });
        const hidden = !dot.present || dot.visibility === "hidden" || dot.display === "none" || dot.w === 0;
        check(`${name}: ${ctl} hides the rail dot at t=0`, hidden, JSON.stringify(dot));
        await page.waitForSelector(".hudf-card", { timeout: 8000 });
        const zoomOpen = await page.evaluate(() => document.documentElement.dataset.roomZoom || "");
        check(`${name}: roomZoom stays ${zoomLoad} while ${ctl} is open`, zoomOpen === zoomLoad, `${zoomLoad} -> ${zoomOpen}`);
        await page.keyboard.press("Escape");
        await page.waitForSelector(".hudf-card", { state: "detached", timeout: 4000 }).catch(() => null);
      }
      await assertCatalog(page, "owner", name);
      await stackRows(page, name);
      await stackCrowd(page, name, 9);
      await stackCrowd(page, name, 8);
      const away = await page.evaluate(() => {
        const layer = document.querySelector("[data-name-tags]");
        if (!layer) return { err: "no-layer" };
        document.querySelector("[data-name-stack]")?.remove();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "agent-tag";
        btn.dataset.nameTag = "";
        btn.dataset.stackIds = "agent-ada\nagent-bea";
        btn.dataset.stackNames = "Ada\nBea";
        btn.dataset.stackIdle = "0\n1";
        btn.dataset.stackColors = "#6fa35a\n#3c6d94";
        btn.dataset.tagKey = "stack-away";
        btn.style.left = "48px";
        btn.style.top = "360px";
        layer.append(btn);
        btn.click();
        const row = document.querySelector("[data-stack-pick='agent-bea']");
        const text = row?.querySelector("span")?.textContent || "";
        return { text, label: row?.getAttribute("aria-label") || "", html: row?.querySelector("span")?.innerHTML || "" };
      });
      check(`${size}: an away stack row is plain text`, away.text === "Bea · Away" && away.label === "Bea · Away" && away.html === "Bea · Away", JSON.stringify(away));
      await page.click("[data-ctl=nav-activity]");
      const closed = await page.evaluate(() => document.querySelectorAll("[data-name-stack]").length);
      check(`${size}: opening Activity closes the +N list`, closed === 0, String(closed));
      await page.keyboard.press("Escape");
      await page.waitForSelector(".hudf-card", { state: "detached", timeout: 4000 }).catch(() => null);
      await page.evaluate(() => document.querySelector("[data-tag-key='stack-away']")?.remove());
      await missBesideTag(page, "owner", name, "object:tv", "card");
    }
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
    if (name === "desk") {
      check("desk: card floats and has no scrim", floating && !sheet && !scrim);
      const top = await page.evaluate(() => {
        const el = document.querySelector(".hudf-top");
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          w: Math.round(rect.width),
          right: Math.round(rect.right),
          radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
          vw: window.innerWidth,
        };
      });
      check(
        "desk: top bar is a compact floating pill",
        Boolean(top && top.w < top.vw * 0.6 && top.right < top.vw - 200 && top.radius >= 24),
        JSON.stringify(top),
      );
    }
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
        const underTag = await page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          if (!canvas) return { ok: false, pill: "", under: "no-canvas" };
          const rect = canvas.getBoundingClientRect();
          const probe = document.createElement("button");
          probe.type = "button";
          probe.className = "agent-tag";
          probe.dataset.nameTag = "";
          probe.textContent = "perf-test-09";
          probe.style.position = "fixed";
          probe.style.left = `${rect.left + rect.width / 2 - 66}px`;
          probe.style.top = `${rect.top + rect.height / 2 - 14}px`;
          probe.style.width = "132px";
          probe.style.height = "28px";
          document.body.appendChild(probe);
          const box = probe.getBoundingClientRect();
          const pill = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          const under = document.elementFromPoint(box.left + box.width / 2, box.bottom + 6);
          probe.remove();
          return {
            ok: Boolean(pill?.closest("[data-name-tag]")) && under?.tagName === "CANVAS",
            pill: pill?.tagName || "",
            under: under?.tagName || "",
          };
        });
        check("phone: a tap under a name tag reaches the canvas", underTag.ok, `${underTag.pill} / ${underTag.under}`);
        await clickCtl(page, "here-tab", "owner", name);
        await page.waitForSelector(".hudf-card h2");
        check("phone: owner Here stays blank when nobody is home", (await page.locator("[data-here-empty]").count()) === 0);
        await page.keyboard.press("Escape");
      }
    } else {
      await page.keyboard.press("Escape");
      check("desk: Escape closes the card", (await page.locator(".hudf-card").count()) === 0);
      check("desk: the Here tab is gone", (await page.locator("[data-ctl=here-tab]").count()) === 0);
      const stack = await page.evaluate(() => {
        const layer = document.querySelector("[data-name-tags]");
        if (!layer) return { opened: false, labels: [], links: -1 };
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "agent-tag";
        btn.dataset.nameTag = "";
        btn.dataset.stackIds = "agent-ada\nagent-bea";
        btn.dataset.stackNames = "Ada\nBea";
        btn.dataset.tagKey = "stack-test";
        btn.setAttribute("aria-label", "2 more: Ada, Bea");
        btn.textContent = "+2";
        btn.style.left = "420px";
        btn.style.top = "360px";
        layer.append(btn);
        btn.click();
        const menu = document.querySelector("[data-name-stack]");
        const labels = [...(menu?.querySelectorAll("[data-stack-pick] span") ?? [])].map((node) => node.textContent);
        const item = menu?.querySelector("button");
        return {
          opened: Boolean(menu),
          labels,
          links: menu ? menu.querySelectorAll("a").length : -1,
          label: btn.getAttribute("aria-label"),
          bg: menu ? getComputedStyle(menu).backgroundColor : "",
          ink: item ? getComputedStyle(item).color : "",
        };
      });
      check("desk: +N opens the names in that stack", stack.opened && stack.labels.join(",") === "Ada,Bea" && stack.links === 0 && stack.label === "2 more: Ada, Bea", JSON.stringify(stack));
      check("desk: the +N list is plaster with ink text", stack.bg === "rgb(247, 244, 238)" && stack.ink === "rgb(43, 45, 49)", `${stack.bg} / ${stack.ink}`);
      await page.keyboard.press("Escape");
      check("desk: Escape closes the stack list", (await page.locator("[data-name-stack]").count()) === 0);
      await page.evaluate(() => document.querySelector("[data-name-tags] button[data-stack-ids]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await page.locator("[data-stack-pick='agent-ada']").click();
      await page.waitForSelector(".hudf-card h2");
      check("desk: tapping a stacked name focuses that agent", (await page.locator(".hudf-card h2").innerText()) === "Activity");
      await page.keyboard.press("Escape");
      const tagFit = await page.evaluate(() => {
        const layer = document.querySelector("[data-name-tags]");
        if (!layer) return { ok: false, detail: "no-layer" };
        const probe = document.createElement("button");
        probe.type = "button";
        probe.className = "agent-tag";
        probe.dataset.nameTag = "";
        const span = document.createElement("span");
        span.textContent = "perf-test-04";
        probe.append(span);
        layer.append(probe);
        const style = getComputedStyle(span);
        const box = probe.getBoundingClientRect();
        const result = {
          ok: probe.scrollWidth <= probe.clientWidth && style.textOverflow !== "ellipsis" && span.textContent === "perf-test-04" && box.right <= window.innerWidth && box.bottom <= window.innerHeight && box.left >= 0 && box.top >= 0,
          sw: probe.scrollWidth,
          cw: probe.clientWidth,
          ellipsis: style.textOverflow,
          box: [Math.round(box.left), Math.round(box.top), Math.round(box.right), Math.round(box.bottom)],
        };
        probe.remove();
        const live = [...document.querySelectorAll("[data-name-tag]")].filter((node) => !node.hidden);
        const clipped = live.filter((node) => node.scrollWidth > node.clientWidth || (node.textContent || "").includes("…"));
        const stats = window.__tagLayout;
        return { ...result, clipped: clipped.map((node) => node.textContent), rate: stats && stats.frames ? stats.reads / stats.frames : 0, frames: stats?.frames || 0 };
      });
      check("desk: perf-test-04 is not truncated", tagFit.ok && tagFit.clipped.length === 0, JSON.stringify(tagFit));
      const layoutBefore = await page.evaluate(() => {
        const stats = window.__tagLayout;
        return stats ? { frames: stats.frames, reads: stats.reads } : { frames: 0, reads: 0 };
      });
      await page.waitForTimeout(1200);
      const layoutRate = await page.evaluate((before) => {
        const stats = window.__tagLayout;
        if (!stats) return -1;
        const frames = stats.frames - before.frames;
        if (frames < 1) return -1;
        return (stats.reads - before.reads) / frames;
      }, layoutBefore);
      check("desk: name-tag layout reads stay at or under 0.13 per frame", layoutRate >= 0 && layoutRate <= 0.13, layoutRate.toFixed(3));
    }

    if (name === "phone") {
      await clickCtl(page, "rail-radio", "owner", name);
      await clickCtl(page, "radio-play", "owner", name);
      await page.waitForSelector(".hudf-card .hudf-eq i", { timeout: 8000 });
      check("phone: Play calls the radio route", bag.api.some((line) => line.includes("/api/radio")));
      const eq = await page.evaluate(() => {
        const bar = document.querySelector(".hudf-card .hudf-eq i");
        if (!bar) return "missing";
        const style = getComputedStyle(bar);
        return `${style.animationName} ${style.animationPlayState}`;
      });
      check("phone: the radio card EQ animates while the station plays", eq.startsWith("hudf-eq") && eq.includes("running"), eq);
      await clickCtl(page, "radio-stop", "owner", name);
      await page.waitForSelector("[data-ctl=radio-play]", { timeout: 4000 });
      check("phone: stopping the radio removes the EQ", (await page.locator(".hudf-card .hudf-eq").count()) === 0);
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
      const railHid = await page.evaluate(() => {
        const rail = document.querySelector(".hudf-rail");
        const closeBtn = document.querySelector("[data-ctl=card-close]");
        const style = rail ? getComputedStyle(rail) : null;
        const box = closeBtn?.getBoundingClientRect();
        const beside = box ? document.elementFromPoint(Math.min(window.innerWidth - 2, box.right + 6), box.top + box.height / 2) : null;
        return {
          hidden: style?.visibility === "hidden",
          beside: beside?.closest?.(".hudf-rail") ? "rail" : beside?.getAttribute?.("data-ctl") || beside?.tagName || "",
          label: closeBtn?.getAttribute("aria-label") || "",
          text: closeBtn?.innerText || "",
        };
      });
      check("phone: the rail is hidden while the sheet is open", railHid.hidden && railHid.beside !== "rail", JSON.stringify(railHid));
      check("phone: the TV close control is named Close", railHid.label === "Close" && !railHid.text.includes("Close"), railHid.text);
      await clickCtl(page, "tv-watch", "owner", name);
      await page.waitForSelector("iframe.hudf-watch", { timeout: 4000 });
      const src = await page.locator("iframe.hudf-watch").getAttribute("src");
      const pageOrigin = new URL(page.url()).origin;
      check("phone: Watch live uses the nocookie host", Boolean(src && src.startsWith("https://www.youtube-nocookie.com/embed/") && src.includes("enablejsapi=1") && src.includes("mute=1") && src.includes(`origin=${encodeURIComponent(pageOrigin)}`) && !src.includes("ytimg") && !src.includes("www.youtube.com/")), src || "");
      await clickCtl(page, "nav-you", "owner", name);
      await clickCtl(page, "room-sound", "owner", name);
      const heldSrc = await page.locator("iframe.hudf-watch").getAttribute("src");
      check("phone: Room sound leaves the watch iframe in place", heldSrc === src && heldSrc?.includes("mute=1"), heldSrc || "");
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
      const mintedDesk = await page.evaluate(async () => {
        const res = await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "watch" }) });
        const body = await res.json();
        return typeof body.watchLink === "string" ? body.watchLink : "";
      });
      deskWatchLink = mintedDesk;
      await clickCtl(page, "nav-you", "owner", name);
      check("phone: You offers Change password and sign out", (await page.locator("[data-ctl=you-set-password]").innerText()) === "Change password" && (await page.locator("[data-ctl=you-signout]").count()) === 1);
      const ownerSound = await page.locator("[data-ctl=room-sound]").innerText();
      check("phone: owner Room sound shows On or Off", ownerSound.includes("Room sound") && !/Mute|Unmute/.test(ownerSound) && /\b(On|Off)\b/.test(ownerSound), ownerSound);
      const soundSize = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("[data-ctl=room-sound]")).fontSize));
      check("phone: Room sound label is at least 13px", soundSize >= 13, String(soundSize));
      await page.keyboard.press("Escape");
      await clickCtl(page, "rail-radio", "owner", name);
      if ((await page.locator(".hudf-card .hudf-eq").count()) === 0) {
        await clickCtl(page, "radio-play", "owner", name);
        await page.waitForSelector(".hudf-card .hudf-eq", { timeout: 8000 });
      }
      await page.keyboard.press("Escape");
      const moving = await page.evaluate(() => {
        const bar = document.querySelector("[data-rail-eq] i");
        return bar ? getComputedStyle(bar).animationPlayState : "missing";
      });
      check("phone: rail bars keep moving with the card closed", moving === "running", moving);
      await clickCtl(page, "nav-you", "owner", name);
      if ((await page.locator("[data-ctl=room-sound]").getAttribute("aria-checked")) === "true") {
        await clickCtl(page, "room-sound", "owner", name);
      }
      const pausedBars = await page.evaluate(() => {
        const eq = document.querySelector("[data-rail-eq]");
        const bar = eq?.querySelector("i");
        return `${eq?.className || "missing"} ${bar ? getComputedStyle(bar).animationPlayState : ""}`;
      });
      check("phone: rail bars pause when the room is muted", pausedBars.includes("is-paused") && pausedBars.includes("paused"), pausedBars);
      const csp = await page.evaluate(async () => {
        const res = await fetch(`${location.pathname}${location.search}`);
        return {
          report: res.headers.get("content-security-policy-report-only") || "",
          enforced: res.headers.get("content-security-policy") || "",
        };
      });
      check(
        "phone: report-only CSP allows the nocookie player",
        csp.report.includes("frame-src https://www.youtube-nocookie.com") && csp.report.includes("script-src 'self' 'unsafe-inline'") && csp.report.includes("connect-src 'self'") && !csp.enforced.includes("frame-src") && !csp.report.includes("*"),
        csp.report,
      );
      await page.keyboard.press("Escape");
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
  const deskWatch = await browser.newContext(contextOptions(1440, 900, false));
  await arm(deskWatch);
  const deskWatcher = await deskWatch.newPage();
  const deskBag = { outside: [], aborted: [], api: [] };
  await watchNetwork(deskWatcher, deskBag);
  const deskLink = deskWatchLink || watchLink;
  await deskWatcher.goto(deskLink.includes("debug=1") ? deskLink : deskLink.replace("/room#", "/room?debug=1#"), { waitUntil: "domcontentloaded" });
  await deskWatcher.waitForSelector("[data-watch-badge]", { timeout: 25000 });
  await missBesideTag(deskWatcher, "watch", "desk", "object:lamp", "notice");
  const beforeDesk = deskBag.api.length;
  await assertCatalog(deskWatcher, "watch", "desk");
  check("desk watcher: rows and chips send no radio or tap", !deskBag.api.slice(beforeDesk).some((line) => line.includes("/api/radio") || line.includes("/api/tap")), deskBag.api.slice(beforeDesk).join(" "));
  await deskWatch.close();
  const watchCtx = await browser.newContext(contextOptions(390, 844, true));
  await arm(watchCtx);
  const watcher = await watchCtx.newPage();
  const watchBag = { outside: [], aborted: [], api: [] };
  await watchNetwork(watcher, watchBag);
  const apiBefore = () => watchBag.api.length;
  await watcher.goto(watchLink.includes("debug=1") ? watchLink : watchLink.replace("/room#", "/room?debug=1#"), { waitUntil: "domcontentloaded" });
  await watcher.waitForSelector("[data-watch-badge]", { timeout: 25000 });
  await missBesideTag(watcher, "watch", "phone", "object:lamp", "notice");
  check("watcher: title is The apartment", (await watcher.locator(".hudf-title b").innerText()) === "The apartment");
  check("watcher: the header pill says Watching", (await watcher.locator(".hudf-badge[data-watch-badge]").innerText()).trim() === "Watching");
  await clickCtl(watcher, "rail-radio", "watch", "phone");
  await watcher.waitForSelector("[data-ctl=radio-mute]", { timeout: 8000 });
  const muteBox = await watcher.locator("[data-ctl=radio-mute]").boundingBox();
  check("phone: radio mute is at least 44px", Boolean(muteBox && muteBox.height >= 44 && muteBox.height <= 48), muteBox ? `${Math.round(muteBox.width)}x${Math.round(muteBox.height)}` : "missing");
  const eqBox = await watcher.locator(".hudf-now .hudf-eq").boundingBox();
  check("phone: the playing meter is about 14px tall", Boolean(eqBox && eqBox.height >= 12 && eqBox.height <= 16), eqBox ? String(Math.round(eqBox.height)) : "missing");
  await watcher.keyboard.press("Escape");
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
  check("watcher: lamp shows the owner-only toast", toast === "Only the owner can change this.", toast);
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
  check("watcher: Room sound stays labeled and shows on or off", soundLabel.includes("Room sound") && !/Mute|Unmute/.test(soundLabel) && /\b(On|Off)\b/.test(soundLabel), soundLabel);
  const zoneText = await watcher.locator("[data-zone-pill]").innerText();
  const titleText = await watcher.locator("[data-title-pill]").innerText();
  check("watcher: phone zone pill is ET and neither pill ellipsizes", zoneText.startsWith("ET") && !zoneText.includes("Eastern Time") && !zoneText.endsWith("…") && !titleText.endsWith("…") && titleText.endsWith("apartment"), `${titleText} | ${zoneText}`);
  await watcher.keyboard.press("Escape");
  const beforeStation = apiBefore();
  await assertCatalog(watcher, "watch", "phone");
  check("watcher: station rows and chips send no radio or tap", !watchBag.api.slice(beforeStation).some((line) => line.includes("/api/radio") || line.includes("/api/tap")), watchBag.api.slice(beforeStation).join(" "));
  await clickCtl(watcher, "rail-tv", "watch", "phone");
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
  const zoomOpen = await tuck.evaluate(() => document.documentElement.dataset.roomZoom || "");
  await tuck.clock.fastForward(9000);
  await tuck.waitForSelector(".hudf.is-tucked", { timeout: 4000 });
  check("the frame tucks after 8s once the room has been seen", (await tuck.locator(".hudf.is-tucked").count()) === 1);
  await tuck.keyboard.press("Escape");
  check("Escape untucks", (await tuck.locator(".hudf.is-tucked").count()) === 0);
  const zoomUntucked = await tuck.evaluate(() => document.documentElement.dataset.roomZoom || "");
  check("roomZoom does not change when the frame tucks or untucks", zoomOpen !== "" && zoomOpen === zoomUntucked, `${zoomOpen} -> ${zoomUntucked}`);
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

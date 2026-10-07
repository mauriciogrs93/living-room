// Figure-merge gate. SwiftShader frame times are not a result.
//   BASE=http://127.0.0.1:3921 node scripts/hud/hud-figures.mjs
// Measures 0, 4 and 10 figures at 390x844, DPR 2. Does not print invites or tokens.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/tmp/pw/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || "/opt/google/chrome/chrome";
const BASE = (process.env.BASE || "http://127.0.0.1:3921").replace(/\/$/, "");
const OUT = "/opt/cursor/artifacts/hud";
mkdirSync(`${OUT}/figures`, { recursive: true });

const password = "correct-horse-1";
const tag = Math.random().toString(36).slice(2, 8);
const names = ["Basil", "Juniper", "Pip", "Ada", "Eve", "Nico", "Ruth", "Omar", "Lila", "Seth"];
const colors = ["#6fa35a", "#e07a3d", "#3c6d94", "#b89758", "#8d99a6", "#c45c4a", "#4d7a62", "#7a6a9a", "#c4a574", "#5e6066"];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function signup(page, email) {
  await page.goto(`${BASE}/room?debug=1`, { waitUntil: "domcontentloaded" });
  await page.click("[data-auth-control=create-account]");
  await page.fill("#signin-email", email);
  await page.fill("#signin-password", password);
  await page.click("[data-auth-control=create-submit]");
  await page.waitForSelector("canvas", { timeout: 25000 });
}

async function spawn(page, count, offset) {
  const minted = await page.evaluate(async (count) => {
    const codes = [];
    for (let i = 0; i < count; i += 1) {
      const res = await fetch("/api/apartment/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "line" }),
      });
      const body = await res.json();
      if (!res.ok || typeof body.invite !== "string") return { error: "mint", codes };
      codes.push(body.invite);
    }
    return { error: "", codes };
  }, count);
  if (minted.codes.length !== count) throw new Error(`minted ${minted.codes.length}/${count}`);
  for (let i = 0; i < count; i += 1) {
    const res = await fetch(`${BASE}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.92.${offset}.${i + 1}` },
      body: JSON.stringify({ name: names[offset + i], emoji: "🌿", color: colors[offset + i], invite: minted.codes[i] }),
    });
    if (res.status !== 201) throw new Error(`register ${res.status}`);
    await res.arrayBuffer();
  }
}

async function distinctFrames(page, count) {
  const rows = [];
  let last = -1;
  const start = Date.now();
  while (rows.length < count && Date.now() - start < 20000) {
    const row = await page.evaluate(() => (window.__glStats ? { ...window.__glStats } : null));
    if (row && row.frame !== last) {
      rows.push(row);
      last = row.frame;
    }
    await page.waitForTimeout(40);
  }
  if (rows.length < count) throw new Error(`only ${rows.length} frames`);
  return rows;
}

async function measure(page, expected = 0) {
  // Full phone camera, not the lineup crop. The crop hides the house and under-counts draws.
  await page.goto(`${BASE}/room?debug=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForFunction(() => window.__glStats && window.__glStats.frame > 24 && window.__forceShadow && window.__glDump, null, { timeout: 20000 });
  if (expected > 0) {
    await page.waitForFunction((need) => {
      const dump = window.__glDump ? window.__glDump() : [];
      return dump.filter((row) => String(row.path).split("<").includes("figure")).length >= need;
    }, expected, { timeout: 15000 });
  }
  // Color-only frames first. A forced shadow refresh is one later frame, not the steady number.
  const steady = await distinctFrames(page, 5);
  const beforeShadow = steady[steady.length - 1].shadowRefreshes;
  const shadowSeen = await page.evaluate(() => new Promise((resolve) => {
    const seen = [];
    window.__forceShadow();
    const start = performance.now();
    const tick = () => {
      const stats = window.__glStats;
      if (stats) seen.push(stats.calls);
      if (performance.now() - start < 1500) requestAnimationFrame(tick);
      else resolve(seen);
    };
    requestAnimationFrame(tick);
  }));
  const figures = await page.evaluate(() => {
    const dump = window.__glDump ? window.__glDump() : [];
    return dump.filter((row) => String(row.path).split("<").includes("figure")).length;
  });
  return {
    figures,
    steadyCalls: median(steady.map((row) => row.calls)),
    shadowCalls: Math.max(...shadowSeen, 0),
    shadowRefreshes: beforeShadow,
    triangles: median(steady.map((row) => row.triangles)),
    meshes: steady[steady.length - 1].meshes,
    samples: steady.map((row) => row.calls),
  };
}

const rows = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    extraHTTPHeaders: { "x-forwarded-for": "10.93.7.2" },
  });
  const page = await ctx.newPage();
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (/youtube|ytimg|spotify|open-meteo|17track|somafm|googleapis|gstatic/i.test(url)) return route.abort();
    return route.continue();
  });
  await signup(page, `hud-fig-${tag}@example.com`);
  await page.waitForFunction(() => window.__glStats && window.__glStats.frame > 24, null, { timeout: 20000 });
  const closed = await distinctFrames(page, 5);
  const canvasClosed = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? { w: canvas.clientWidth, h: canvas.clientHeight, bw: canvas.width, bh: canvas.height } : null;
  });
  await page.evaluate(() => document.querySelector("[data-ctl=rail-today]")?.click());
  await page.waitForFunction(() => document.querySelector(".hudf-card"), null, { timeout: 5000 });
  const todayFrames = await distinctFrames(page, 5);
  const todayCalls = median(todayFrames.map((row) => row.calls));
  const canvasOpen = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? { w: canvas.clientWidth, h: canvas.clientHeight, bw: canvas.width, bh: canvas.height } : null;
  });
  await page.keyboard.press("Escape");
  const zero = await measure(page, 0);
  rows.push({ asked: 0, ...zero, todayCalls, todaySamples: todayFrames.map((row) => row.calls), canvasClosed, canvasOpen });

  await spawn(page, 4, 0);
  await page.goto(`${BASE}/room?debug=1&lineup=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/figures/390x844-lineup-1.png` });
  const four = await measure(page, 4);
  rows.push({ asked: 4, ...four });
  await page.goto(`${BASE}/room?debug=1&lineup=4`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/figures/390x844-lineup-4.png` });

  await spawn(page, 6, 4);
  const ten = await measure(page, 10);
  rows.push({ asked: 10, ...ten });
  await page.goto(`${BASE}/room?debug=1&lineup=10`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/figures/390x844-lineup-10.png` });
} finally {
  await browser.close();
}

const lines = [
  "Figure-merge gate. SwiftShader frame times are not meaningful.",
  "Phone gates: steady calls <= 120, shadow-frame calls <= 150, triangles < 250000.",
  "Counts use the full phone camera (?debug=1, no lineup). Lineup shots are separate so the crop cannot hide the house.",
  "Steady samples are distinct color-only frames. Shadow calls are the max over the next 1500ms after one forced refresh.",
  `Today open at 0 figures: ${rows[0] ? rows[0].todayCalls : "n/a"} calls (samples ${rows[0] && rows[0].todaySamples ? rows[0].todaySamples.join(", ") : "n/a"}).`,
  `Canvas closed ${rows[0] && rows[0].canvasClosed ? JSON.stringify(rows[0].canvasClosed) : "n/a"} open ${rows[0] && rows[0].canvasOpen ? JSON.stringify(rows[0].canvasOpen) : "n/a"}.`,
  "",
  "| figures asked | figure meshes | steady calls | shadow calls | triangles | scene meshes | steady samples |",
  "| --- | --- | --- | --- | --- | --- | --- |",
];
let pass = true;
for (const row of rows) {
  const rowPass = row.figures === row.asked && row.steadyCalls <= 120 && row.shadowCalls <= 150 && row.triangles < 250000;
  if (!rowPass) pass = false;
  lines.push(`| ${row.asked} | ${row.figures} | ${row.steadyCalls} | ${row.shadowCalls} | ${row.triangles} | ${row.meshes} | ${row.samples.join(", ")} |`);
}
if (rows.length === 3 && (rows[1].steadyCalls < rows[0].steadyCalls || rows[2].steadyCalls < rows[1].steadyCalls)) {
  pass = false;
  lines.push("sanity: more figures must not reduce steady calls (the house has to stay in frame)");
}
if (rows[0] && rows[0].todayCalls !== rows[0].steadyCalls) {
  pass = false;
  lines.push("parity: Today open changed the canvas draw");
}
if (rows[0] && rows[0].canvasClosed && rows[0].canvasOpen && JSON.stringify(rows[0].canvasClosed) !== JSON.stringify(rows[0].canvasOpen)) {
  pass = false;
  lines.push("parity: Today open changed the canvas size");
}
lines.push("");
lines.push(pass ? "GATE: pass" : "GATE: fail");
const text = lines.join("\n") + "\n";
writeFileSync(`${OUT}/figures.md`, text);
console.log(text);
if (!pass) process.exit(1);

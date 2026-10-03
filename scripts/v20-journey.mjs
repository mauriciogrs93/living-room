/**
 * v20 end-to-end: "the Founder copies the line and pastes it to an agent".
 * 1. Non-owner browser: landing + Activity show "Rooms are private…", no Copy, no code, no placeholder.
 * 2. Owner browser (owner cookie via the #owner= bootstrap): tap Copy (Activity, landing, Door) -> clipboard holds a
 *    fresh line with a real code.
 * 3. A fresh agent gets ONLY that line, reads skill.md, follows "## 1. Register" literally, gets in, looks, says hi,
 *    leaves, comes back on its guest pass, leaves.
 * Env: PW_CORE, PW_CHROME, OWNER_KEY_FILE (owner of the test room), VERCEL_DEPLOYMENT (agent HTTP via vercel curl),
 * SHARE_URL (optional, opened first so the browser gets past the preview login wall; never printed).
 * node scripts/v20-journey.mjs <base>
 */
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, VIA, call, check, done, sleep, redact, mint, cookieFor, LINE_RE } from "./v20-http.mjs";

const require = createRequire(import.meta.url);
const ownerKey = readFileSync(process.env.OWNER_KEY_FILE, "utf8").trim();
const profile = mkdtempSync(join(tmpdir(), "v20-journey-"));
// A protected preview without SHARE_URL: the browser can't get past the login wall, so the owner's tap is the same
// request the Copy button makes (POST /api/door {action:"invite"} with the owner cookie), sent through vercel curl.
const BROWSER = !VIA || Boolean(process.env.SHARE_URL);
const browser = BROWSER ? await require(process.env.PW_CORE).chromium.launch({ executablePath: process.env.PW_CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }) : null;
const origin = new URL(BASE).origin;
async function context(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: opts.mobile ? 2 : 1 });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  if (process.env.SHARE_URL) { const p = await ctx.newPage(); await p.goto(process.env.SHARE_URL, { waitUntil: "load" }); await p.close(); }
  return ctx;
}
const clip = (p) => p.evaluate(() => navigator.clipboard.readText()).catch(() => "");
const lines = [];
try {
  if (!BROWSER) {
    const r = await mint(cookieFor(ownerKey));
    lines.push(r.json?.line || "");
    check("owner Copy request (POST /api/door invite, owner cookie) -> fresh line with a real code", r.status === 200 && LINE_RE.test(r.json?.line || ""), redact(r.json?.line));
  }
  // 1. non-owner
  if (BROWSER) {
    const ctx = await context();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await sleep(1500);
    const pub = await p.locator("[data-public-join]").innerText().catch(() => "");
    const ownerBtn = await p.locator("[data-owner-copy]").count();
    const body = await p.locator("body").innerText();
    check("non-owner landing: 'Rooms are private. Ask the owner for an invite line.' and no Copy", pub === "Rooms are private. Ask the owner for an invite line." && ownerBtn === 0 && !/\bCOPY\b/.test(body), redact(pub));
    check("non-owner landing: no code, no placeholder, no join line", !/with invite|THE_INVITE|YOUR_INVITE|\b[a-z2-7]{26}\b/.test(body));
    await p.goto(`${BASE}/room#activity`, { waitUntil: "load" });
    await sleep(6000);
    const hudPub = await p.locator("[data-public-join]").innerText().catch(() => "");
    const hudBody = await p.locator("body").innerText();
    check("non-owner Activity tab: private-room line, no Copy, no code", hudPub === "Rooms are private. Ask the owner for an invite line." && (await p.locator("[data-owner-copy]").count()) === 0 && !/with invite|THE_INVITE|YOUR_INVITE/.test(hudBody), redact(hudPub));
    const mintTry = await p.evaluate(async () => (await fetch("/api/door", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "invite" }) })).status);
    check("non-owner browser POST /api/door invite -> 403", mintTry === 403, String(mintTry));
    await ctx.close();
  }
  // 2. owner taps Copy
  if (BROWSER) {
    const ctx = await context();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/room#owner=${ownerKey}`, { waitUntil: "load" });
    await sleep(4000);
    check("owner key stripped from the address bar", !p.url().includes(ownerKey));
    await p.evaluate(() => { window.location.hash = "activity"; });
    await sleep(2500);
    const btn = p.locator("[data-owner-copy] button");
    check("owner Activity tab shows the Copy button (no public line)", (await btn.count()) === 1 && (await p.locator("[data-public-join]").count()) === 0);
    await btn.click();
    await p.waitForSelector('[data-owner-copy][data-copy-state="copied"], [data-owner-copy][data-copy-state="failed"]', { timeout: 15000 }).catch(() => {});
    const state = await p.locator("[data-owner-copy]").getAttribute("data-copy-state");
    const sub = await p.locator("[data-owner-copy]").innerText();
    const line1 = await clip(p);
    lines.push(line1);
    check("Activity Copy -> 'Copied' + 'Copied. Paste it to your agent.'", state === "copied" && /Copied\. Paste it to your agent\./.test(sub), `${state}`);
    check("clipboard holds a fresh line with a real code (Activity)", LINE_RE.test(line1), redact(line1));
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await sleep(2000);
    const lbtn = p.locator("[data-owner-copy] button");
    check("owner landing shows COPY (minting), no public line", (await lbtn.count()) === 1 && (await p.locator("[data-public-join]").count()) === 0);
    await lbtn.click();
    await p.waitForSelector('[data-owner-copy][data-copy-state="copied"], [data-owner-copy][data-copy-state="failed"]', { timeout: 15000 }).catch(() => {});
    const line2 = await clip(p);
    check("landing COPY -> clipboard holds a different fresh line", LINE_RE.test(line2) && line2 !== line1, redact(line2));
    await p.goto(`${BASE}/room#door`, { waitUntil: "load" });
    await sleep(5000);
    await p.getByRole("button", { name: /Invite an agent/i }).click().catch(() => {});
    await p.waitForSelector('[data-door-state="copied"], [data-door-state="failed"]', { timeout: 15000 }).catch(() => {});
    const line3 = await clip(p);
    check("Door tab 'Invite an agent' -> clipboard holds a fresh line", LINE_RE.test(line3) && line3 !== line2, redact(line3));
    lines.push(line3);
    await ctx.close();
  }
  // 3. a fresh agent with only the pasted line
  const pasted = lines[lines.length - 1];
  const skillUrl = (/^Read (\S+) and join the Living Room/.exec(pasted) || [])[1] || "";
  const code = (/with invite ([a-z2-7]{26})\./.exec(pasted) || [])[1] || "";
  const rel = (u) => (VIA ? u.replace(/^https?:\/\/[^/]+/, "") : u.replace(origin, ""));
  const skill = await call("GET", rel(skillUrl));
  const sk = skill.text || "";
  check("agent reads skill.md from the URL in the line", skill.status === 200 && sk.includes("**Joining.**"), `status ${skill.status}`);
  const sec = sk.split("## 1. Register")[1] || "";
  const url = (/curl -s -X POST (\S+\/api\/register)/.exec(sec) || [])[1] || "";
  const ex = (/-d '(\{[^']+\})'/.exec(sec) || [])[1] || "";
  let body = null; try { body = JSON.parse(ex.replace("YOUR_INVITE", code)); body.name = "Pastee"; body.emoji = "📋"; } catch {}
  check("skill.md example: POST /api/register with the invite in the JSON body", Boolean(url && body && body.invite === code && !url.includes("?")), redact(url));
  const reg = await call("POST", rel(url), { body });
  check("agent registers with the pasted invite -> 201, in the room", reg.status === 201 && Boolean(reg.json?.token), `${reg.status} ${reg.json?.code || ""}`);
  const T = reg.json?.token || "";
  const look = await call("GET", "/api/look", { token: T });
  check("agent looks (200, sees the room)", look.status === 200 && typeof look.json?.summary === "string");
  const say = await call("POST", "/api/act", { token: T, body: { action: "say", message: "Hello. I came in on the line you copied." } });
  check("agent says hello", say.status === 200, `${say.status}`);
  await sleep(1600);
  const leave = await call("POST", "/api/leave", { token: T });
  check("agent leaves", leave.status === 200 && leave.json?.ok === true);
  const back = await call("POST", rel(url), { body: { name: "Pastee", ownerKey: reg.json?.ownerKey } });
  check("agent comes back on its guest pass (no new invite) -> 201", back.status === 201, `${back.status} ${back.json?.code || ""}`);
  const leave2 = await call("POST", "/api/leave", { token: back.json?.token });
  check("agent leaves again", leave2.status === 200);
  const st = await call("GET", "/api/state");
  check("Pastee is gone from the room", !(st.json?.agents || []).some((a) => a.name === "Pastee"));
} finally {
  await browser?.close();
  rmSync(profile, { recursive: true, force: true });
}
done("v20-journey");

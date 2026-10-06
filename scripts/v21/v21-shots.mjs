// v21 r2 browser checks + screenshots (codes and links blurred via [data-secret]; nothing secret printed).
//   BASE=http://localhost:3921 PREVIEW=<preview url> node v21-shots.mjs
// The check-your-email screens stub POST /api/auth/otp in the browser (no email is ever sent); everything else
// is real. The owner signs in with a reused test account (session from the preview-only helper via v21-lib).
import { createRequire } from "node:module";
import { signIn, LINE_RE, WATCH_RE } from "./v21-lib.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || "/opt/google/chrome/chrome";
const BASE = (process.env.BASE || "http://localhost:3921").replace(/\/$/, "");
const OUT = process.env.OUT || "/workspace/engineer-kb/v21";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "v21t-r1-bgq2mz@example.com"; // an existing test account (reused)
const BLUR = "[data-secret]{filter:blur(7px)!important;user-select:none}";
const results = [];
const check = (n, ok, d = "") => { results.push(Boolean(ok)); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  (${String(d).replace(/\b[a-z2-7]{26}\b/g, "<code>")})` : ""}`); };
const shot = (p, name, opts = {}) => p.screenshot({ path: `${OUT}/${name}`, timeout: 90000, ...opts });
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const ROTATION_WORDS = /New code in|Live for|new code|run-down|0:50|50 seconds|50-second|rotat|Getting a new/i;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ip = () => `10.98.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const opts = (viewport, extra = {}) => ({ viewport, ...(BASE.includes("localhost") ? { extraHTTPHeaders: { "x-forwarded-for": ip() } } : {}), ...extra });
async function blurred(viewport, extra) {
  const ctx = await browser.newContext(opts(viewport, extra));
  await ctx.addInitScript((css) => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }); }, BLUR);
  return ctx;
}
// The 3D room renders in software (swiftshader), so "stable" checks can starve; a forced real mouse click is still a user gesture.
const press = (page, sel) => page.locator(sel).first().click({ force: true, timeout: 60000 });
const text = (page, sel) => page.locator(sel).first().evaluate((el) => el.textContent.replace(/\s+/g, " ").trim());

try {
  // ---- sign-in screen ----
  const anon = await browser.newContext(opts(DESK));
  const p0 = await anon.newPage();
  await p0.goto(`${BASE}/room`, { waitUntil: "networkidle" });
  await p0.waitForSelector("[data-signin] input[type=email]", { timeout: 20000 });
  check("sign-in intro is Writer's line", (await text(p0, ".landing-lede")) === "One account, one private apartment. Only you and people you send a watch link can see it.", await text(p0, ".landing-lede"));
  await shot(p0, "01-sign-in-r2.png");
  // ---- check-your-email (request stubbed in the browser: nothing is sent) ----
  let otpCalls = 0;
  await p0.route("**/api/auth/otp", (route) => { otpCalls += 1; return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
  await p0.fill("#signin-email", "someone@example.com");
  await p0.click(".signin-submit");
  await p0.waitForSelector("[data-signin-sent]", { timeout: 10000 });
  const notes = await p0.locator("[data-signin-sent] .signin-note").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check("check-your-email main note + second line are Writer's exact strings", notes[0] === "Check your email and tap the link. Open it in this browser." && notes[1] === "It comes from Supabase. Not there? Check spam.", JSON.stringify(notes));
  check("resend link reads 'Send it again'", (await text(p0, "[data-signin-resend]")) === "Send it again");
  const codeUi = await p0.locator("#signin-code, input[autocomplete=one-time-code], input[inputmode=numeric]").count();
  const bodyText = await p0.locator("body").evaluate((b) => b.innerText);
  check("no code field and no code wording anywhere (no 'type the code', no 'That code didn't work.')", codeUi === 0 && !/type the code|That code didn.t work|\bCODE\b/i.test(bodyText), `code inputs ${codeUi}`);
  await p0.waitForTimeout(300);
  await shot(p0, "02-check-email-r2.png");
  await p0.unroute("**/api/auth/otp");
  await p0.route("**/api/auth/otp", (route) => { otpCalls += 1; return route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "3600" }, body: JSON.stringify({ ok: false, code: "email_rate_limited", error: "Too many emails for now. Try again in an hour." }) }); });
  await p0.click("[data-signin-resend]");
  await p0.waitForSelector(".signin-note.is-error", { timeout: 10000 });
  check("'Send it again' at the limit (429) -> 'Too many emails for now. Try again in an hour.' and the screen stays", (await text(p0, ".signin-note.is-error")) === "Too many emails for now. Try again in an hour." && (await p0.locator("[data-signin-sent]").count()) === 1);
  await shot(p0, "02b-check-email-limit-r2.png");
  await p0.unroute("**/api/auth/otp");
  await p0.route("**/api/auth/otp", (route) => route.abort());
  await p0.click("[data-signin-resend]");
  await p0.waitForFunction(() => document.querySelector(".signin-note.is-error")?.textContent.trim() === "Can't connect. Check your connection.", null, { timeout: 10000 }).catch(() => {});
  check("no connection -> 'Can't connect. Check your connection.'", (await text(p0, ".signin-note.is-error")) === "Can't connect. Check your connection.");
  check("only the stubbed sign-in requests ran (send + resend at the limit fulfilled, the offline one aborted): nothing sent", otpCalls === 2, `fulfilled ${otpCalls}`);
  await anon.close();

  // ---- owner: Invite (mint on Copy) ----
  const session = await signIn(OWNER_EMAIL);
  check("owner test session (reused account)", session.ok, `status ${session.status}`);
  const ctx = await blurred(DESK, { permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addCookies([...session.jar.map].map(([name, value]) => ({ name, value, url: BASE, httpOnly: true, secure: BASE.startsWith("https"), sameSite: "Lax" })));
  const page = await ctx.newPage();
  await page.clock.install();
  const mints = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/apartment/invite") mints.push(r.postData() || ""); });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-hud=fab]", { timeout: 60000 });
  await page.waitForTimeout(1500);
  check("nothing is minted before the Invite menu opens", mints.length === 0, `${mints.length} mints`);
  await press(page, "[data-hud=invite]");
  await page.waitForSelector("[data-invite-section][data-invite-state=live]", { timeout: 15000 });
  await page.waitForTimeout(400);
  check("opening the menu makes ONE request for the shown line + link", mints.length === 1 && mints[0] === "{}", JSON.stringify(mints));
  // Freeze the page clock so a slow screenshot can't burn the minute and refresh a code mid-check.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  check("Invite intro is Writer's line", (await text(page, ".invite-intro")) === "Copy one and send it right away. Each works once.");
  const labels = await page.locator("[data-invite-field] .hud-kicker").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check("labels: 'Invite an agent' and 'Let a person watch' (no 'Watch link for a person')", labels[0] === "Invite an agent" && labels[1] === "Let a person watch", JSON.stringify(labels));
  check("the watch button reads Stop all watching", (await text(page, "[data-watch-revoke]")) === "Stop all watching");
  const card = await page.locator("[data-hud-card]").evaluate((el) => el.textContent);
  check("no countdown, run-down bar, timer, 0:50 warning or 50-second sentence", !ROTATION_WORDS.test(card) && (await page.locator(".invite-bar, .invite-countdown, [data-invite-timer]").count()) === 0);
  check("the signed-in email badge shows (masked) beside Sign out", /@/.test(await text(page, "[data-account-email]")) && !/v21t-r1-bgq2mz@example\.com/.test(await text(page, "[data-account-email]")));
  const shown0 = await text(page, "[data-invite-value=line]");
  await press(page, "[data-invite-field=line] button.invite-copy-hud");
  await page.waitForSelector("[data-invite-field=line][data-copy-state=copied]", { timeout: 15000 });
  const clip1 = await page.evaluate(() => navigator.clipboard.readText());
  const shown1 = await text(page, "[data-invite-value=line]");
  check("Copy tap mints a fresh line ({kind:line}) and copies exactly the line now shown", mints.length === 2 && mints[1] === '{"kind":"line"}' && LINE_RE.test(clip1) && clip1 === shown1 && shown1 !== shown0, JSON.stringify(mints.slice(1)));
  check("'Copied' on the button", (await text(page, "[data-invite-field=line] button.invite-copy-hud")) === "Copied");
  await shot(page, "03-invite-after-copy-r2.png", { animations: "disabled" });
  await page.clock.runFor(2200);
  await press(page, "[data-invite-field=line] button.invite-copy-hud");
  await page.waitForSelector("[data-invite-field=line][data-copy-state=copied]", { timeout: 15000 });
  const clip2 = await page.evaluate(() => navigator.clipboard.readText());
  check("a second Copy tap gives a different code", mints.length === 3 && LINE_RE.test(clip2) && clip2 !== clip1);
  await press(page, "[data-invite-field=watch] button.invite-copy-hud");
  await page.waitForSelector("[data-invite-field=watch][data-copy-state=copied]", { timeout: 15000 });
  const clipW = await page.evaluate(() => navigator.clipboard.readText());
  const shownW = await text(page, "[data-invite-value=watch]");
  check("Copy on 'Let a person watch' mints a fresh watch link ({kind:watch}) and copies it", mints.length === 4 && mints[3] === '{"kind":"watch"}' && WATCH_RE.test(clipW) && clipW === shownW, JSON.stringify({ mints: mints.slice(3), copiedIsLink: WATCH_RE.test(clipW), shownIsLink: WATCH_RE.test(shownW), same: clipW === shownW }));
  await page.locator("[data-invite-field=watch]").screenshot({ path: `${OUT}/04-watch-link-line-r2.png`, timeout: 90000, animations: "disabled" });
  // an expired line is replaced while the menu is open.
  // "Updated" fades out in ~2s and starts at opacity 0, so a visibility wait can miss it. Latch the moment it
  // is in the DOM, before the clock jumps, and require the new line (never the blank gap, never the dead code).
  await page.clock.runFor(2200);
  const beforeLine = await text(page, "[data-invite-value=line]");
  const m0 = mints.length;
  await page.evaluate(() => {
    window.__inviteUpdated = false;
    const mark = () => {
      if (document.querySelector("[data-invite-field=line] [data-invite-updated]")) window.__inviteUpdated = true;
    };
    mark();
    new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });
  });
  await page.clock.fastForward(61_000);
  await page.clock.resume();
  await page.waitForFunction(
    (v) => {
      const t = document.querySelector("[data-invite-value=line]")?.textContent.trim() ?? "";
      return t !== v && /^Read .+\/skill\.md and join the Living Room with invite [a-z2-7]{26}\. Use it now; it works once\.$/.test(t) && window.__inviteUpdated === true;
    },
    beforeLine,
    { timeout: 15000 },
  );
  const refreshedBodies = mints.slice(m0);
  const updatedShown = await page.evaluate(() => window.__inviteUpdated === true);
  check("menu open: when the shown line reaches its minute it is replaced (one request per expired field) and 'Updated' shows", LINE_RE.test(await text(page, "[data-invite-value=line]")) && (await text(page, "[data-invite-value=line]")) !== beforeLine && refreshedBodies.includes('{"kind":"line"}') && refreshedBodies.length <= 2 && updatedShown, JSON.stringify(refreshedBodies));
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  await page.locator("[data-hud-card]").screenshot({ path: `${OUT}/05-invite-expired-refreshed-r2.png`, timeout: 90000, animations: "disabled" });
  await page.clock.resume();
  // hidden tab: nothing is minted in the background; coming back refreshes expired fields once
  await page.waitForTimeout(500);
  const m1 = mints.length;
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(180_000);
  await page.waitForTimeout(1500);
  check("tab hidden for 3 minutes with the menu open: nothing minted", mints.length === m1, `${mints.length - m1} mints`);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(2500);
  check("back on the tab: the expired line and link are refreshed once (at most 2 requests)", mints.length - m1 >= 1 && mints.length - m1 <= 2, `${mints.length - m1} requests`);
  // menu closed: nothing is minted
  await press(page, "[data-hud=fab]");
  await page.waitForTimeout(800);
  const m2 = mints.length;
  const closed = (await page.locator("[data-invite-section]").count()) === 0;
  await page.clock.fastForward(300_000);
  await page.waitForTimeout(1500);
  check("menu closed for 5 minutes: nothing minted", closed && mints.length === m2, `section ${closed ? "closed" : "open"}, ${mints.length - m2} mints`);
  // two fresh watch links for the guests (kept in memory only), then close the owner page
  const links = [];
  for (let i = 0; i < 2; i += 1) links.push(await page.evaluate(async () => (await (await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: '{"kind":"watch"}' })).json()).watchLink));
  await ctx.close();

  // ---- guests: watch chip vs FIG. 1 caption, desktop and phone ----
  for (const [i, vp, name] of [[0, DESK, "06-watch-chip-desktop-r2.png"], [1, PHONE, "06b-watch-chip-phone-r2.png"]]) {
    const g = await browser.newContext(opts(vp, vp === PHONE ? { isMobile: true, hasTouch: true } : {}));
    const gp = await g.newPage();
    await gp.goto(links[i].replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" });
    await gp.waitForSelector("[data-watch-badge]", { timeout: 60000 });
    await gp.waitForTimeout(2000);
    const badge = await gp.locator("[data-watch-badge]").boundingBox();
    const capVisible = await gp.locator(".sheet-caption").isVisible();
    const cap = capVisible ? await gp.locator(".sheet-caption").boundingBox() : null;
    const fab = await gp.locator("[data-hud=fab]").boundingBox().catch(() => null);
    const inView = badge && badge.x >= 0 && badge.y >= 0 && badge.x + badge.width <= vp.width && badge.y + badge.height <= vp.height;
    const label = vp === PHONE ? "phone 390x844" : "desktop 1280x800";
    if (vp === DESK) check(`${label}: watch chip above the FIG. 1 block, no overlap, left edges aligned`, capVisible && !overlap(badge, cap) && badge.y + badge.height <= cap.y && Math.abs(badge.x - cap.x) <= 1 && inView, `chip bottom ${Math.round(badge.y + badge.height)} / caption top ${Math.round(cap?.y)}`);
    else check(`${label}: caption hidden (as before), chip in the corner, clear of the HERE button`, !capVisible && inView && !overlap(badge, fab), `chip x=${Math.round(badge.x)} y=${Math.round(badge.y)}`);
    check(`${label}: a watcher has no Invite button`, (await gp.locator("[data-hud=invite]").count()) === 0);
    await shot(gp, name);
    await g.close();
  }

  // Owner cuts off a watcher. A fresh page (no fake clock) so the stream and the button are on real time.
  const endCtx = await blurred(DESK, { permissions: ["clipboard-read", "clipboard-write"] });
  await endCtx.addCookies([...session.jar.map].map(([name, value]) => ({ name, value, url: BASE, httpOnly: true, secure: BASE.startsWith("https"), sameSite: "Lax" })));
  const endPage = await endCtx.newPage();
  await endPage.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await endPage.waitForSelector("[data-hud=invite]", { timeout: 60000 });
  await press(endPage, "[data-hud=invite]");
  await endPage.waitForSelector("[data-watch-revoke]", { timeout: 15000 });
  const endLink = await endPage.evaluate(async () => (await (await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: '{"kind":"watch"}' })).json()).watchLink);
  const endGuest = await browser.newContext(opts(DESK));
  const endGuestPage = await endGuest.newPage();
  await endGuestPage.goto(String(endLink).replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" });
  await endGuestPage.waitForSelector("[data-watch-badge]", { timeout: 60000 });
  await press(endPage, "[data-watch-revoke]");
  await endPage.waitForFunction(() => document.body.innerText.includes("Done. No one is watching now."), null, { timeout: 10000 });
  check("after Stop all watching the owner sees 'Done. No one is watching now.'", (await endPage.locator("[data-invite-field=watch] .hud-quiet").last().innerText()) === "Done. No one is watching now.");
  await endGuestPage.waitForSelector("[data-watch-ended]", { timeout: 20000 });
  check("a watcher cut off sees 'The owner ended this watch. Ask them for a new link.'", (await text(endGuestPage, "[data-watch-ended]")) === "The owner ended this watch. Ask them for a new link.");
  await shot(endGuestPage, "07-watch-ended-r2.png");
  await endGuest.close();
  await endCtx.close();
} catch (e) {
  check("browser run completed", false, String(e.message || e).split("\n")[0]);
} finally {
  await browser.close();
}
const fail = results.filter((r) => !r).length;
console.log(`\nv21-shots r2: ${results.length - fail} passed, ${fail} failed, ${results.length} total`);
process.exitCode = fail ? 1 : 0;

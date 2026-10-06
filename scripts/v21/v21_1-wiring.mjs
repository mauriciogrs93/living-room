// v21.1 browser wiring. No email is sent. The email-link path uses the local auth stub:
// POST /api/auth/otp, read /stub/code, then the same browser opens /auth/callback?code=.
//   BASE=http://127.0.0.1:3921 STUB=http://127.0.0.1:4599 node scripts/v21/v21_1-wiring.mjs
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core");
const CHROME = process.env.PW_CHROME || "/opt/google/chrome/chrome";
const BASE = (process.env.BASE || "http://127.0.0.1:3921").replace(/\/$/, "");
const STUB = (process.env.STUB || "http://127.0.0.1:4599").replace(/\/$/, "");
const tag = Math.random().toString(36).slice(2, 8);
const linkEmail = `v21t-link-${tag}@example.com`;
const signEmail = `v21t-wire-${tag}@example.com`;
const password = "correct-horse-1";
const nextPassword = "another-horse-2";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${String(detail).slice(0, 180)})` : ""}`);
};
const ALLOW = new Set([
  "sign-in", "show-password", "magic", "create-account", "magic-submit", "back-to-password",
  "resend", "different-email", "back-to-signin", "create-submit", "save-password", "not-now",
  "offer-show", "you-set-password", "sign-out", "leave",
]);

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function controls(page, root) {
  return page.locator(root).locator("button, a").evaluateAll((els) =>
    els.map((el) => ({
      control: el.getAttribute("data-auth-control") || "",
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
      href: el.getAttribute("href") || "",
    })),
  );
}
function unknown(list) {
  return list.filter((item) => {
    if (item.control && ALLOW.has(item.control)) return false;
    if (item.href === "/") return false;
    if (item.text === "Send") return false;
    return true;
  });
}

try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-auth-control=sign-in]", { timeout: 20000 });
    const sign = await page.locator("[data-auth-control=sign-in]").boundingBox();
    const magic = await page.locator("[data-auth-control=magic]").boundingBox();
    const form = await page.locator(".signin-form").boundingBox();
    const card = await page.locator(".signin-card").boundingBox();
    check(`${width}: Sign in is full width and at least 44px`, Boolean(sign && form && sign.height >= 44 && sign.width >= form.width - 2), sign ? `${Math.round(sign.width)}x${Math.round(sign.height)}` : "missing");
    check(`${width}: magic link is full width and at least 44px`, Boolean(magic && form && magic.height >= 44 && magic.width >= form.width - 2));
    const mid = card ? card.y + card.height / 2 : 0;
    check(`${width}: the card sits above the vertical centre`, Boolean(card) && mid < height * 0.5 && mid > height * 0.2, `mid ${Math.round(mid)}`);
    const stray = unknown(await controls(page, "[data-signin]"));
    check(`${width}: every sign-in control is known`, stray.length === 0, JSON.stringify(stray));
    const body = await page.locator("body").innerText();
    const struck = [["Tap ", ["Con", "tinue"].join("")].join(""), ["One", "moment"].join(" ")];
    check(`${width}: no forgot-password and no confirm-page copy`, !body.includes("Forgot password?") && struck.every((line) => !body.includes(line)));
    await ctx.close();
  }

  const err = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errPage = await err.newPage();
  await errPage.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await errPage.waitForSelector("[data-auth-control=sign-in]");
  await errPage.fill("#signin-email", signEmail);
  await errPage.fill("#signin-password", "short");
  await errPage.click("[data-auth-control=sign-in]");
  await errPage.waitForSelector(".signin-note.is-error");
  check("a short password shows the 12-character line", (await errPage.locator(".signin-note.is-error").innerText()) === "Use at least 12 characters.");
  await errPage.fill("#signin-password", "not-the-password");
  await errPage.click("[data-auth-control=sign-in]");
  await errPage.waitForFunction(() => document.querySelector(".signin-note.is-error")?.textContent?.includes("don't match"), null, { timeout: 15000 });
  check("a wrong password shows the short mismatch line", (await errPage.locator(".signin-note.is-error").innerText()) === "That email and password don't match. Try again.");
  await errPage.click("[data-auth-control=create-account]");
  await errPage.waitForSelector(".signin-hint");
  const hint = await errPage.locator(".signin-hint").evaluate((el) => getComputedStyle(el).color);
  check("helper text is #655E52", hint === "rgb(101, 94, 82)", hint);
  const createControls = unknown(await controls(errPage, "[data-signin]"));
  check("every create-account control is known", createControls.length === 0, JSON.stringify(createControls));
  await errPage.fill("#signin-email", signEmail);
  await errPage.fill("#signin-password", password);
  await errPage.click("[data-auth-control=create-submit]");
  await errPage.waitForSelector("[data-owner-badge]", { timeout: 20000 });
  check("password sign-up lands in the room without the offer", (await errPage.locator("[data-password-offer]").count()) === 0);
  await err.close();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-auth-control=magic]");
  await page.click("[data-auth-control=magic]");
  await page.fill("#signin-email", linkEmail);
  await page.click("[data-auth-control=magic-submit]");
  await page.waitForSelector("[data-signin-sent]");
  const magicControls = unknown(await controls(page, "[data-signin]"));
  check("every magic-link control is known", magicControls.length === 0, JSON.stringify(magicControls));
  const minted = await fetch(`${STUB}/stub/code?email=${encodeURIComponent(linkEmail)}`);
  const mintedBody = await minted.json();
  check("the stub held a code and sent no mail", minted.ok && typeof mintedBody.code === "string" && mintedBody.code.length > 10);
  await page.goto(`${BASE}/auth/callback?code=${encodeURIComponent(mintedBody.code)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-password-offer]", { timeout: 20000 });
  check("email-link sign-in opens Set a password", (await page.locator("[data-password-offer] h2").innerText()) === "Set a password");
  check("the offer has Save password and Not now", (await page.locator("[data-auth-control=save-password]").innerText()) === "Save password" && (await page.locator("[data-auth-control=not-now]").innerText()) === "Not now");
  const offerControls = unknown(await controls(page, "[data-password-offer]"));
  check("every offer control is known", offerControls.length === 0, JSON.stringify(offerControls));
  await page.click("[data-auth-control=not-now]");
  await page.waitForSelector("[data-password-offer]", { state: "detached" });
  const stored = await page.evaluate(() => ({ later: localStorage.getItem("lr-set-password-later"), keys: Object.keys(localStorage) }));
  check("Not now dismisses on this device only", stored.later === "1" && stored.keys.every((key) => key === "lr-set-password-later" || key === "living-room-seen-replies"), stored.keys.join(","));
  await page.click("[data-hud=fab]");
  await page.waitForSelector("[data-hud-tab=you]", { timeout: 15000 });
  await page.click("[data-hud-tab=you]");
  await page.waitForSelector("[data-auth-control=you-set-password]");
  const youControls = unknown(await controls(page, ".hud-card-body"));
  check("every You-panel control is known", youControls.length === 0, JSON.stringify(youControls));
  await page.click("[data-auth-control=you-set-password]");
  await page.waitForSelector("[data-password-offer]");
  await page.fill("#offer-password", password);
  await page.click("[data-auth-control=save-password]");
  await page.waitForSelector("[data-password-saved]", { timeout: 15000 });
  check("Save password confirms and mentions other devices", (await page.locator("[data-password-saved]").innerText()) === "Password saved. You're signed out on your other devices.");
  await page.waitForSelector("[data-password-offer]", { state: "detached", timeout: 5000 });
  const badge = await page.locator("[data-auth-control=sign-out]").boundingBox();
  const badgeColor = await page.locator("[data-auth-control=sign-out]").evaluate((el) => getComputedStyle(el).color);
  check("Sign out is at least 44px and not red", Boolean(badge) && badge.height >= 44 && badgeColor !== "rgb(163, 58, 28)", badgeColor);
  await page.click("[data-auth-control=sign-out]");
  await page.waitForSelector("[data-signin]", { timeout: 15000 });
  check("after Sign out the page says you're signed out", (await page.locator(".signin-note").innerText()).includes("You're signed out."));
  await page.fill("#signin-email", linkEmail);
  await page.fill("#signin-password", password);
  await page.click("[data-auth-control=sign-in]");
  await page.waitForSelector("[data-owner-badge]", { timeout: 20000 });
  check("password sign-in does not auto-open the offer", (await page.locator("[data-password-offer]").count()) === 0);
  await page.click("[data-hud=fab]");
  await page.click("[data-hud-tab=you]");
  await page.click("[data-auth-control=you-set-password]");
  await page.waitForSelector("#offer-current");
  await page.fill("#offer-current", "nope-nope-nope");
  await page.fill("#offer-password", nextPassword);
  await page.click("[data-auth-control=save-password]");
  await page.waitForSelector("[data-password-note]");
  check("changing a password with the wrong current one stays generic", (await page.locator("[data-password-note]").innerText()) === "Couldn't save your password. Try again.");
  await ctx.close();
} finally {
  await browser.close();
}

const fail = results.filter((ok) => !ok).length;
console.log(`\nv21.1-wiring: ${results.length - fail} passed, ${fail} failed, ${results.length} total`);
process.exit(fail ? 1 : 0);

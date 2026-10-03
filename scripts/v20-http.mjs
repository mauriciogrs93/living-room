// v20 shared HTTP helper for the test scripts. Local server: plain fetch. Protected preview: VERCEL_DEPLOYMENT=<url>
// routes every call through `vercel curl` (the CLI's own protection bypass; nothing is printed or stored).
// Owner key reuse across scripts on one test room: OWNER_KEY_FILE=<path> (mode 600, deleted after the run).
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

export const BASE = (process.argv[2] || process.env.ROOM_URL || "http://localhost:3920").replace(/\/$/, "");
export const VIA = process.env.VERCEL_DEPLOYMENT || "";
const VERCEL_BIN = process.env.VERCEL_BIN || "vercel";
const SCOPE = process.env.VERCEL_SCOPE || "mauriciogrs93s-projects";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ipN = 20;

function viaCurl(method, path, h, body) {
  const args = ["curl", path, "--deployment", VIA, "--scope", SCOPE, "--", "-s", "-i", "-X", method];
  for (const [k, v] of Object.entries(h)) if (k !== "x-forwarded-for") args.push("-H", `${k}: ${v}`);
  if (body !== undefined) args.push("--data-raw", typeof body === "string" ? body : JSON.stringify(body));
  return new Promise((resolve) => execFile(VERCEL_BIN, args, { maxBuffer: 8 << 20 }, (err, out) => {
    const text = String(out || "").replace(/\r/g, "");
    const blocks = text.split("\n\n");
    let i = 0; while (i < blocks.length - 1 && /^HTTP\/[\d.]+ (1\d\d|30\d)/.test(blocks[i])) i += 1;
    const head = blocks[i] || ""; const rest = blocks.slice(i + 1).join("\n\n");
    const status = Number((head.match(/^HTTP\/[\d.]+ (\d+)/) || [])[1] || 0);
    const hdrs = new Map(); for (const line of head.split("\n").slice(1)) { const c = line.indexOf(":"); if (c > 0) { const k = line.slice(0, c).trim().toLowerCase(); hdrs.set(k, hdrs.has(k) ? hdrs.get(k) + ", " + line.slice(c + 1).trim() : line.slice(c + 1).trim()); } }
    let json = null; try { json = JSON.parse(rest); } catch {}
    resolve({ status, json, text: rest, headers: { get: (k) => hdrs.get(k.toLowerCase()) ?? null } });
  }));
}

export async function call(method, path, { body, cookie, token, xff, headers = {} } = {}) {
  const h = { "content-type": "application/json", origin: BASE, ...headers };
  if (cookie) h.cookie = cookie;
  if (token) h.authorization = `Bearer ${token}`;
  h["x-forwarded-for"] = xff || `10.20.0.${ipN++ % 250}`;
  if (VIA) return viaCurl(method, path, h, body);
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

export const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${redact(detail)})` : ""}`);
}
/** Never print owner keys, tokens or invite codes. */
export function redact(s) {
  return String(s ?? "").replace(/(own|tok|lr)_[A-Za-z0-9_-]{8,}/g, "$1_…").replace(/\b[a-z2-7]{26}\b/g, "<code>").slice(0, 300);
}
export function done(label) {
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${label}: ${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
}

export const cookieFor = (ownerKey) => `__Host-lr_owner=${encodeURIComponent(ownerKey)}`;

/** The owner of the test room: from OWNER_KEY_FILE if an earlier script claimed it, else the rescue claim (fresh room). */
export async function ownerSetup(name = "Owner") {
  const file = process.env.OWNER_KEY_FILE || "";
  if (file && existsSync(file)) {
    const ownerKey = readFileSync(file, "utf8").trim();
    return { ownerKey, cookie: cookieFor(ownerKey), token: "", claimed: false };
  }
  const r = await call("POST", "/api/register", { body: { name, emoji: "🏠" } });
  const ownerKey = r.json?.ownerKey || "";
  if (file && ownerKey) { writeFileSync(file, ownerKey, { mode: 0o600 }); chmodSync(file, 0o600); }
  return { ownerKey, cookie: cookieFor(ownerKey), token: r.json?.token || "", claimed: r.status === 201, status: r.status };
}

/** Owner mints one invite (the same request the Copy button makes). Waits out the mint limit unless raw. */
export async function mint(cookie, { raw = false } = {}) {
  for (let i = 0; ; i += 1) {
    const r = await call("POST", "/api/door", { cookie, body: { action: "invite" } });
    if (raw || r.status !== 429 || i >= 2) return r;
    await sleep(((Number(r.headers.get("retry-after")) || Number(r.json?.retryAfter) || 30) + 1) * 1000);
  }
}

export const LINE_RE = /^Read (https?:\/\/[^\s]+)\/skill\.md and join the Living Room with invite ([a-z2-7]{26})\. Use it now; it works once\.$/;

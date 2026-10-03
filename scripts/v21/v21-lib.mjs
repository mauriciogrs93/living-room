// v21 HTTP test helpers. Local server: plain fetch (x-forwarded-for picks the "IP").
// Private preview: VIA=<deployment url> routes every call through `vercel curl` (the CLI's own protection
// bypass; no token is created). Never prints keys, tokens, invite codes, watch codes or session cookies.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

export const BASE = (process.env.BASE || "http://localhost:3921").replace(/\/$/, "");
export const VIA = process.env.VIA || "";
export const PREVIEW = process.env.PREVIEW || VIA; // where test sign-in links come from (preview-only helper)
const VERCEL_BIN = process.env.VERCEL_BIN || `${process.env.HOME}/.local/bin/vercel`;
const SCOPE = "mauriciogrs93s-projects";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ORIGIN = VIA || BASE;

function parseRaw(text) {
  const blocks = text.replace(/\r/g, "").split("\n\n");
  let i = 0;
  while (i < blocks.length - 1 && /^HTTP\/[\d.]+ (1\d\d)/.test(blocks[i])) i += 1;
  const head = blocks[i] || "";
  const rest = blocks.slice(i + 1).join("\n\n");
  const status = Number((head.match(/^HTTP\/[\d.]+ (\d+)/) || [])[1] || 0);
  const hdrs = new Map();
  const cookies = [];
  for (const line of head.split("\n").slice(1)) {
    const c = line.indexOf(":");
    if (c <= 0) continue;
    const k = line.slice(0, c).trim().toLowerCase();
    const v = line.slice(c + 1).trim();
    if (k === "set-cookie") cookies.push(v);
    hdrs.set(k, hdrs.has(k) ? `${hdrs.get(k)}, ${v}` : v);
  }
  let json = null;
  try { json = JSON.parse(rest); } catch {}
  return { status, json, text: rest, cookies, headers: { get: (k) => hdrs.get(k.toLowerCase()) ?? null } };
}

function viaCurl(deployment, method, path, h, body) {
  const args = ["curl", path, "--deployment", deployment, "--scope", SCOPE, "--", "-s", "-i", "-X", method];
  for (const [k, v] of Object.entries(h)) if (k !== "x-forwarded-for") args.push("-H", `${k}: ${v}`);
  if (body !== undefined) args.push("--data-raw", typeof body === "string" ? body : JSON.stringify(body));
  return new Promise((resolve) => execFile(VERCEL_BIN, args, { maxBuffer: 16 << 20 }, (err, out) => resolve(parseRaw(String(out || "")))));
}

/** A cookie jar per actor (owner A, owner B, watcher, stranger). */
export class Jar {
  constructor() { this.map = new Map(); }
  take(setCookies) {
    for (const sc of setCookies || []) {
      const [pair, ...attrs] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const maxAge = attrs.map((a) => a.trim()).find((a) => /^max-age=/i.test(a));
      if (!value || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.map.delete(name);
      else this.map.set(name, value);
    }
  }
  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join("; "); }
  has(re) { return [...this.map.keys()].some((k) => re.test(k)); }
}

let ipN = 10 + Math.floor(Math.random() * 60000);
export const nextIp = () => `10.${21 + Math.floor(ipN / 62500)}.${Math.floor(ipN / 250) % 250}.${ipN++ % 250}`;

export async function call(method, path, { body, jar, token, ip, headers = {}, base } = {}) {
  const h = { "content-type": "application/json", origin: ORIGIN, ...headers };
  if (jar && jar.header()) h.cookie = jar.header();
  if (token) h.authorization = `Bearer ${token}`;
  h["x-forwarded-for"] = ip || nextIp();
  let res;
  const target = base ?? (VIA ? null : BASE);
  if (!target) res = await viaCurl(VIA, method, path, h, body);
  else {
    const r = await fetch(target + path, { method, headers: h, redirect: "manual", body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    res = { status: r.status, json, text, cookies: r.headers.getSetCookie?.() ?? [], headers: r.headers };
  }
  if (jar) jar.take(res.cookies);
  return res;
}

/** Test sign-in: the preview-only helper mints a one-time magic-link hash (no email); /auth/confirm turns it into a session. */
export async function signIn(email, { ip } = {}) {
  const token = readFileSync("/workspace/.secrets/v21-test-admin.token", "utf8").trim();
  const link = await viaCurl(PREVIEW, "POST", "/api/test-admin/link", { "content-type": "application/json", "x-v21-test-token": token }, { email });
  if (link.status !== 200 || !link.json?.tokenHash) return { ok: false, status: link.status, jar: new Jar() };
  const jar = new Jar();
  const res = await call("GET", `/auth/confirm?token_hash=${encodeURIComponent(link.json.tokenHash)}&type=magiclink`, { jar, ip });
  return { ok: res.status === 303 && jar.has(/^sb-.*-auth-token/) && !/signin=/.test(res.headers.get("location") || ""), status: res.status, location: (res.headers.get("location") || "").replace(/\?.*$/, ""), jar };
}

export const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${redact(detail)})` : ""}`);
}
export function redact(s) {
  return String(s ?? "")
    .replace(/(own|tok|lr|wss|acct)_[A-Za-z0-9_-]{8,}/g, "$1_…")
    .replace(/\b[a-z2-7]{26}\b/g, "<code>")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "<jwt>")
    .slice(0, 300);
}
export function done(label) {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n${label}: ${pass} passed, ${fail} failed, ${results.length} total`);
  return fail;
}
export const LINE_RE = /^Read (https?:\/\/[^\s]+)\/skill\.md and join the Living Room with invite ([a-z2-7]{26})\. Use it now; it works once\.$/;
export const WATCH_RE = /^(https?:\/\/[^\s#]+)\/room#watch=([a-z2-7]{26})$/;
export const uniq = () => Math.random().toString(36).slice(2, 8);

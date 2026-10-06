// Checks delete-test-users.mjs against a local stand-in for the Supabase Auth admin API (no real users touched).
//   node scripts/v21/delete-test-users-check.mjs
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const KEY = "stub-secret-key-do-not-print";
const users = [];
for (let i = 0; i < 1203; i += 1) users.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, email: i % 3 === 0 ? `v21t-run${i}@example.com` : `person${i}@example.org` });
users.push({ id: "00000000-0000-4000-8000-999999999999", email: "v21t-legacy-owner@example.com" });
users.push({ id: "00000000-0000-4000-8000-999999999998", email: "v21t-x@example.com.evil.org" }); // not a match
users.push({ id: "00000000-0000-4000-8000-999999999997", email: "founder@example.net" });
const deletes = [];
let authOk = true;
const server = createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${KEY}` || req.headers.apikey !== KEY) authOk = false;
  const u = new URL(req.url, "http://x");
  if (req.method === "GET" && u.pathname === "/auth/v1/admin/users") {
    const page = Number(u.searchParams.get("page") || 1);
    const per = Number(u.searchParams.get("per_page") || 50);
    const live = users.filter((x) => !deletes.includes(x.id));
    const slice = live.slice((page - 1) * per, page * per);
    res.writeHead(200, { "content-type": "application/json", "x-total-count": String(live.length) });
    return res.end(JSON.stringify({ users: slice.map((x) => ({ ...x, aud: "authenticated" })), aud: "authenticated" }));
  }
  const m = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(u.pathname);
  if (req.method === "DELETE" && m) {
    deletes.push(m[1]);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end("{}");
  }
  res.writeHead(404);
  res.end("{}");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const script = fileURLToPath(new URL("./delete-test-users.mjs", import.meta.url));
const runIt = (args) => new Promise((resolve) => execFile(process.execPath, [script, ...args], { env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SECRET_KEY: KEY } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr })));
const results = [];
const check = (n, ok, d = "") => { results.push(Boolean(ok)); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`); };
const expected = users.filter((x) => /^v21t-.*@example\.com$/.test(x.email)).length;
const dry = await runIt(["--dry-run"]);
check("dry run: counts matches across pages (1000 per page), keeps the legacy owner, deletes nothing", dry.code === 0 && dry.out.includes(`matching v21t-%@example.com: ${expected}`) && dry.out.includes("kept (v21t-legacy-owner@example.com): 1") && dry.out.includes(`would delete: ${expected - 1}`) && deletes.length === 0, dry.out.trim().split("\n").filter((l) => l.includes("[dry run]")).join(" | "));
check("dry run prints counts only (no key, no ids, no addresses)", !dry.out.includes(KEY) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(dry.out) && !/@example\.(com|org|net)\b(?!\))/.test(dry.out.replace(/v21t-%@example\.com|v21t-legacy-owner@example\.com/g, "")));
const real = await runIt([]);
const kept = users.filter((x) => !deletes.includes(x.id) && /^v21t-.*@example\.com$/.test(x.email)).map((x) => x.email);
check("real run deletes every v21t-…@example.com user except v21t-legacy-owner@example.com, nothing else", real.code === 0 && deletes.length === expected - 1 && kept.length === 1 && kept[0] === "v21t-legacy-owner@example.com" && !deletes.includes("00000000-0000-4000-8000-999999999998") && !deletes.includes("00000000-0000-4000-8000-999999999997"), real.out.trim().split("\n").slice(-2).join(" | "));
check("the admin API was called with the service key (never printed)", authOk && !real.out.includes(KEY));
const missing = await new Promise((resolve) => execFile(process.execPath, [script, "--dry-run"], { env: { PATH: process.env.PATH } }, (err, so, se) => resolve({ code: err ? err.code : 0, out: so + se })));
check("without credentials it refuses and does nothing", missing.code === 2 && /Missing SUPABASE_URL/.test(missing.out));
server.close();
const fail = results.filter((r) => !r).length;
console.log(`\ndelete-test-users-check: ${results.length - fail} passed, ${fail} failed, ${results.length} total`);
process.exit(fail ? 1 : 0);

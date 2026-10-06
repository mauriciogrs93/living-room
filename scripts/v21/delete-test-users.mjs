// v21 test-account clean-up (Supabase Auth admin API, server side). Founder-approved; run at ship time.
//   Dry run (lists counts only, changes nothing):  node scripts/v21/delete-test-users.mjs --dry-run
//   Real delete:                                    node scripts/v21/delete-test-users.mjs
// Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the
// environment, e.g. `vercel env run -e preview -- node scripts/v21/delete-test-users.mjs --dry-run`.
// Matches auth.users emails like 'v21t-%@example.com' and deletes all of them EXCEPT v21t-legacy-owner@example.com
// (owner of the claimed legacy room in v21_test; delete it before public go-live, see the runbook).
// Prints counts only: never keys, ids, tokens or addresses.
import { createRequire } from "node:module";

const DRY = process.argv.includes("--dry-run");
const KEEP = "v21t-legacy-owner@example.com";
const MATCH = /^v21t-.*@example\.com$/; // = SQL: email like 'v21t-%@example.com' (Auth stores emails lower-case)
const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY in the environment (nothing done).");
  process.exit(2);
}
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() { throw new Error("realtime not used"); } };
const require = createRequire(new URL("../../package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

async function listMatching() {
  const found = [];
  const perPage = 1000;
  for (let page = 1; page < 1000; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed (status ${error.status ?? 0})`);
    const users = data?.users ?? [];
    for (const u of users) {
      const email = String(u.email ?? "").toLowerCase();
      if (MATCH.test(email)) found.push({ id: u.id, keep: email === KEEP });
    }
    if (users.length < perPage) break;
  }
  return found;
}

try {
  const matched = await listMatching();
  const keep = matched.filter((u) => u.keep);
  const doomed = matched.filter((u) => !u.keep);
  console.log(`${DRY ? "[dry run] " : ""}auth.users matching v21t-%@example.com: ${matched.length}`);
  console.log(`${DRY ? "[dry run] " : ""}kept (v21t-legacy-owner@example.com): ${keep.length}`);
  console.log(`${DRY ? "[dry run] " : ""}${DRY ? "would delete" : "to delete"}: ${doomed.length}`);
  if (DRY) process.exit(0);
  let deleted = 0;
  let failed = 0;
  for (const u of doomed) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) failed += 1;
    else deleted += 1;
  }
  const after = await listMatching();
  console.log(`deleted: ${deleted}, failed: ${failed}`);
  console.log(`remaining matching v21t-%@example.com: ${after.length} (expected 1: the kept legacy owner)`);
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error).replace(/eyJ[\w.-]+|sb_secret_\w+/g, "<redacted>"));
  process.exit(1);
}

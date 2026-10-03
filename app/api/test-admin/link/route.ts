import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v21 TEST-ONLY sign-in helper for the private preview. REMOVE BEFORE THE PRODUCTION SHIP (runbook step 1).
 * Inert (404) unless ALL hold: VERCEL_ENV is "preview", V21_TEST_ADMIN_TOKEN (>= 32 chars) is set on this
 * deployment and matches the x-v21-test-token header, and the address is v21t-...@example.com (a reserved
 * domain that never receives mail). It creates the user as confirmed (Supabase admin API, server side, no
 * email sent) and returns a one-time magic-link token hash for GET /auth/confirm. Never logs anything.
 */
const EMAIL = /^v21t-[a-z0-9-]{1,40}@example\.com$/;

function notFound() {
  return Response.json({ ok: false, error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (process.env.VERCEL_ENV !== "preview") return notFound();
  const expected = process.env.V21_TEST_ADMIN_TOKEN ?? "";
  const given = req.headers.get("x-v21-test-token") ?? "";
  if (expected.length < 32 || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return notFound();
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) return notFound();
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const raw = body.value && typeof body.value === "object" ? (body.value as { email?: unknown }).email : "";
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return notFound();
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error && !/already|registered|exists/i.test(made.error.message)) {
    return Response.json({ ok: false, error: "create failed", status: made.error.status ?? 0 }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token ?? "";
  if (link.error || !tokenHash) {
    return Response.json({ ok: false, error: "link failed", status: link.error?.status ?? 0 }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, tokenHash, created: !made.error }, { headers: { "Cache-Control": "no-store" } });
}

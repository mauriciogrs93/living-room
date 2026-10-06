import { createHmac } from "node:crypto";
import { OwnerSecretMissing } from "@/lib/room/errors";

/**
 * v21: the apartment owner IS the account. The room's door keeps one owner hash; for an account that
 * hash is sha256 of this server-side identity. It is derived from the account id with a server secret,
 * is never sent to a browser, and can never be typed by a client: owner routes take it from the verified
 * session only, and agent routes accept only `own_` keys.
 *
 * r2 (Security): APARTMENT_OWNER_SECRET is REQUIRED in production (VERCEL_ENV=production). There is no
 * fallback to the Supabase secret key there: every account route fails closed with a 503 and one log line.
 * Previews and local runs may fall back (Supabase secret key, then a local-only constant off Vercel).
 */
let warned = false;

export function ownerSecret() {
  const own = (process.env.APARTMENT_OWNER_SECRET || "").trim();
  if (own) return own;
  if (process.env.VERCEL_ENV === "production") {
    if (!warned) {
      warned = true;
      console.error("[auth] APARTMENT_OWNER_SECRET is missing in production: account routes answer 503 (no fallback key).");
    }
    throw new OwnerSecretMissing();
  }
  const fallback = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (fallback) return fallback;
  if (process.env.VERCEL_ENV === "preview") throw new OwnerSecretMissing();
  return "lr-local-dev-only";
}

export function accountIdentity(userId: string) {
  return `acct_${createHmac("sha256", ownerSecret()).update(`lr-owner|${userId}`).digest("hex")}`;
}

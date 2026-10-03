import { createHmac } from "node:crypto";

/**
 * v21: the apartment owner IS the account. The room's door keeps one owner hash; for an account that
 * hash is sha256 of this server-side identity. It is derived from the account id with a server secret,
 * is never sent to a browser, and can never be typed by a client: owner routes take it from the verified
 * session only, and agent routes accept only `own_` keys.
 */
function secret() {
  const raw = (process.env.APARTMENT_OWNER_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (raw) return raw;
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") throw new Error("No owner identity secret configured.");
  return "lr-local-dev-only";
}

export function accountIdentity(userId: string) {
  return `acct_${createHmac("sha256", secret()).update(`lr-owner|${userId}`).digest("hex")}`;
}

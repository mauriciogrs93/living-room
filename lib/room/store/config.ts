/** Server store. The secret key never uses a NEXT_PUBLIC name. */
export function supabaseConfig(): { url: string; secret: string } | null {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !secret) return null;
  return { url, secret };
}

/** Browser keys for a later Realtime client. Unused by the server store. */
export function supabasePublicConfig(): { url: string; publishable: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const publishable = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url || !publishable) return null;
  return { url, publishable };
}

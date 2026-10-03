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

/**
 * v19: optional RPC name prefix for an isolated test namespace (e.g. "v19t_" -> public.v19t_room_read,
 * backed by schema v19_test). Empty (the default) keeps the live functions, so production is unchanged.
 * A malformed value throws rather than silently falling back to the live room.
 */
export function roomRpcPrefix(): string {
  const raw = (process.env.ROOM_RPC_PREFIX || "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z0-9]{0,15}_$/.test(raw)) throw new Error("ROOM_RPC_PREFIX must look like v19t_");
  return raw;
}

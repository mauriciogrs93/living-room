import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/apartments/auth";

/** Service-role client. Uses the existing secret env vars. Never sent to the browser. */
export function adminClient(): SupabaseClient | null {
  const config = authConfig();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!config || !key) return null;
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Sets app_metadata.lr_password_set. The only writer of that flag. */
export async function markPasswordSet(userId: string) {
  const admin = adminClient();
  if (!admin) return { ok: false as const, status: 0, code: "no_admin" };
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { lr_password_set: true } });
  if (error) return { ok: false as const, status: error.status ?? 0, code: error.code ?? "" };
  return { ok: true as const };
}

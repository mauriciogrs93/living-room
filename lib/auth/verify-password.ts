import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/apartments/auth";

/**
 * Checks a current password without touching the browser session.
 * The client does not persist cookies and is thrown away after the call.
 */
export async function passwordMatches(email: string, password: string) {
  const config = authConfig();
  if (!config) return false;
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

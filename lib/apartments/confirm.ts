import type { EmailOtpType } from "@supabase/supabase-js";
import { baseUrl } from "@/lib/http";
import { authClient } from "./auth";

const TYPES = new Set(["magiclink", "email", "signup", "invite", "recovery", "email_change"]);

/**
 * v21 sign-in link landing. Two shapes, both server side:
 *   ?code=...                      PKCE (Supabase's default {{ .ConfirmationURL }} redirect; same browser)
 *   ?token_hash=...&type=magiclink  the token-hash template ({{ .SiteURL }}/auth/confirm?...; any browser)
 * On success: session cookies are set and the browser goes to /room (which provisions the apartment).
 */
export async function confirmSignIn(req: Request) {
  const url = new URL(req.url);
  const origin = baseUrl(req);
  const fail = (why: string) => redirect(`${origin}/room?signin=${why}`, []);
  const auth = authClient(req);
  if (!auth) return fail("unavailable");
  const code = url.searchParams.get("code") ?? "";
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "magiclink";
  if (code) {
    const { error } = await auth.client.auth.exchangeCodeForSession(code);
    if (error) return redirect(`${origin}/room?signin=expired`, auth.setCookies());
  } else if (tokenHash && TYPES.has(type)) {
    const { error } = await auth.client.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (error) return redirect(`${origin}/room?signin=expired`, auth.setCookies());
  } else {
    return fail("invalid");
  }
  return redirect(`${origin}/room`, auth.setCookies());
}

function redirect(location: string, cookies: string[]) {
  const res = new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

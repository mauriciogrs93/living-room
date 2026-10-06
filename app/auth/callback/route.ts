import { authClient } from "@/lib/apartments/auth";
import { safeNext } from "@/lib/apartments/next-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v21 r2 sign-in link landing: the PKCE flow only. Supabase's default magic-link email links to its own
 * /auth/v1/verify, which redirects here with ?code=...; exchangeCodeForSession needs the code verifier cookie
 * that POST /api/auth/otp set in THIS browser, so the link only signs in the browser that asked for it.
 * There is no token-hash or typed-code path on the server. `next` is honoured only as a same-site path.
 * Redirects are relative (same origin as this request), so a preview stays on its preview URL.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  // Supabase reports an expired or used link with ?error=...&error_code=... (no code).
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) return redirect("/room?signin=expired", []);
  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 512) return redirect("/room?signin=invalid", []);
  const auth = authClient(req);
  if (!auth) return redirect("/room?signin=unavailable", []);
  let failed = false;
  try {
    const { error } = await auth.client.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  if (failed) return redirect("/room?signin=expired", auth.setCookies());
  return redirect(next, auth.setCookies());
}

function redirect(location: string, cookies: string[]) {
  const res = new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

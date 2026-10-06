import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, serializeAuthCookie } from "@/lib/apartments/auth";
import { readSessionExpiry } from "@/lib/auth/session-cookie";

const REFRESH_WITHIN_S = 120;
const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token/;

/**
 * Refresh a Supabase session only when its access token is within two minutes of expiry.
 * Signed-out requests, and tokens with time left, make no Auth call.
 */
export async function proxy(request: NextRequest) {
  const all = request.cookies.getAll();
  if (!all.some((cookie) => AUTH_COOKIE.test(cookie.name))) return NextResponse.next();
  const exp = readSessionExpiry(all);
  if (exp !== null && exp - Math.floor(Date.now() / 1000) > REFRESH_WITHIN_S) return NextResponse.next();
  const config = authConfig();
  if (!config) return NextResponse.next();
  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const item of list) request.cookies.set(item.name, item.value);
          response = NextResponse.next({ request });
          for (const item of list) response.headers.append("Set-Cookie", serializeAuthCookie(item));
        },
      },
      auth: { flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
    });
    await supabase.auth.getUser();
  } catch {
    return NextResponse.next();
  }
  return response;
}

// Literal on purpose: Next reads this at build time and will not follow an imported constant.
export const config = { matcher: ["/room", "/room/:path*", "/account/:path*", "/api/me"] };

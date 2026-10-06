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
  let failed = !(await exchange(auth.client, code));
  // "Send it again" starts a second PKCE flow and the default verifier follows the newest one, so an earlier
  // email's link would fail. This browser keeps up to 5 pending verifiers (one per request it made); try those
  // too. Only verifiers this browser holds can work, so another browser still can't use the link.
  if (failed) {
    for (const flowId of pendingFlowIds(req)) {
      if (await exchange(auth.client, code, flowId)) {
        failed = false;
        break;
      }
    }
  }
  if (failed) return redirect("/room?signin=expired", auth.setCookies());
  return redirect(next, auth.setCookies());
}

type AuthClient = NonNullable<ReturnType<typeof authClient>>["client"];

async function exchange(client: AuthClient, code: string, flowId?: string) {
  try {
    const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    return !error;
  } catch {
    return false;
  }
}

/** Flow ids of this browser's pending PKCE verifiers (sb-<ref>-auth-token-flow-<id>-code-verifier), newest last. */
function pendingFlowIds(req: Request) {
  const ids: string[] = [];
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const m = /^\s*sb-[a-z0-9]+-auth-token-flow-([A-Za-z0-9_-]{8,64})-code-verifier=/.exec(part);
    if (m && !ids.includes(m[1]!)) ids.push(m[1]!);
  }
  return ids.reverse().slice(0, 5);
}

function redirect(location: string, cookies: string[]) {
  const res = new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

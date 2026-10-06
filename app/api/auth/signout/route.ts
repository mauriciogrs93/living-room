import { OWNER_COOKIE, ownerJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient } from "@/lib/apartments/auth";
import { WATCH_COOKIE, withCookies } from "@/lib/apartments/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Same-origin POST. Revokes this session on Supabase, then clears auth, owner, and watch cookies. */
export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const auth = authClient(req);
  const cleared = new Set<string>();
  if (auth) {
    await auth.client.auth.signOut({ scope: "local" }).catch((error: { status?: number; code?: string }) => {
      console.warn("[auth] sign out failed", error?.status ?? 0, error?.code ?? "");
    });
  }
  const cookies = auth ? auth.setCookies() : [];
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const name = part.slice(0, part.indexOf("=")).trim();
    if (/^sb-[a-z0-9]+-auth-token/.test(name)) cleared.add(name);
  }
  if ((req.headers.get("cookie") ?? "").includes(`${OWNER_COOKIE}=`)) cleared.add(OWNER_COOKIE);
  if ((req.headers.get("cookie") ?? "").includes(`${WATCH_COOKIE}=`)) cleared.add(WATCH_COOKIE);
  for (const name of cleared) cookies.push(clearCookie(name));
  return withCookies(ownerJson({ ok: true }), cookies);
});

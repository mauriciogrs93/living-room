import { ownerJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { authClient } from "@/lib/apartments/auth";
import { withCookies } from "@/lib/apartments/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  const auth = authClient(req);
  if (!auth) return ownerJson({ ok: true });
  await auth.client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return withCookies(ownerJson({ ok: true }), auth.setCookies());
});

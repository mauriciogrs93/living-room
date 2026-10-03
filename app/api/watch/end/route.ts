import { ownerJson, sameOrigin } from "@/lib/http";
import { guarded } from "@/lib/room/guard";
import { watchCookie } from "@/lib/apartments/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = guarded(async (req) => {
  if (!sameOrigin(req)) return ownerJson({ ok: false, error: "Wrong origin." }, 403);
  return ownerJson({ ok: true }, 200, { "Set-Cookie": watchCookie("", 0) });
});

import { json, preflight } from "@/lib/http";
import { viewerContext } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";
import { houseSky, previewHouseSky, previewSky, skyBody, skyCellFromHeaders } from "@/lib/room/house-sky";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

export function OPTIONS() {
  return preflight();
}

export const GET = guarded(async (req) => {
  const viewer = await viewerContext(req);
  if (viewer instanceof Response) return viewer;
  if (!viewer) return json({ ok: false, error: "Sign in to see the sky." }, 401, PRIVATE);
  const forced = previewSky(req);
  const sky = forced ? previewHouseSky(forced) : await houseSky(skyCellFromHeaders(req.headers));
  return json(skyBody(sky), 200, PRIVATE);
});

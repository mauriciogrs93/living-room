import { json, preflight } from "@/lib/http";
import { viewerContext } from "@/lib/apartments/resolve";
import { guarded } from "@/lib/room/guard";
import { houseSky } from "@/lib/room/house-sky";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const GET = guarded(async (req) => {
  const viewer = await viewerContext(req);
  if (viewer instanceof Response) return viewer;
  if (!viewer) return json({ ok: false, error: "Sign in to see the sky." }, 401);
  const sky = await houseSky();
  return json({ ok: true, summary: sky.summary, temp: sky.temp, rain: sky.rain, source: sky.source });
});

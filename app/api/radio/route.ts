import { clientIp, json, preflight, readJson } from "@/lib/http";
import { getEngine, roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import { stationsNear } from "@/lib/room/stations";
import type { RadioStation } from "@/lib/room/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export const POST = guarded(post);

async function post(req: Request) {
  try {
    const engine = getEngine();
    const limit = await engine.allow(`radio:${clientIp(req)}`, 20, 60_000);
    if (!limit.ok) {
      return json({ ok: false, error: "Too many radio changes. Wait a moment." }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const body = await readJson(req);
    if (!body.ok) return body.response;
    const value = body.value && typeof body.value === "object" ? (body.value as { intent?: unknown; lat?: unknown; lon?: unknown }) : {};
    const intent = typeof value.intent === "string" ? value.intent : "";
    if (intent !== "on" && intent !== "off" && intent !== "next" && intent !== "tune") {
      return json({ ok: false, error: 'Send {"intent":"on"}, "off", "next", or "tune".' }, 400);
    }
    let stations: RadioStation[] | undefined;
    const lat = typeof value.lat === "number" ? value.lat : Number.NaN;
    const lon = typeof value.lon === "number" ? value.lon : Number.NaN;
    if (intent !== "off" && Number.isFinite(lat) && Number.isFinite(lon) && (await engine.stationsStale())) {
      stations = await stationsNear(lat, lon);
    }
    const mapped = intent === "tune" ? "next" : intent;
    return json(await engine.controlRadio(mapped, stations));
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
}

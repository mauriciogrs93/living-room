import { forbiddenViewer, viewerContext, withCookies } from "@/lib/apartments/resolve";
import { roomFailure } from "@/lib/room/access";
import { guarded } from "@/lib/room/guard";
import type { Snapshot } from "@/lib/room/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v21: owner-only viewing. The signed-in owner or a valid watch session gets its OWN apartment's state;
 * anyone else gets 403. A 1 s in-process cache, keyed by apartment id (resolved from the caller's own
 * credential BEFORE the cache is consulted), so one apartment's state can never be served to another.
 * The browser and CDN never cache it (private, no-store; Vary: Cookie).
 */
const STATE_CACHE_MS = 1000;
type Entry = { at: number; body: string };
const cache = new Map<string, Entry>();
const flights = new Map<string, Promise<Entry>>();

function respond(body: string, hit: boolean, setCookies: string[]) {
  const res = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-State-Cache": hit ? "hit" : "miss",
    },
  });
  return withCookies(res, setCookies);
}

export const GET = guarded(async (req) => {
  try {
    const viewer = await viewerContext(req);
    if (viewer instanceof Response) return viewer;
    if (!viewer) return forbiddenViewer();
    const key = viewer.apartmentId;
    const saved = cache.get(key);
    if (saved && Date.now() - saved.at < STATE_CACHE_MS) return respond(saved.body, true, viewer.setCookies);
    let flight = flights.get(key);
    if (!flight) {
      const started = Date.now();
      flight = viewer.room
        .snapshot()
        .then((snap: Snapshot) => {
          const entry = { at: started, body: JSON.stringify(snap) };
          cache.set(key, entry);
          if (cache.size > 1000) cache.delete(cache.keys().next().value!);
          return entry;
        })
        .finally(() => flights.delete(key));
      flights.set(key, flight);
    }
    const entry = await flight;
    return respond(entry.body, false, viewer.setCookies);
  } catch (error) {
    const failure = roomFailure(error);
    if (failure) return failure;
    throw error;
  }
});

import { FALLBACK_STATIONS } from "./house";
import type { RadioStation } from "./types";

const SERVERS = ["https://de1.api.radio-browser.info", "https://fi1.api.radio-browser.info"];

export async function stationsNear(lat: number, lon: number): Promise<RadioStation[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return FALLBACK_STATIONS.map((station) => ({ ...station }));
  const query = `geo_lat=${encodeURIComponent(String(lat))}&geo_long=${encodeURIComponent(String(lon))}&geo_distance=120&limit=20&hidebroken=true&order=clickcount&reverse=true`;
  for (const origin of SERVERS) {
    try {
      const response = await fetch(`${origin}/json/stations/search?${query}`, {
        headers: { "user-agent": "living-room/1.0" },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) continue;
      const rows = (await response.json()) as { name?: string; url_resolved?: string }[];
      const stations: RadioStation[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const url = typeof row.url_resolved === "string" ? row.url_resolved.trim() : "";
        const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim().slice(0, 48) : "";
        if (!name || !url.startsWith("https://") || seen.has(url)) continue;
        seen.add(url);
        stations.push({ name, url });
        if (stations.length >= 8) break;
      }
      if (stations.length > 0) return stations;
    } catch {
      /* try the next mirror */
    }
  }
  return FALLBACK_STATIONS.map((station) => ({ ...station }));
}

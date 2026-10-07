/** House-region sky from NWS. The browser only calls same-origin /api/sky. */
const USER_AGENT = "LivingRoom/5c (local preview)";
const CACHE_MS = 20 * 60 * 1000;

/** NYC, already on a 0.1° cell. Used when the edge has no usable geo headers. */
export const HOUSE_CELL = { lat: 40.7, lon: -74.0 };

export type SkyCell = { lat: number; lon: number };

export type HouseSky = {
  summary: string | null;
  temp: string | null;
  rain: boolean;
  source: "nws" | "house";
};

type Cached = { at: number; summary: string | null; temp: string | null; rain: boolean };
type HeaderSource = { get(name: string): string | null };

const caches = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached>>();

/** About 0.1°. Coarser than the raw IP header, and stable as a cache key. */
export function roundTenth(value: number) {
  return Number(value.toFixed(1));
}

export function roundCell(lat: number, lon: number): SkyCell {
  return { lat: roundTenth(lat), lon: roundTenth(lon) };
}

export function skyCellFromHeaders(headers: HeaderSource): SkyCell {
  const latRaw = headers.get("x-vercel-ip-latitude");
  const lonRaw = headers.get("x-vercel-ip-longitude");
  if (!latRaw || !lonRaw) return { ...HOUSE_CELL };
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ...HOUSE_CELL };
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ...HOUSE_CELL };
  return roundCell(lat, lon);
}

function cellKey(cell: SkyCell) {
  return `${cell.lat.toFixed(1)},${cell.lon.toFixed(1)}`;
}

/** weather.gov points URL for an already-rounded cell. */
export function pointsUrl(cell: SkyCell) {
  const rounded = roundCell(cell.lat, cell.lon);
  return `https://api.weather.gov/points/${rounded.lat.toFixed(1)},${rounded.lon.toFixed(1)}`;
}

export function forecastUrlAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "api.weather.gov";
  } catch {
    return false;
  }
}

/** Preview-only sky. Production never honors ?sky=, even when the value is rain or clear. */
export function previewSky(req: Request): "rain" | "clear" | null {
  if (process.env.VERCEL_ENV === "production") return null;
  try {
    const sky = new URL(req.url).searchParams.get("sky");
    if (sky === "rain" || sky === "clear") return sky;
  } catch {
    return null;
  }
  return null;
}

export function previewHouseSky(mode: "rain" | "clear"): HouseSky {
  return { summary: mode === "rain" ? "Rain" : "Clear", temp: null, rain: mode === "rain", source: "house" };
}

/** Public JSON. Coordinates never leave the server. */
export function skyBody(sky: HouseSky) {
  return { ok: true as const, summary: sky.summary, temp: sky.temp, rain: sky.rain, source: sky.source };
}

export function resetHouseSkyCache() {
  caches.clear();
  inflight.clear();
}

async function pull(url: string, signal: AbortSignal, hops = 0): Promise<unknown> {
  if (!forecastUrlAllowed(url) || hops > 2) throw new Error("blocked forecast host");
  const res = await fetch(url, {
    signal,
    redirect: "manual",
    headers: { accept: "application/geo+json", "user-agent": USER_AGENT },
  });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new Error("sky redirect");
    return pull(new URL(location, url).toString(), signal, hops + 1);
  }
  if (!res.ok) throw new Error("sky unavailable");
  return res.json();
}

async function load(cell: SkyCell, signal: AbortSignal): Promise<Cached> {
  const points = (await pull(pointsUrl(cell), signal)) as { properties?: { forecast?: unknown } };
  const forecastUrl = typeof points.properties?.forecast === "string" ? points.properties.forecast : "";
  const forecast = (await pull(forecastUrl, signal)) as {
    properties?: { periods?: Array<{ shortForecast?: unknown; temperature?: unknown; temperatureUnit?: unknown }> };
  };
  const period = forecast.properties?.periods?.[0];
  const summary = typeof period?.shortForecast === "string" ? period.shortForecast.slice(0, 80) : null;
  const degrees = typeof period?.temperature === "number" ? Math.round(period.temperature) : null;
  const unit = period?.temperatureUnit === "C" ? "C" : "F";
  const temp = degrees === null ? null : `${degrees} ${unit}`;
  const rain = typeof summary === "string" && /rain|shower|drizzle/i.test(summary);
  return { at: Date.now(), summary, temp, rain };
}

export async function houseSky(cell: SkyCell = HOUSE_CELL, now = Date.now()): Promise<HouseSky> {
  const rounded = roundCell(cell.lat, cell.lon);
  const key = cellKey(rounded);
  const hit = caches.get(key);
  if (hit && now - hit.at < CACHE_MS) {
    return { summary: hit.summary, temp: hit.temp, rain: hit.rain, source: "nws" };
  }
  try {
    let pending = inflight.get(key);
    if (!pending) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 3500);
      pending = load(rounded, ac.signal).finally(() => {
        clearTimeout(timer);
        inflight.delete(key);
      });
      inflight.set(key, pending);
    }
    const got = await pending;
    caches.set(key, got);
    return { summary: got.summary, temp: got.temp, rain: got.rain, source: "nws" };
  } catch {
    return { summary: null, temp: null, rain: false, source: "house" };
  }
}

/** House-region sky from NWS. The browser only calls same-origin /api/sky. */
const POINT = "https://api.weather.gov/points/40.71,-74.01";
const USER_AGENT = "LivingRoom/5c (local preview)";
const CACHE_MS = 20 * 60 * 1000;

export type HouseSky = {
  summary: string | null;
  temp: string | null;
  rain: boolean;
  source: "nws" | "house";
};

type Cached = { at: number; summary: string | null; temp: string | null; rain: boolean };

let cache: Cached | null = null;
let inflight: Promise<Cached> | null = null;

export function forecastUrlAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "api.weather.gov";
  } catch {
    return false;
  }
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

async function load(signal: AbortSignal): Promise<Cached> {
  const points = (await pull(POINT, signal)) as { properties?: { forecast?: unknown } };
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

export async function houseSky(now = Date.now()): Promise<HouseSky> {
  if (cache && now - cache.at < CACHE_MS) {
    return { summary: cache.summary, temp: cache.temp, rain: cache.rain, source: "nws" };
  }
  try {
    if (!inflight) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 3500);
      inflight = load(ac.signal).finally(() => {
        clearTimeout(timer);
        inflight = null;
      });
    }
    const got = await inflight;
    cache = got;
    return { summary: got.summary, temp: got.temp, rain: got.rain, source: "nws" };
  } catch {
    return { summary: null, temp: null, rain: false, source: "house" };
  }
}

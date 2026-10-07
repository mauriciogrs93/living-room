/**
 * v19 house clock: one clock in the owner's time zone drives the window text, the time-of-day,
 * night mode (real sunset, civil twilight) and the corner label. No visitor location is used.
 */
export const HOUSE_TZ = process.env.NEXT_PUBLIC_HOUSE_TZ || "America/New_York";
export const HOUSE_ZONE_LABEL = process.env.NEXT_PUBLIC_HOUSE_ZONE_LABEL || "Eastern Time";
/** A coarse reference point for the sun in the owner's zone (New York). Not a visitor location. */
const HOUSE_LAT = Number(process.env.NEXT_PUBLIC_HOUSE_LAT || 40.71);
const HOUSE_LON = Number(process.env.NEXT_PUBLIC_HOUSE_LON || -74.01);

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let fmt = partsCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" });
    partsCache.set(tz, fmt);
  }
  return fmt;
}

export function houseTime(now: number | Date = Date.now(), tz = HOUSE_TZ) {
  const date = typeof now === "number" ? new Date(now) : now;
  let hour = 0;
  let minute = 0;
  for (const part of formatter(tz).formatToParts(date)) {
    if (part.type === "hour") hour = Number(part.value) % 24;
    if (part.type === "minute") minute = Number(part.value);
  }
  return { hour, minute, fractional: hour + minute / 60 };
}

export function houseClockLabel(now: number | Date = Date.now(), tz = HOUSE_TZ) {
  const { hour, minute } = houseTime(now, tz);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "EASTERN TIME · 1:16 PM" */
export function houseCorner(now: number | Date = Date.now()) {
  return `${HOUSE_ZONE_LABEL.toUpperCase()} · ${houseClockLabel(now)}`;
}

/** Solar elevation in degrees (NOAA approximation, good to ~0.5°). */
export function sunElevation(now: number | Date = Date.now(), lat = HOUSE_LAT, lon = HOUSE_LON) {
  const date = typeof now === "number" ? new Date(now) : now;
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (day - 1 + (hours - 12) / 24);
  const eqtime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolarMin = hours * 60 + eqtime + 4 * lon;
  const ha = (trueSolarMin / 4 - 180) * rad;
  const cosZen = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZen))) / rad;
}

/** Night = the sun below civil twilight (−6°) at the house. */
export function houseNight(now: number | Date = Date.now()) {
  return sunElevation(now) < -6;
}

export function houseDusk(now: number | Date = Date.now()) {
  return sunElevation(now) < 6;
}

const HORIZON = -0.833;

function asDate(now: number | Date) {
  return typeof now === "number" ? new Date(now) : now;
}

/** Civil date in the house zone, used to memo sunrise and sunset once per house day. */
export function houseDateKey(now: number | Date = Date.now(), tz = HOUSE_TZ) {
  const date = asDate(now);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(date);
}

function offsetMinutes(tz: string, at: number) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset", hour: "numeric" });
  const name = fmt.formatToParts(new Date(at)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** Local noon in the house zone, as a UTC timestamp. */
function localNoon(now: number | Date, tz = HOUSE_TZ) {
  const date = asDate(now);
  const key = houseDateKey(date, tz);
  const [year, month, day] = key.split("-").map(Number);
  const guess = Date.UTC(year!, month! - 1, day!, 12, 0, 0);
  const off = offsetMinutes(tz, guess);
  return guess - off * 60_000;
}

function bisect(lo: number, hi: number, falling: boolean, lat: number, lon: number) {
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    const above = sunElevation(mid, lat, lon) > HORIZON;
    if (falling ? above : !above) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2 / 60_000) * 60_000;
}

/** Sunset: the sun crossing −0.833° between solar noon and twelve hours later. Minutes only. */
export function sunsetTime(now: number | Date = Date.now(), lat = HOUSE_LAT, lon = HOUSE_LON) {
  const noon = localNoon(now);
  let peak = noon;
  let best = sunElevation(noon, lat, lon);
  for (let step = -180; step <= 180; step += 10) {
    const at = noon + step * 60_000;
    const elev = sunElevation(at, lat, lon);
    if (elev > best) {
      best = elev;
      peak = at;
    }
  }
  return new Date(bisect(peak, peak + 12 * 60 * 60_000, true, lat, lon));
}

/** The next sunrise after that day's sunset. */
export function sunriseTime(now: number | Date = Date.now(), lat = HOUSE_LAT, lon = HOUSE_LON) {
  const set = sunsetTime(now, lat, lon).getTime();
  return new Date(bisect(set, set + 18 * 60 * 60_000, false, lat, lon));
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { HOUSE_ZONE_LABEL, houseClockLabel, houseDusk, houseNight, houseTime } from "@/lib/house-clock";

export type SkyKind = "sun" | "clouds" | "rain" | "snow" | "fog" | "night";

type Atmosphere = {
  sky: SkyKind;
  hour: number;
  dusk: boolean;
  night: boolean;
  label: string;
  clock: string;
  place: string;
  lat: number | null;
  lon: number | null;
};

const FALLBACK: Atmosphere = {
  sky: "sun",
  hour: 14,
  dusk: false,
  night: false,
  label: "Clear",
  clock: "",
  place: "",
  lat: null,
  lon: null,
};

const AtmosphereContext = createContext<Atmosphere>(FALLBACK);

export function useAtmosphere() {
  return useContext(AtmosphereContext);
}

/**
 * v19: one house clock in the owner's time zone. No location prompt, no IP lookup,
 * and no weather call: nothing about the visitor leaves the browser.
 * Night follows the real sunset at the house (sun below −6°). sessionStorage overrides stay for QA.
 */
function readForcedHour() {
  try {
    const forced = sessionStorage.getItem("living-room-hour");
    if (forced == null || forced === "") return null;
    const value = Number(forced);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function readForcedSky(): SkyKind | null {
  try {
    const forced = sessionStorage.getItem("living-room-sky");
    if (forced === "sun" || forced === "clouds" || forced === "rain" || forced === "snow" || forced === "fog" || forced === "night") return forced;
  } catch {
    /* no override */
  }
  return null;
}

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [forcedHour, setForcedHour] = useState<number | null>(null);
  const [forcedSky, setForcedSky] = useState<SkyKind | null>(null);

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      setForcedHour(readForcedHour());
      setForcedSky(readForcedSky());
    };
    tick();
    // align to the minute so the corner clock turns over on time
    let interval: number | undefined;
    const first = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => {
      window.clearTimeout(first);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  const value = useMemo<Atmosphere>(() => {
    const house = houseTime(now);
    const hour = forcedHour ?? house.fractional;
    const night = forcedHour != null ? forcedHour >= 21 || forcedHour < 5 : houseNight(now);
    const dusk = forcedHour != null ? forcedHour >= 18 || forcedHour < 7 : houseDusk(now);
    const base: SkyKind = forcedSky ?? "sun";
    const skyNow: SkyKind = night && base !== "rain" && base !== "snow" && base !== "fog" ? "night" : base;
    return {
      sky: skyNow,
      hour,
      dusk,
      night: skyNow === "night" || night,
      label: "",
      clock: houseClockLabel(now),
      place: HOUSE_ZONE_LABEL,
      lat: null,
      lon: null,
    };
  }, [now, forcedHour, forcedSky]);

  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

export function WeatherChip() {
  const { clock, place } = useAtmosphere();
  return (
    <span className="glass-chip pointer-events-none h-9 px-3 text-[12px]">
      {place}
      {clock ? ` · ${clock}` : ""}
    </span>
  );
}

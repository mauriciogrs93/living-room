"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

const LABELS: Record<SkyKind, string> = {
  sun: "Clear",
  clouds: "Cloudy",
  rain: "Rain",
  snow: "Snow",
  fog: "Fog",
  night: "Night",
};

function skyFrom(code: number, hour: number): SkyKind {
  const stars = hour >= 21 || hour < 5;
  if (code >= 71 && code <= 77) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (stars) return "night";
  if (code <= 1) return "sun";
  return "clouds";
}

function clockLabel(hour: number) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const hr = h % 12 || 12;
  const minutes = String(new Date().getMinutes()).padStart(2, "0");
  return `${hr}:${minutes} ${h < 12 ? "AM" : "PM"}`;
}

async function browserPoint(): Promise<{ lat: number; lon: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 3500 },
    );
  });
}

async function ipPoint(): Promise<{ lat: number; lon: number; place: string } | null> {
  try {
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { latitude?: string; longitude?: string; city?: string };
    const lat = Number(data.latitude);
    const lon = Number(data.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, place: data.city ?? "" };
  } catch {
    try {
      const res = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { latitude?: number; longitude?: number; city?: string; success?: boolean };
      if (data.success === false || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return null;
      return { lat: data.latitude!, lon: data.longitude!, place: data.city ?? "" };
    } catch {
      return null;
    }
  }
}

export function paintSkyCanvas(kind: SkyKind) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const paint = ctx.createLinearGradient(0, 0, 0, 96);
  if (kind === "night") {
    paint.addColorStop(0, "#141a33");
    paint.addColorStop(1, "#2a3358");
  } else   if (kind === "rain") {
    paint.addColorStop(0, "#5c6b78");
    paint.addColorStop(1, "#2d3a46");
  } else if (kind === "snow") {
    paint.addColorStop(0, "#d5dde6");
    paint.addColorStop(1, "#8ea0b3");
  } else if (kind === "fog") {
    paint.addColorStop(0, "#c5c8c4");
    paint.addColorStop(1, "#8d918c");
  } else if (kind === "clouds") {
    paint.addColorStop(0, "#9eb4c9");
    paint.addColorStop(1, "#d7e2ea");
  } else {
    paint.addColorStop(0, "#7eb6e0");
    paint.addColorStop(1, "#f2d7a2");
  }
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 128, 96);
  if (kind === "sun") {
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(92, 28, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === "night") {
    ctx.fillStyle = "#f7f4ea";
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 37) % 120 + 4;
      const y = (i * 19) % 70 + 6;
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
  }
  if (kind === "clouds" || kind === "rain" || kind === "snow") {
    ctx.fillStyle = kind === "rain" ? "rgba(210,218,224,0.28)" : "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(40, 36, 22, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(78, 44, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === "rain") {
    ctx.strokeStyle = "rgba(232,242,248,0.85)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 19) % 120 + 4;
      const y = (i * 13) % 70 + 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 16);
      ctx.stroke();
    }
  }
  if (kind === "snow") {
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 22; i += 1) {
      ctx.fillRect((i * 23) % 118 + 4, (i * 17) % 80 + 6, 3, 3);
    }
  }
  return canvas;
}

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [hour, setHour] = useState(14);
  const [sky, setSky] = useState<SkyKind>("sun");
  const [place, setPlace] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);

  useEffect(() => {
    const readHour = () => {
      const forced = sessionStorage.getItem("living-room-hour");
      const next = forced != null && forced !== "" ? Number(forced) : new Date().getHours();
      setHour(Number.isFinite(next) ? next : new Date().getHours());
    };
    readHour();
    const timer = window.setInterval(readHour, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const forced = sessionStorage.getItem("living-room-sky");
      if (forced === "sun" || forced === "clouds" || forced === "rain" || forced === "snow" || forced === "fog" || forced === "night") {
        setSky(forced);
      }
      const cached = sessionStorage.getItem("living-room-weather");
      if (cached) {
        try {
          const saved = JSON.parse(cached) as { at: number; sky: SkyKind; place: string; lat: number; lon: number };
          if (Date.now() - saved.at < 20 * 60 * 1000) {
            if (!forced) setSky(saved.sky);
            setPlace(saved.place);
            setLat(saved.lat);
            setLon(saved.lon);
            return;
          }
        } catch {
          /* fetch again */
        }
      }
      const point = (await browserPoint()) ?? (await ipPoint());
      if (!point || cancelled) return;
      setLat(point.lat);
      setLon(point.lon);
      const named = "place" in point && typeof point.place === "string" ? point.place : "";
      setPlace(named);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&current=weather_code,is_day`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return;
        const data = (await res.json()) as { current?: { weather_code?: number } };
        const code = Number(data.current?.weather_code ?? 0);
        const hourNow = Number(sessionStorage.getItem("living-room-hour") ?? new Date().getHours());
        const next = skyFrom(code, Number.isFinite(hourNow) ? hourNow : new Date().getHours());
        if (!cancelled && !sessionStorage.getItem("living-room-sky")) setSky(next);
        sessionStorage.setItem(
          "living-room-weather",
          JSON.stringify({ at: Date.now(), sky: next, place: named, lat: point.lat, lon: point.lon }),
        );
      } catch {
        /* keep the last sky */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<Atmosphere>(() => {
    const dusk = hour >= 18 || hour < 7;
    const stars = hour >= 21 || hour < 5;
    const skyNow: SkyKind = stars && sky !== "rain" && sky !== "snow" && sky !== "fog" ? "night" : sky;
    return {
      sky: skyNow,
      hour,
      dusk,
      night: skyNow === "night" || hour >= 21 || hour < 5,
      label: LABELS[skyNow],
      clock: clockLabel(hour),
      place,
      lat,
      lon,
    };
  }, [hour, sky, place, lat, lon]);

  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

export function WeatherChip() {
  const { label, clock, place } = useAtmosphere();
  const where = place ? `${label} in ${place}` : label;
  return (
    <span className="glass-chip pointer-events-none h-9 px-3 text-[12px] text-[#2c241e]">
      {where}
      {clock ? ` · ${clock}` : ""}
    </span>
  );
}

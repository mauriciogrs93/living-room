"use client";

import { useEffect, useRef } from "react";
import { useAmbience } from "@/components/room/ambience";
import { useAtmosphere } from "@/components/room/atmosphere";
import { MAQUETTE } from "@/components/room/maquette/config";
import { releaseWatch } from "@/components/hud/frame/one-player";
import type { LiveSnapshot } from "@/components/use-room";

type Intent = "on" | "off" | "next" | "prev" | "tune";

let sendRadio: (intent: Intent, station?: number) => void = () => {};
let notice: (message: string) => void = () => {};

export function tapRadio(intent: Intent, station?: number) {
  sendRadio(intent, station);
}

export function onRadioNotice(fn: (message: string) => void) {
  notice = fn;
  return () => {
    if (notice === fn) notice = () => {};
  };
}

export function RadioBridge({ snapshot }: { snapshot: LiveSnapshot | null }) {
  const { lat, lon } = useAtmosphere();
  const { stopRadio } = useAmbience();
  const heard = useRef(false);
  const latRef = useRef(lat);
  const lonRef = useRef(lon);
  latRef.current = lat;
  lonRef.current = lon;

  useEffect(() => {
    if (!snapshot?.radio.on) heard.current = false;
  }, [snapshot?.radio.on]);

  useEffect(() => {
    async function send(intent: Intent, station?: number) {
      if (intent === "off") {
        stopRadio();
        heard.current = false;
      }
      try {
        const body: { intent: Intent; station?: number; lat: number | null; lon: number | null } = {
          intent,
          lat: latRef.current,
          lon: lonRef.current,
        };
        if (intent === "tune") body.station = station;
        const res = await fetch("/api/radio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { on?: boolean; url?: string };
        if (!res.ok) {
          notice("fail");
          return;
        }
        if (data.on && intent !== "off") {
          releaseWatch();
          heard.current = true;
        }
        if (!data.on) stopRadio();
        notice("");
      } catch {
        notice("fail");
      }
    }
    sendRadio = (intent, station) => {
      if (!MAQUETTE.hudFrame && intent === "on" && heard.current) void send("next");
      else void send(intent, station);
    };
    return () => {
      sendRadio = () => {};
    };
  }, [stopRadio]);

  return null;
}

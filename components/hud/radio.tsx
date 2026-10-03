"use client";

import { useEffect, useRef } from "react";
import { useAmbience } from "@/components/room/ambience";
import { useAtmosphere } from "@/components/room/atmosphere";
import type { LiveSnapshot } from "@/components/use-room";

type Intent = "on" | "off" | "next";

let sendRadio: (intent: Intent) => void = () => {};

export function tapRadio(intent: Intent) {
  sendRadio(intent);
}

export function RadioBridge({ snapshot }: { snapshot: LiveSnapshot | null }) {
  const { lat, lon } = useAtmosphere();
  const { hear, stopRadio } = useAmbience();
  const heard = useRef(false);
  const latRef = useRef(lat);
  const lonRef = useRef(lon);
  latRef.current = lat;
  lonRef.current = lon;

  useEffect(() => {
    if (!snapshot?.radio.on) heard.current = false;
  }, [snapshot?.radio.on]);

  useEffect(() => {
    async function send(intent: Intent) {
      if (intent === "off") {
        stopRadio();
        heard.current = false;
      }
      try {
        const res = await fetch("/api/radio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intent, lat: latRef.current, lon: lonRef.current }),
        });
        const data = (await res.json()) as { on?: boolean; url?: string };
        if (!res.ok) return;
        if (data.on && data.url && intent !== "off") {
          heard.current = true;
          hear(data.url);
        }
        if (!data.on) stopRadio();
      } catch {
        /* the card keeps the last station name from the snapshot */
      }
    }
    sendRadio = (intent) => {
      if (intent === "on" && heard.current) void send("next");
      else void send(intent);
    };
    return () => {
      sendRadio = () => {};
    };
  }, [hear, stopRadio]);

  return null;
}

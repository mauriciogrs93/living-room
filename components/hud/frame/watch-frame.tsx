"use client";

import { useEffect, useRef } from "react";
import { acceptPlayerEvent, playerCommand, watchEmbed, YT_ORIGIN } from "@/lib/room/watch-live";

/** Mounts the embed once. Later mute changes post a command and leave src alone. */
export function WatchFrame({ channelId, muted }: { channelId: number; muted: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef<string | null>(null);
  if (srcRef.current === null) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    srcRef.current = watchEmbed(channelId, { muted, origin });
  }
  const src = srcRef.current;

  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    if (!frame || !src) return;
    frame.postMessage(playerCommand(muted ? "mute" : "unMute"), YT_ORIGIN);
  }, [muted, src]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow ?? null;
      if (!acceptPlayerEvent(event.origin, event.source, frame)) return;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!src) return null;
  return (
    <iframe
      ref={frameRef}
      className="hudf-watch"
      title="Watch live"
      src={src}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

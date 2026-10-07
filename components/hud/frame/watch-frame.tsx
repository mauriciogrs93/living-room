"use client";

import { useEffect, useRef } from "react";
import { acceptPlayerEvent, embedOrigin, playerCommand, watchEmbed, YT_ORIGIN } from "@/lib/room/watch-live";

/** Mounts the embed once. Later mute changes post a command and leave src alone. */
export function WatchFrame({ channelId, muted }: { channelId: number; muted: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef<string | null>(null);
  const ready = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  if (srcRef.current === null) {
    const origin = typeof window === "undefined" ? "" : embedOrigin(window.location);
    srcRef.current = watchEmbed(channelId, { origin });
  }
  const src = srcRef.current;

  function onLoad() {
    const node = frameRef.current;
    if (!node?.src.startsWith(`${YT_ORIGIN}/`)) return;
    ready.current = true;
    const frame = node.contentWindow;
    if (!frame || mutedRef.current) return;
    frame.postMessage(playerCommand("unMute"), YT_ORIGIN);
  }

  useEffect(() => {
    if (!ready.current) return;
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(playerCommand(muted ? "mute" : "unMute"), YT_ORIGIN);
  }, [muted]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow ?? null;
      if (event.origin !== YT_ORIGIN || event.source !== frame) return;
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
      onLoad={onLoad}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { acceptPlayerEvent, embedOrigin, playerCommand, playerListening, readPlayerSignal, watchEmbed, YT_ORIGIN } from "@/lib/room/watch-live";
import { PLAY, WATCH_CANT_PLAY, WATCH_PLAY_LABEL } from "./strings";

const FAIL_MS = 10_000;

/** Mounts the embed once, only after Watch live. Later mute changes post a command and leave src alone. */
export function WatchFrame({ channelId, muted }: { channelId: number; muted: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef<string | null>(null);
  const ready = useRef(false);
  const playing = useRef(false);
  const offered = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"wait" | "play" | "playing" | "failed">("wait");
  const [playerState, setPlayerState] = useState<number | null>(null);
  if (srcRef.current === null) {
    const origin = typeof window === "undefined" ? "" : embedOrigin(window.location);
    srcRef.current = watchEmbed(channelId, { origin });
  }
  const src = srcRef.current;

  function noteSignal(data: unknown) {
    const signal = readPlayerSignal(data);
    if (signal.error) {
      setPhase("failed");
      return;
    }
    if (signal.ready) ready.current = true;
    if (signal.state === null) return;
    setPlayerState(signal.state);
    if (signal.state === 1) {
      playing.current = true;
      setPhase("playing");
      return;
    }
    if (ready.current && (signal.state === -1 || signal.state === 2 || signal.state === 5) && !playing.current) {
      offered.current = true;
      setPhase("play");
    }
  }

  function subscribe(frame: Window) {
    frame.postMessage(playerListening(), YT_ORIGIN);
    frame.postMessage(playerCommand("addEventListener", ["onReady"]), YT_ORIGIN);
    frame.postMessage(playerCommand("addEventListener", ["onStateChange"]), YT_ORIGIN);
    frame.postMessage(playerCommand("addEventListener", ["onError"]), YT_ORIGIN);
  }

  function onLoad() {
    const node = frameRef.current;
    if (!node?.src.startsWith(`${YT_ORIGIN}/`)) return;
    ready.current = true;
    const frame = node.contentWindow;
    if (!frame) return;
    subscribe(frame);
  }

  function retry() {
    const node = frameRef.current;
    const frame = node?.contentWindow;
    if (frame && node?.src.startsWith(`${YT_ORIGIN}/`)) {
      frame.postMessage(playerCommand("playVideo"), YT_ORIGIN);
      return;
    }
    playing.current = false;
    offered.current = false;
    ready.current = false;
    setPlayerState(null);
    setPhase("wait");
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    if (!ready.current || !muted) return;
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(playerCommand("mute"), YT_ORIGIN);
  }, [muted]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow ?? null;
      if (event.origin !== YT_ORIGIN || event.source !== frame) return;
      if (!acceptPlayerEvent(event.origin, event.source, frame)) return;
      noteSignal(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (playing.current || offered.current) return;
      setPhase("failed");
    }, FAIL_MS);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  if (!src) return null;
  return (
    <>
      <iframe
        key={attempt}
        ref={frameRef}
        className="hudf-watch"
        title="Watch live"
        src={src}
        data-player-state={playerState === null ? "" : String(playerState)}
        onLoad={onLoad}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {phase === "play" ? (
        <button type="button" className="hudf-watch-play" data-ctl="tv-play" aria-label={WATCH_PLAY_LABEL} onClick={retry}>
          <span aria-hidden="true">▶</span>
          {PLAY}
        </button>
      ) : null}
      {phase === "failed" ? <p className="hudf-watch-fail">{WATCH_CANT_PLAY}</p> : null}
    </>
  );
}

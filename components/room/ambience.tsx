"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LiveSnapshot } from "@/components/use-room";
import { useAtmosphere } from "./atmosphere";

type AmbienceValue = {
  muted: boolean;
  hearing: boolean;
  toggleMute: () => void;
  hear: (url: string) => void;
  stopRadio: () => void;
};

const muteListeners = new Set<() => void>();

function readMuted() {
  try {
    return localStorage.getItem("living-room-mute") !== "0";
  } catch {
    return true;
  }
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem("living-room-mute", muted ? "1" : "0");
  } catch {
    /* the button still works this visit */
  }
  for (const listener of muteListeners) listener();
}

function subscribeMute(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

const AmbienceContext = createContext<AmbienceValue>({
  muted: true,
  hearing: false,
  toggleMute: () => {},
  hear: () => {},
  stopRadio: () => {},
});

export function useAmbience() {
  return useContext(AmbienceContext);
}

export function Ambience({ snapshot, children }: { snapshot: LiveSnapshot | null; children: ReactNode }) {
  const { sky } = useAtmosphere();
  const muted = useSyncExternalStore(subscribeMute, readMuted, () => true);
  const [hearing, setHearing] = useState(false);
  const radioOn = Boolean(snapshot?.radio.on);
  const [seenRadio, setSeenRadio] = useState(radioOn);
  if (radioOn !== seenRadio) {
    setSeenRadio(radioOn);
    if (!radioOn) setHearing(false);
  }
  const mutedRef = useRef(true);
  const hearingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rainRef = useRef<GainNode | null>(null);
  const kettleRef = useRef<GainNode | null>(null);
  const heardUrl = useRef("");

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    hearingRef.current = hearing;
  }, [hearing]);

  useEffect(() => {
    const arm = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-mute]")) return;
      try {
        if (localStorage.getItem("living-room-mute") === "1") return;
      } catch {
        return;
      }
      if (!readMuted()) return;
      writeMuted(false);
    };
    window.addEventListener("pointerdown", arm);
    return () => window.removeEventListener("pointerdown", arm);
  }, []);

  function context() {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const rain = ctx.createGain();
      rain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      const rainSource = ctx.createBufferSource();
      rainSource.buffer = buffer;
      rainSource.loop = true;
      rainSource.connect(filter);
      filter.connect(rain);
      rain.connect(ctx.destination);
      rainSource.start();
      const kettle = ctx.createGain();
      kettle.gain.value = 0;
      const tone = ctx.createOscillator();
      tone.type = "sine";
      tone.frequency.value = 310;
      tone.connect(kettle);
      kettle.connect(ctx.destination);
      tone.start();
      rainRef.current = rain;
      kettleRef.current = kettle;
      ctxRef.current = ctx;
    }
    return ctxRef.current;
  }

  useEffect(() => {
    if (muted) {
      if (rainRef.current) rainRef.current.gain.value = 0;
      if (kettleRef.current) kettleRef.current.gain.value = 0;
      audioRef.current?.pause();
      return;
    }
    const ctx = context();
    if (ctx?.state === "suspended") void ctx.resume();
    const wet = sky === "rain" || sky === "snow";
    if (rainRef.current) rainRef.current.gain.value = wet ? 0.045 : 0;
    const heating = snapshot?.objects.some((object) => object.id === "kettle" && object.state.heating === true) ?? false;
    if (kettleRef.current) kettleRef.current.gain.value = heating ? 0.03 : 0;
  }, [muted, sky, snapshot]);

  useEffect(() => {
    if (muted || !snapshot) return;
    const walking = snapshot.agents.some((agent) => agent.pose === "walking");
    if (!walking) return;
    const ctx = context();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 140;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  }, [muted, snapshot]);

  useEffect(() => {
    if (!snapshot?.radio.on) {
      audioRef.current?.pause();
      return;
    }
    if (!hearingRef.current || mutedRef.current) return;
    const url = snapshot.radio.url;
    const audio = audioRef.current;
    if (!audio || !url || heardUrl.current === url) return;
    heardUrl.current = url;
    audio.src = url;
    void audio.play().catch(() => setHearing(false));
  }, [snapshot?.radio.on, snapshot?.radio.url]);

  const barked = useRef(false);
  useEffect(() => {
    if (snapshot?.dog.mode !== "bark") {
      barked.current = false;
      return;
    }
    if (muted || barked.current) return;
    barked.current = true;
    const ctx = context();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }, [muted, snapshot?.dog.mode]);

  const value: AmbienceValue = {
    muted,
    hearing,
    toggleMute: () => {
      const next = !readMuted();
      writeMuted(next);
      const audio = audioRef.current;
      if (!audio) return;
      if (next) {
        audio.pause();
        return;
      }
      if (audio.getAttribute("src")) {
        void audio.play().catch(() => undefined);
        return;
      }
      const url = snapshot?.radio.on && snapshot.radio.url.startsWith("https://") ? snapshot.radio.url : "";
      if (!url) return;
      heardUrl.current = url;
      audio.src = url;
      setHearing(true);
      void audio.play().catch(() => setHearing(false));
    },
    hear: (url: string) => {
      const audio = audioRef.current;
      if (!url || !audio) return;
      writeMuted(false);
      heardUrl.current = url;
      audio.src = url;
      setHearing(true);
      void audio.play().catch(() => setHearing(false));
    },
    stopRadio: () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      setHearing(false);
      heardUrl.current = "";
    },
  };

  return (
    <AmbienceContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" />
    </AmbienceContext.Provider>
  );
}

export function MuteButton() {
  const { muted, toggleMute } = useAmbience();
  return (
    <button type="button" data-mute="" className="glass-chip h-11 px-3 text-[13px]" onClick={toggleMute} aria-pressed={muted}>
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}

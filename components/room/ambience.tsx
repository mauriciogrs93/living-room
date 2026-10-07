"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LiveSnapshot } from "@/components/use-room";
import { createRadioPlayback, type PlaybackSnapshot } from "@/lib/room/radio-playback";
import { mutePillMayUnmute, stationRowMayUnmute } from "@/lib/room/room-sound";
import { useAtmosphere } from "./atmosphere";

type AmbienceValue = {
  muted: boolean;
  held: boolean;
  hearing: boolean;
  blocked: boolean;
  started: boolean;
  soundOff: boolean;
  toggleMute: () => void;
  pressMutePill: () => void;
  playBlocked: () => void;
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

/** The user switched Room sound off. A missing key is the default mute, not that switch. */
export function roomSoundOff(): boolean {
  try {
    return localStorage.getItem("living-room-mute") === "1";
  } catch {
    return true;
  }
}

let radioAudio: HTMLAudioElement | null = null;
let playback: ReturnType<typeof createRadioPlayback> | null = null;
let playSnap: PlaybackSnapshot = { blocked: false, hearing: false, started: false, index: 0 };
const playListeners = new Set<() => void>();
let pillHeld = false;
const heldListeners = new Set<() => void>();

function publishPlay(state: PlaybackSnapshot) {
  playSnap = state;
  for (const listener of playListeners) listener();
}

function subscribePlay(listener: () => void) {
  playListeners.add(listener);
  return () => {
    playListeners.delete(listener);
  };
}

function readPlay() {
  return playSnap;
}

function ensurePlayback(audio: HTMLAudioElement) {
  if (playback && radioAudio === audio) return playback;
  radioAudio = audio;
  playback = createRadioPlayback(audio, {
    deviceMuted: () => roomSoundOff() || readHeld(),
    onChange: publishPlay,
  });
  audio.addEventListener("playing", () => playback?.onPlaying());
  return playback;
}

function readHeld() {
  return pillHeld;
}

function writeHeld(next: boolean) {
  if (pillHeld === next) return;
  pillHeld = next;
  for (const listener of heldListeners) listener();
}

function subscribeHeld(listener: () => void) {
  heldListeners.add(listener);
  return () => {
    heldListeners.delete(listener);
  };
}

/** Local station-row tap only. Joins the fixed station for this index. Does not touch the YouTube player. */
export function unmuteFromStationTap(index: number) {
  if (!stationRowMayUnmute(roomSoundOff(), "station-row")) return;
  writeHeld(false);
  writeMuted(false);
  playback?.tuneGesture(index);
}

/** The blocked-autoplay Play button. One gesture, then the playing event clears blocked. */
export function playBlocked() {
  if (roomSoundOff() || readHeld()) return;
  playback?.gesture();
}

/** Mute pill: this device only. Room sound off always wins. Mute drops the stream. */
export function pressMutePill() {
  if (readHeld()) {
    if (!mutePillMayUnmute(roomSoundOff())) return;
    writeHeld(false);
    playback?.unmute();
    return;
  }
  if (roomSoundOff()) return;
  writeHeld(true);
  playback?.mute();
}

const AmbienceContext = createContext<AmbienceValue>({
  muted: true,
  held: false,
  hearing: false,
  blocked: false,
  started: false,
  soundOff: false,
  toggleMute: () => {},
  pressMutePill: () => {},
  playBlocked: () => {},
  stopRadio: () => {},
});

export function useAmbience() {
  return useContext(AmbienceContext);
}

export function Ambience({ snapshot, children }: { snapshot: LiveSnapshot | null; children: ReactNode }) {
  const { sky } = useAtmosphere();
  const muted = useSyncExternalStore(subscribeMute, readMuted, () => true);
  const held = useSyncExternalStore(subscribeHeld, readHeld, () => false);
  const soundOff = useSyncExternalStore(subscribeMute, roomSoundOff, () => false);
  const play = useSyncExternalStore(subscribePlay, readPlay, readPlay);
  const hearing = play.hearing;
  const blocked = play.blocked;
  const started = play.started;
  const radioOn = Boolean(snapshot?.radio.on);
  const [seenRadio, setSeenRadio] = useState(radioOn);
  if (radioOn !== seenRadio) {
    setSeenRadio(radioOn);
    if (!radioOn) writeHeld(false);
  }
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rainRef = useRef<GainNode | null>(null);
  const kettleRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    ensurePlayback(audio);
    return () => {
      if (radioAudio === audio) radioAudio = null;
    };
  }, []);

  useEffect(() => {
    const arm = () => {
      if (readMuted()) return;
      const ctx = ctxRef.current;
      if (ctx?.state === "suspended") void ctx.resume();
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
    if (!audioRef.current) return;
    ensurePlayback(audioRef.current);
    if (!snapshot?.radio.on) {
      playback?.stop();
      return;
    }
    // Index only. A URL on the snapshot is ignored, including one injected by an agent.
    playback?.follow(snapshot.radio.index, snapshot.radio.url);
  }, [snapshot?.radio.on, snapshot?.radio.index, snapshot?.radio.url]);

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
    held,
    hearing,
    blocked,
    started,
    soundOff,
    toggleMute: () => {
      const next = !readMuted();
      writeMuted(next);
      if (!audioRef.current) return;
      ensurePlayback(audioRef.current);
      if (next) {
        writeHeld(false);
        playback?.mute();
        return;
      }
      writeHeld(false);
      if (snapshot?.radio.on) playback?.unmute();
    },
    pressMutePill,
    playBlocked,
    stopRadio: () => {
      writeHeld(false);
      if (audioRef.current) ensurePlayback(audioRef.current);
      playback?.stop();
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

"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LiveSnapshot } from "@/components/use-room";
import { createRadioPlayback, type PlaybackSnapshot, type RadioSink } from "@/lib/room/radio-playback";
import { mutePillMayUnmute, roomSoundStoredOff } from "@/lib/room/room-sound";
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
  failed: boolean;
  playFromCard: () => void;
  stopRadio: () => void;
};

const muteListeners = new Set<() => void>();

/** Room sound is off unless this device stored "0". A missing key is Off. */
export function roomSoundOff(): boolean {
  try {
    return roomSoundStoredOff(localStorage.getItem("living-room-mute"));
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

let radioAudio: RadioSink | null = null;
let playback: ReturnType<typeof createRadioPlayback> | null = null;
let playSnap: PlaybackSnapshot = { blocked: false, hearing: false, started: false, index: 0, failed: false };
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

const boundAudio = new WeakSet<HTMLAudioElement>();

export function connectRadio(audio: RadioSink) {
  radioAudio = audio;
  playback = createRadioPlayback(audio, {
    roomSoundOff,
    deviceHeld: () => pillHeld,
    onChange: publishPlay,
  });
  return playback;
}

function ensurePlayback(audio: HTMLAudioElement) {
  if (!boundAudio.has(audio)) {
    boundAudio.add(audio);
    audio.addEventListener("playing", () => playback?.onPlaying());
    audio.addEventListener("error", () => playback?.onMediaError());
  }
  if (playback && radioAudio === audio) return playback;
  return connectRadio(audio);
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

/** The Play button only. Turns Room sound on, clears a device mute, and starts STATIONS[index]. */
export function playFromCard() {
  writeMuted(false);
  writeHeld(false);
  playback?.gesture();
}

/** The Room sound switch. Off stops audio. On does not start it. */
export function setRoomSoundOff(off: boolean) {
  writeMuted(off);
  writeHeld(false);
  if (off) playback?.mute();
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
  soundOff: true,
  failed: false,
  toggleMute: () => {},
  pressMutePill: () => {},
  playFromCard: () => {},
  stopRadio: () => {},
});

export function useAmbience() {
  return useContext(AmbienceContext);
}

export function Ambience({ snapshot, children }: { snapshot: LiveSnapshot | null; children: ReactNode }) {
  const { sky } = useAtmosphere();
  const soundOff = useSyncExternalStore(subscribeMute, roomSoundOff, () => true);
  const muted = soundOff;
  const held = useSyncExternalStore(subscribeHeld, readHeld, () => false);
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
      if (roomSoundOff()) return;
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
    playback?.follow(snapshot.radio.index);
  }, [snapshot?.radio.on, snapshot?.radio.index]);

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
    failed: play.failed,
    soundOff,
    toggleMute: () => {
      if (audioRef.current) ensurePlayback(audioRef.current);
      setRoomSoundOff(!roomSoundOff());
    },
    pressMutePill,
    playFromCard: () => {
      if (audioRef.current) ensurePlayback(audioRef.current);
      playFromCard();
    },
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

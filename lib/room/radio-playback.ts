import { stationIndex, stationUrl } from "./fixed-stations";

/** The bits of HTMLAudioElement this device drives. */
export type RadioSink = {
  src: string;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  load(): void;
  pause(): void;
  play(): Promise<void>;
};

export type PlaybackSnapshot = {
  blocked: boolean;
  hearing: boolean;
  started: boolean;
  index: number;
  failed: boolean;
};

/**
 * This device's radio. Stream URLs come only from the fixed station list.
 * Room sound Off refuses every play() and every src write.
 * Nothing starts until the Play tap. A media failure does not retry.
 */
export function createRadioPlayback(
  audio: RadioSink,
  opts: {
    roomSoundOff: () => boolean;
    deviceHeld: () => boolean;
    onChange: (state: PlaybackSnapshot) => void;
  },
) {
  let blocked = false;
  let hearing = false;
  let started = false;
  let failed = false;
  let index = 0;

  function emit() {
    opts.onChange({ blocked, hearing, started, index, failed });
  }

  function drop() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    hearing = false;
  }

  /** Room sound Off wins. Pause, drop src, and refuse. */
  function roomOff(): boolean {
    if (!opts.roomSoundOff()) return false;
    drop();
    emit();
    return true;
  }

  /** This device tapped Mute. Station changes stay silent. */
  function heldMute(): boolean {
    if (!opts.deviceHeld()) return false;
    drop();
    emit();
    return true;
  }

  function assign() {
    audio.src = stationUrl(index);
  }

  function catchPlay(pending: Promise<void> | undefined) {
    if (!pending || typeof pending.catch !== "function") return;
    pending.catch((err: unknown) => {
      const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
      blocked = true;
      hearing = false;
      failed = name !== "NotAllowedError" && name !== "AbortError";
      emit();
    });
  }

  function playAuto() {
    if (roomOff()) return;
    if (heldMute()) return;
  }

  return {
    /** The audio element fired playing. Clears the blocked and failed states. */
    onPlaying() {
      blocked = false;
      failed = false;
      hearing = true;
      started = true;
      emit();
    },
    /**
     * The element failed to play the current src.
     * The argument is ignored so a MediaError message never reaches the UI.
     * Does not retry and does not change src.
     */
    onMediaError(_detail?: unknown) {
      void _detail;
      if (!audio.getAttribute("src")) return;
      blocked = true;
      hearing = false;
      failed = true;
      emit();
    },
    state(): PlaybackSnapshot {
      return { blocked, hearing, started, index, failed };
    },
    /**
     * A station change. Only the index is accepted.
     * While Room sound is off, this device is muted, or the last attempt failed,
     * src is left untouched or dropped and play() is not called.
     */
    follow(nextIndex: number) {
      index = stationIndex(nextIndex);
      if (failed) return;
      if (roomOff()) return;
      if (heldMute()) return;
      if (!hearing) return;
      const url = stationUrl(index);
      if (audio.getAttribute("src") === url) return;
      assign();
      catchPlay(audio.play());
    },
    /** Automatic play never starts a stream. Room sound Off still drops src. */
    playAuto,
    /** A Play tap, after Room sound is on and the device mute is cleared. */
    gesture() {
      if (roomOff()) return;
      if (heldMute()) return;
      failed = false;
      blocked = false;
      assign();
      catchPlay(audio.play());
    },
    /** A station-row change. Same refusal rules as follow. */
    tuneGesture(nextIndex: number) {
      index = stationIndex(nextIndex);
      if (failed) return;
      if (roomOff()) return;
      if (heldMute()) return;
      if (!hearing) return;
      assign();
      catchPlay(audio.play());
    },
    mute() {
      drop();
      blocked = false;
      failed = false;
      emit();
    },
    unmute() {
      if (roomOff()) return;
      if (heldMute()) return;
      failed = false;
      blocked = false;
      assign();
      catchPlay(audio.play());
    },
    stop() {
      drop();
      blocked = false;
      failed = false;
      hearing = false;
      started = false;
      emit();
    },
  };
}

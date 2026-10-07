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
};

/**
 * This device's radio. Stream URLs come only from the fixed station list.
 * A muted device drops src and never calls play, including after a station change.
 * Automatic play is attempted once. A rejection marks blocked until the playing event.
 */
export function createRadioPlayback(
  audio: RadioSink,
  opts: {
    deviceMuted: () => boolean;
    onChange: (state: PlaybackSnapshot) => void;
  },
) {
  let blocked = false;
  let hearing = false;
  let started = false;
  let index = 0;
  let autoTried = false;

  function emit() {
    opts.onChange({ blocked, hearing, started, index });
  }

  function drop() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    hearing = false;
  }

  function assign() {
    const url = stationUrl(index);
    if (audio.getAttribute("src") !== url) audio.src = url;
  }

  function catchPlay(pending: Promise<void> | undefined) {
    if (!pending || typeof pending.catch !== "function") return;
    pending.catch(() => {
      blocked = true;
      hearing = false;
      emit();
    });
  }

  function playAuto() {
    if (opts.deviceMuted()) {
      drop();
      emit();
      return;
    }
    if (autoTried) return;
    autoTried = true;
    assign();
    catchPlay(audio.play());
  }

  return {
    /** The audio element fired playing. Clears the blocked autoplay state. */
    onPlaying() {
      blocked = false;
      hearing = true;
      started = true;
      autoTried = true;
      emit();
    },
    state(): PlaybackSnapshot {
      return { blocked, hearing, started, index };
    },
    /**
     * A station change. `roomUrl` is ignored: only the index is accepted.
     * While this device is muted the stream is dropped and play() is not called.
     */
    follow(nextIndex: number, roomUrl?: unknown) {
      void roomUrl;
      index = stationIndex(nextIndex);
      if (opts.deviceMuted()) {
        drop();
        emit();
        return;
      }
      const url = stationUrl(index);
      const same = audio.getAttribute("src") === url;
      if (hearing && same) return;
      if (hearing) {
        audio.src = url;
        catchPlay(audio.play());
        return;
      }
      if (autoTried) return;
      playAuto();
    },
    /** A tap. Joins the live edge of the fixed station for the current index. */
    gesture() {
      if (opts.deviceMuted()) return;
      autoTried = true;
      blocked = false;
      assign();
      catchPlay(audio.play());
    },
    /** A station-row tap. Sets the index, then joins that fixed URL. */
    tuneGesture(nextIndex: number) {
      index = stationIndex(nextIndex);
      if (opts.deviceMuted()) {
        drop();
        emit();
        return;
      }
      autoTried = true;
      blocked = false;
      assign();
      catchPlay(audio.play());
    },
    mute() {
      drop();
      blocked = false;
      emit();
    },
    unmute() {
      if (opts.deviceMuted()) return;
      autoTried = true;
      blocked = false;
      assign();
      catchPlay(audio.play());
    },
    stop() {
      drop();
      blocked = false;
      hearing = false;
      started = false;
      autoTried = false;
      emit();
    },
  };
}

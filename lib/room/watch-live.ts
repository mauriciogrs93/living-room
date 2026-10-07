/** Curated house-channel embeds. The iframe is created only after Watch live. */
const HOST = "https://www.youtube-nocookie.com/embed/";
export const YT_ORIGIN = "https://www.youtube-nocookie.com";

const VIDEO_IDS: Record<number, string> = {
  1: "jNQXAC9IVRw",
  2: "M7lc1UVf-VE",
  3: "aqz-KE-bpKQ",
  4: "kJQP7kiw5Fk",
  5: "YE7VzlLtp-4",
};

/** Page origin only. A query string, path, or room field is rejected. */
export function embedOrigin(loc: { origin: string }): string {
  const origin = loc.origin;
  if (!/^https?:\/\/[^/?#\s]+$/.test(origin)) return "";
  return origin;
}

/**
 * mute=1 is a fixed literal on every embed. Callers pass window.location.origin.
 * This module does not read the query string or the room snapshot.
 */
export function watchEmbed(channelId: number, opts?: { origin?: string }): string {
  const id = VIDEO_IDS[channelId] ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
  const origin = opts?.origin && embedOrigin({ origin: opts.origin }) === opts.origin ? `&origin=${encodeURIComponent(opts.origin)}` : "";
  return `${HOST}${id}?rel=0&modestbranding=1&autoplay=1&mute=1&playsinline=1&enablejsapi=1${origin}`;
}

export function playerCommand(func: "mute" | "playVideo" | "addEventListener", args: string | string[] = "") {
  return JSON.stringify({ event: "command", func, args });
}

export function playerListening() {
  return JSON.stringify({ event: "listening", id: "1", channel: "widget" });
}

/** Player events from the nocookie frame. state 1 is playing. onError is a failure. */
export function readPlayerSignal(data: unknown): { state: number | null; error: boolean; ready: boolean } {
  let message = data;
  if (typeof data === "string") {
    try {
      message = JSON.parse(data);
    } catch {
      return { state: null, error: false, ready: false };
    }
  }
  if (!message || typeof message !== "object") return { state: null, error: false, ready: false };
  const event = (message as { event?: unknown }).event;
  const info = (message as { info?: unknown }).info;
  if (event === "onReady") return { state: null, error: false, ready: true };
  if (event === "onError") return { state: null, error: true, ready: false };
  if (event === "onStateChange" && typeof info === "number") return { state: info, error: false, ready: false };
  if (event === "infoDelivery" && info && typeof info === "object" && typeof (info as { playerState?: unknown }).playerState === "number") {
    return { state: (info as { playerState: number }).playerState, error: false, ready: false };
  }
  return { state: null, error: false, ready: false };
}

/** Inbound player messages are accepted only from this iframe on the nocookie origin. */
export function acceptPlayerEvent(origin: string, source: object | null, frame: object | null) {
  return origin === YT_ORIGIN && frame !== null && source === frame;
}

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
  return `${HOST}${id}?rel=0&modestbranding=1&autoplay=1&mute=1&enablejsapi=1${origin}`;
}

export function playerCommand(func: "mute" | "unMute") {
  return JSON.stringify({ event: "command", func, args: "" });
}

/** Inbound player messages are accepted only from this iframe on the nocookie origin. */
export function acceptPlayerEvent(origin: string, source: object | null, frame: object | null) {
  return origin === YT_ORIGIN && frame !== null && source === frame;
}

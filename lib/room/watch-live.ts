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

/**
 * mute=1 is a fixed literal, added only when the caller says Room sound is already off.
 * This module does not read the query string or the room snapshot.
 */
export function watchEmbed(channelId: number, opts?: { muted?: boolean; origin?: string }): string {
  const id = VIDEO_IDS[channelId] ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
  const origin = opts?.origin ? `&origin=${encodeURIComponent(opts.origin)}` : "";
  const quiet = opts?.muted ? "&mute=1" : "";
  return `${HOST}${id}?rel=0&modestbranding=1&autoplay=1&enablejsapi=1${origin}${quiet}`;
}

export function playerCommand(func: "mute" | "unMute") {
  return JSON.stringify({ event: "command", func, args: "" });
}

/** Inbound player messages are accepted only from this iframe on the nocookie origin. */
export function acceptPlayerEvent(origin: string, source: object | null, frame: object | null) {
  return origin === YT_ORIGIN && frame !== null && source === frame;
}

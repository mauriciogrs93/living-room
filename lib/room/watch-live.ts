/** Curated house-channel embeds. The iframe is created only after Watch live. */
const HOST = "https://www.youtube-nocookie.com/embed/";

const VIDEO_IDS: Record<number, string> = {
  1: "jNQXAC9IVRw",
  2: "M7lc1UVf-VE",
  3: "aqz-KE-bpKQ",
  4: "kJQP7kiw5Fk",
  5: "YE7VzlLtp-4",
};

export function watchEmbed(channelId: number): string {
  const id = VIDEO_IDS[channelId] ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
  return `${HOST}${id}?rel=0&modestbranding=1&autoplay=1`;
}

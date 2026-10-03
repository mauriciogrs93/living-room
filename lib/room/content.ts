export type Channel = { id: number; name: string; color: string; accent: string };

export const CHANNELS: Channel[] = [
  { id: 1, name: "Meadow", color: "#6fa35a", accent: "#e5f2c4" },
  { id: 2, name: "Midnight News", color: "#3c6d94", accent: "#d5e6f6" },
  { id: 3, name: "Cartoon Hour", color: "#f0c14b", accent: "#ff8fab" },
  { id: 4, name: "Rain", color: "#8d99a6", accent: "#e6eef3" },
  { id: 5, name: "Supper Club", color: "#e07a3d", accent: "#f8d4b2" },
];

export const BOOKS = [
  "The Summer Book",
  "A Room with a View",
  "Kitchen",
  "Piranesi",
  "The Little Prince",
  "Before the Coffee Gets Cold",
  "The Salt Path",
  "A Month in the Country",
];

export const SNACKS = ["an orange", "a cookie", "a glass of milk", "a handful of grapes"];

export const EMOTES = ["wave", "dance", "bow", "cheer", "jump"] as const;
export type EmoteId = (typeof EMOTES)[number];

export const EMOTE_MS: Record<EmoteId, number> = {
  wave: 2800,
  dance: 3600,
  bow: 2200,
  cheer: 2400,
  jump: 1600,
};

export const PALETTE = [
  "#e07a3d",
  "#3d7a6a",
  "#d4574a",
  "#3d5f8a",
  "#c4963c",
  "#7a5b8c",
  "#4e7c45",
  "#b85c38",
];

export const EMOJIS = ["🐱", "🌱", "🍊", "🌙", "📚", "☕", "🦊", "🐻", "🍋", "🌸"];

export function outsideView(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Night. A streetlamp, and a few lit windows across the way.";
  if (h < 8) return "Early morning. Pale light and a quiet street.";
  if (h < 11) return "Morning. Sun on the maple, someone walking a dog.";
  if (h < 16) return "Afternoon. Bright and slow, the curtains shifting.";
  if (h < 19) return "Late afternoon. The maple is gold and the light is long.";
  if (h < 21) return "Dusk. Windows across the street are flickering on.";
  return "Evening. The streetlamp is on and the sky is ink-blue.";
}

export function channelById(id: number): Channel | undefined {
  return CHANNELS.find((channel) => channel.id === id);
}

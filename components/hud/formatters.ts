import type { RoomEvent } from "@/lib/room/types";

export type WhisperKind = "line" | "speech";

export type WhisperHit = {
  text: string;
  anchor: string;
  kind: WhisperKind;
};

export type WhisperFormatter = {
  id: string;
  match: RegExp;
  format: (event: RoomEvent, match: RegExpMatchArray) => WhisperHit | null;
};

function line(event: RoomEvent, anchor: string): WhisperHit {
  const text = event.text.replace(/\.$/, "");
  return { text: text.length > 96 ? `${text.slice(0, 93)}…` : text, anchor, kind: "line" };
}

/** Plug a new room event in by appending one row. Earlier rows win. */
export const WHISPER_FORMATTERS: WhisperFormatter[] = [
  {
    id: "say",
    match: / said [“"](.+)[”"]\.?$/,
    format: (event, match) =>
      event.agentId ? { text: match[1], anchor: `agent:${event.agentId}`, kind: "speech" } : null,
  },
  {
    id: "kettle",
    match: /kettle/i,
    format: (event) => line(event, "object:kettle"),
  },
  {
    id: "radio",
    match: /radio/i,
    format: (event) => line(event, "object:radio"),
  },
  {
    id: "dog",
    match: /\bdog\b/i,
    format: (event) => line(event, "dog"),
  },
  {
    id: "actor",
    match: /.+/,
    format: (event) => (event.agentId ? line(event, `agent:${event.agentId}`) : null),
  },
];

export function toWhisper(event: RoomEvent): WhisperHit | null {
  for (const formatter of WHISPER_FORMATTERS) {
    const match = formatter.match.exec(event.text);
    if (!match) continue;
    return formatter.format(event, match);
  }
  return null;
}

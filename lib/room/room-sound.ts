export type StationSoundSource = "station-row" | "remote";

/**
 * A station change never unmutes and never turns Room sound on.
 * Only the Play tap on this device does that.
 */
export function stationRowMayUnmute(_roomSoundOff: boolean, _source: StationSoundSource): boolean {
  return false;
}

/** Off unless this device stored the On value "0". A missing key is Off. */
export function roomSoundStoredOff(stored: string | null): boolean {
  return stored !== "0";
}

/** This device muted the radio. A missing saved setting is not that mute. */
export function deviceMuted(roomSoundOff: boolean, held: boolean): boolean {
  return roomSoundOff || held;
}

/** Which local radio button to show. These are control ids, not the visible words. */
export const RADIO_CONTROLS = {
  play: "play",
  unmute: "unmute",
  mute: "mute",
} as const;

export type RadioControl = (typeof RADIO_CONTROLS)[keyof typeof RADIO_CONTROLS];

export type RadioControlInput = {
  hearing: boolean;
  held: boolean;
  live: boolean;
  roomSoundOff: boolean;
  blocked: boolean;
  failed?: boolean;
};

/** Unmute only after this device tapped Mute while the station is live. Otherwise Play, unless audio is actually playing. */
export function radioControlLabel(input: RadioControlInput): RadioControl {
  if (input.roomSoundOff || input.blocked || input.failed) return RADIO_CONTROLS.play;
  if (input.held && input.live) return RADIO_CONTROLS.unmute;
  if (input.hearing && !input.held) return RADIO_CONTROLS.mute;
  return RADIO_CONTROLS.play;
}

/** The Playing line is on only while audio is actually playing. */
export function playingLineVisible(hearing: boolean, blocked: boolean): boolean {
  return hearing && !blocked;
}

export type MutePillInput = {
  started: boolean;
  hearing: boolean;
  held: boolean;
  roomSoundOff: boolean;
  sheetOpen: boolean;
  blocked: boolean;
  failed?: boolean;
};

/**
 * Two visible states: actually playing, or muted on this device with the stream dropped.
 * Hidden while a sheet is open, while Room sound is off, before the radio has started
 * here, and while autoplay is blocked.
 */
export function mutePillVisible(input: MutePillInput): boolean {
  if (input.sheetOpen || input.roomSoundOff || input.blocked || input.failed || !input.started) return false;
  return input.hearing || input.held;
}

/** Room sound switched off blocks the pill. A local hold can still lift. */
export function mutePillMayUnmute(roomSoundOff: boolean): boolean {
  return !roomSoundOff;
}

export function mutePillLabel(silent: boolean): "Mute" | "Unmute" {
  return silent ? "Unmute" : "Mute";
}

/** The speaker is crossed out only while the pill reads Unmute. */
export function mutePillIcon(silent: boolean): "mute" | "vol" {
  return silent ? "mute" : "vol";
}

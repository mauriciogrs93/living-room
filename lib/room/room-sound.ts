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

export type RadioControlInput = {
  hearing: boolean;
  held: boolean;
  live: boolean;
  roomSoundOff: boolean;
  blocked: boolean;
};

/** Unmute only after this device tapped Mute while the station is live. Otherwise Play, unless audio is actually playing. */
export function radioControlLabel(input: RadioControlInput): "Play" | "Unmute" | "Mute" {
  if (!input.roomSoundOff && input.held && input.live) return "Unmute";
  if (!input.roomSoundOff && input.hearing && !input.blocked && !input.held) return "Mute";
  return "Play";
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
};

/**
 * Two visible states: actually playing, or muted on this device with the stream dropped.
 * Hidden while a sheet is open, while Room sound is off, before the radio has started
 * here, and while autoplay is blocked.
 */
export function mutePillVisible(input: MutePillInput): boolean {
  if (input.sheetOpen || input.roomSoundOff || input.blocked || !input.started) return false;
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

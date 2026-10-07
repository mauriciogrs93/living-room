export type StationSoundSource = "station-row" | "remote";

/**
 * Unmute only for a local tap on a station row.
 * A station change from the owner, the server, or realtime is remote and stays muted.
 * Room sound switched off always wins.
 */
export function stationRowMayUnmute(roomSoundOff: boolean, source: StationSoundSource): boolean {
  if (roomSoundOff) return false;
  return source === "station-row";
}

/** This device muted the radio. A missing saved setting is not that mute. */
export function deviceMuted(roomSoundOff: boolean, held: boolean): boolean {
  return roomSoundOff || held;
}

/** Play wins while autoplay is blocked. Unmute only after this device has muted. */
export function radioControlLabel(blocked: boolean, mutedHere: boolean): "Play" | "Unmute" | "Mute" {
  if (blocked) return "Play";
  if (mutedHere) return "Unmute";
  return "Mute";
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

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

/** The outside mute pill is on only while this device is playing and no sheet is open. */
export function mutePillVisible(playingHere: boolean, sheetOpen: boolean): boolean {
  return playingHere && !sheetOpen;
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

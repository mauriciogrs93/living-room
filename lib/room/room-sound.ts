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

/** Hardcoded streams. Playback accepts an index only and never a URL from the room. */
export const STATIONS: { name: string; url: string }[] = [
  { name: "Radio Paradise", url: "https://stream.radioparadise.com/aac-320" },
  { name: "KEXP", url: "https://kexp-mp3-128.streamguys1.com/kexp128.mp3" },
  { name: "FIP", url: "https://icecast.radiofrance.fr/fip-midfi.mp3" },
];

export function stationIndex(index: number): number {
  const last = STATIONS.length - 1;
  if (!Number.isFinite(index)) return 0;
  const next = Math.trunc(index);
  if (next < 0) return 0;
  if (next > last) return last;
  return next;
}

export function stationUrl(index: number): string {
  return STATIONS[stationIndex(index)]!.url;
}

/** One local media surface. Radio starting drops the watch iframe. */
let stopWatch: (() => void) | null = null;

export function holdWatch(stop: () => void) {
  stopWatch = stop;
}

export function releaseWatch() {
  const stop = stopWatch;
  stopWatch = null;
  stop?.();
}

export function clearWatch() {
  stopWatch = null;
}

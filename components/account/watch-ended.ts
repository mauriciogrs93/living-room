"use client";

import { useSyncExternalStore } from "react";

/** Set when a watch session is cut off, so /room can say so without the 3D view. */
let message: string | null = null;
const listeners = new Set<() => void>();

export function setWatchEnded(next: string | null) {
  if (message === next) return;
  message = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useWatchEnded() {
  return useSyncExternalStore(subscribe, () => message, () => null);
}

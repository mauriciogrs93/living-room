"use client";

import { useSyncExternalStore } from "react";

/** This device only. Not a session. */
export const PASSWORD_LATER_KEY = "lr-set-password-later";

let forced = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function passwordOfferDismissed() {
  try {
    return localStorage.getItem(PASSWORD_LATER_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPasswordOffer() {
  try {
    localStorage.setItem(PASSWORD_LATER_KEY, "1");
  } catch {
    /* still close it for this view */
  }
  forced = false;
  emit();
}

/** You-panel link: bring the offer back on this device. */
export function reopenPasswordOffer() {
  forced = true;
  emit();
}

export function closePasswordOffer() {
  forced = false;
  emit();
}

export function passwordOfferVisible(passwordSet: boolean) {
  if (forced) return true;
  if (passwordSet) return false;
  return !passwordOfferDismissed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePasswordOfferOpen(passwordSet: boolean) {
  return useSyncExternalStore(subscribe, () => passwordOfferVisible(passwordSet), () => false);
}

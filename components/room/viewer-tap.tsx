"use client";

import { useEffect, useState } from "react";
import { OWNER_ONLY } from "@/components/hud/frame/strings";

const WRITES = new Set([
  "lamp",
  "living-light",
  "kitchen-light",
  "fridge",
  "kettle",
  "stove",
  "sink",
  "wardrobe",
  "plant",
  "bookshelf",
  "sofa",
  "dog-bed",
  "computer",
  "dog",
]);

type CardId = "tv" | "sky" | "computer" | "radio";
type TapState = {
  role: "owner" | "watch";
  cards: boolean;
  opener: ((id: CardId) => void) | null;
  toastListeners: Set<(text: string | null) => void>;
  toastTimer: number;
  gestureAt: number;
};

/** One copy for the frame and the canvas chunk. A module-level let splits across bundles. */
function tapState(): TapState {
  const host = globalThis as typeof globalThis & { __lrTap?: TapState };
  if (!host.__lrTap) {
    host.__lrTap = { role: "owner", cards: false, opener: null, toastListeners: new Set(), toastTimer: 0, gestureAt: 0 };
  }
  return host.__lrTap;
}

export function setViewerRole(next: "owner" | "watch") {
  tapState().role = next;
}

/** When the frame is on, the TV, window, computer, and radio open their cards instead of toggling. */
export function setCardTaps(on: boolean, open?: (id: CardId) => void) {
  const state = tapState();
  state.cards = on;
  state.opener = open ?? null;
}

/** A furniture tap just happened, so the same gesture's pointer-down must not close the card it opened. */
export function markFurnitureGesture() {
  tapState().gestureAt = performance.now();
}

/** True when a furniture tap just opened something, so the same gesture's pointer-down must not close it. */
export function furnitureGestureRecent(ms = 500) {
  return performance.now() - tapState().gestureAt < ms;
}

/** How long a watcher notice stays on screen before it clears. */
export const NOTICE_MS = 2500;

export function showNotice(text: string) {
  const state = tapState();
  for (const listener of state.toastListeners) listener(text);
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    for (const listener of state.toastListeners) listener(null);
  }, NOTICE_MS);
}

function showOwnerToast() {
  showNotice(OWNER_ONLY);
}

/** Returns false when the tap must not change the object (watcher, or the card handles it). */
export function tapObject(id: string) {
  const state = tapState();
  state.gestureAt = performance.now();
  if (state.cards && (id === "tv" || id === "window" || id === "computer" || id === "radio")) {
    const card = id === "tv" ? "tv" : id === "window" ? "sky" : id === "computer" ? "computer" : "radio";
    state.opener?.(card);
    return false;
  }
  if (state.role === "watch" && WRITES.has(id)) {
    showOwnerToast();
    return false;
  }
  void fetch("/api/tap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }).then((res) => {
    if (res.status === 403) showOwnerToast();
  }).catch(() => undefined);
  return true;
}

export function tapDog() {
  if (tapState().role === "watch") {
    showOwnerToast();
    return false;
  }
  void fetch("/api/dog", { method: "POST" }).then((res) => {
    if (res.status === 403) showOwnerToast();
  }).catch(() => undefined);
  return true;
}

export function OwnerOnlyToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const listeners = tapState().toastListeners;
    listeners.add(setText);
    return () => {
      listeners.delete(setText);
    };
  }, []);
  if (!text) return null;
  return (
    <p className="hudf-toast" role="status">
      {text}
    </p>
  );
}

/** Show the next state immediately, then trust the server once it answers. */
export function useOptimistic(server: boolean) {
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    setPending(null);
  }, [server]);
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => setPending(null), 2500);
    return () => clearTimeout(timer);
  }, [pending, server]);
  return [pending ?? server, (next: boolean) => setPending(next)] as const;
}

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

let role: "owner" | "watch" = "owner";
let cards = false;
let opener: ((id: "tv" | "sky" | "computer" | "radio") => void) | null = null;
const toastListeners = new Set<(text: string | null) => void>();
let toastTimer = 0;

export function setViewerRole(next: "owner" | "watch") {
  role = next;
}

/** When the frame is on, the TV, window, computer, and radio open their cards instead of toggling. */
export function setCardTaps(on: boolean, open?: (id: "tv" | "sky" | "computer" | "radio") => void) {
  cards = on;
  opener = open ?? null;
}

function showOwnerToast() {
  for (const listener of toastListeners) listener(OWNER_ONLY);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    for (const listener of toastListeners) listener(null);
  }, 2500);
}

/** Returns false when the tap must not change the object (watcher, or the card handles it). */
export function tapObject(id: string) {
  if (cards && (id === "tv" || id === "window" || id === "computer" || id === "radio")) {
    const card = id === "tv" ? "tv" : id === "window" ? "sky" : id === "computer" ? "computer" : "radio";
    opener?.(card);
    return false;
  }
  if (role === "watch" && WRITES.has(id)) {
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
  if (role === "watch") {
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
    toastListeners.add(setText);
    return () => {
      toastListeners.delete(setText);
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

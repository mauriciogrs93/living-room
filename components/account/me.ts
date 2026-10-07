"use client";

import { useSyncExternalStore } from "react";

/** v21: who is looking at /room. Fetched once from /api/me (which provisions the owner's apartment). */
export type Me =
  | { role: "owner"; email: string; passwordSet?: boolean; apartment: { legacy: boolean; created: boolean; claimedLegacy: boolean }; invite: { ttlMs: number } }
  | { role: "watch" }
  | { role: "none" }
  | { role: "error"; message: string; retryAfter?: number };

let me: Me | null = null;
let pending: Promise<Me> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Me> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status === 429) return { role: "error", message: String(body.error ?? "Too many requests."), retryAfter: Number(res.headers.get("retry-after")) || 60 };
    if (!res.ok) return { role: "error", message: String(body.error ?? "The room didn't answer.") };
    return body as unknown as Me;
  } catch {
    return { role: "error", message: "Can't connect. Check your connection." };
  }
}

export function refreshMe() {
  pending = load().then((value) => {
    me = value;
    for (const fn of listeners) fn();
    return value;
  });
  return pending;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!pending) void refreshMe();
  return () => listeners.delete(fn);
}

export function useMe() {
  return useSyncExternalStore(subscribe, () => me, () => null);
}

let signingOut = false;

/** POST only. Navigates home even when the request fails, and never stores the session in localStorage. */
export async function signOut() {
  if (signingOut) return;
  signingOut = true;
  let ok = false;
  try {
    const res = await fetch("/api/auth/signout", { method: "POST", signal: AbortSignal.timeout(8000) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  const leftWatch = me?.role === "watch";
  me = null;
  pending = null;
  // Full load: the in-memory account has to die with the cookies. A client router push would keep it.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  const why = ok ? (leftWatch ? "left" : "out") : "out-failed";
  window.location.assign(`/room?signin=${why}`);
}

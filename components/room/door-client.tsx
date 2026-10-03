"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

export type DoorPerson = { id: string; name: string; color: string; emoji: string };
export type DoorKnock = DoorPerson & { note: string; at: number };

export type DoorData = {
  locked: boolean;
  invite: string;
  joinLine: string;
  knocks: DoorKnock[];
  trusted: DoorPerson[];
  blocked: DoorPerson[];
};

type Brief = {
  locked?: boolean;
  knocks?: DoorKnock[];
  trusted?: DoorPerson[];
  blocked?: DoorPerson[];
};

let data: DoorData | null = null;
let knocks = 0;
let access = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function publish(next: DoorData | null, allowed: boolean) {
  data = next;
  knocks = next?.knocks.length ?? 0;
  access = allowed;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDoor() {
  return useSyncExternalStore(subscribe, () => data, () => null);
}

export function useKnockCount() {
  return useSyncExternalStore(subscribe, () => knocks, () => 0);
}

export function useDoorAccess() {
  return useSyncExternalStore(subscribe, () => access, () => false);
}

function readKey() {
  const fromUrl = new URLSearchParams(window.location.search).get("owner") ?? "";
  let stored = "";
  try {
    stored = localStorage.getItem("living-room-owner") ?? "";
  } catch {
    stored = "";
  }
  if (/^own_[0-9a-f]{36}$/.test(fromUrl)) return fromUrl;
  if (/^own_[0-9a-f]{36}$/.test(stored)) return stored;
  return "";
}

function applyBrief(brief: Brief) {
  if (!data) return;
  data = {
    ...data,
    locked: typeof brief.locked === "boolean" ? brief.locked : data.locked,
    knocks: Array.isArray(brief.knocks) ? brief.knocks : data.knocks,
    trusted: Array.isArray(brief.trusted) ? brief.trusted : data.trusted,
    blocked: Array.isArray(brief.blocked) ? brief.blocked : data.blocked,
  };
  knocks = data.knocks.length;
  emit();
}

export function DoorProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = readKey();
    if (!key) {
      publish(null, false);
      return;
    }
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/door?ownerKey=${encodeURIComponent(key)}`, { cache: "no-store" });
        if (stop) return;
        if (!res.ok) {
          publish(null, false);
          return;
        }
        const body = (await res.json()) as DoorData & { ok?: boolean };
        if (!body.ok) {
          publish(null, false);
          return;
        }
        publish(
          {
            locked: body.locked,
            invite: body.invite,
            joinLine: body.joinLine,
            knocks: body.knocks ?? [],
            trusted: body.trusted ?? [],
            blocked: body.blocked ?? [],
          },
          true,
        );
      } catch {
        if (!stop) publish(null, false);
      }
    };
    let source: EventSource | null = null;
    let timer: number | undefined;
    let paused = document.hidden;
    const stopPoll = () => {
      if (timer) window.clearInterval(timer);
      timer = undefined;
    };
    const onDoor = (event: Event) => {
      try {
        applyBrief(JSON.parse((event as MessageEvent).data) as Brief);
      } catch {
        /* the next full load refills the list */
      }
    };
    const startPoll = () => {
      if (paused || stop || timer) return;
      timer = window.setInterval(() => void load(), 8_000);
    };
    const connect = () => {
      if (paused || stop) return;
      source?.close();
      source = new EventSource(`/api/events?ownerKey=${encodeURIComponent(key)}`);
      source.onopen = () => stopPoll();
      source.onerror = () => {
        source?.close();
        source = null;
        if (paused || stop) return;
        startPoll();
      };
      source.addEventListener("door", onDoor);
    };
    const onVis = () => {
      if (document.hidden) {
        paused = true;
        source?.close();
        source = null;
        stopPoll();
        return;
      }
      paused = false;
      void load();
      connect();
    };
    document.addEventListener("visibilitychange", onVis);
    if (!paused) {
      void load();
      connect();
    }
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVis);
      stopPoll();
      source?.close();
    };
  }, []);
  return children;
}

export async function doorAct(action: string, id = "") {
  const key = readKey();
  if (!key) return { ok: false as const, error: "Only the room owner can see the door." };
  const res = await fetch("/api/door", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerKey: key, action, id }),
  });
  const body = (await res.json()) as DoorData & { ok?: boolean; error?: string; message?: string };
  if (!res.ok || !body.ok) return { ok: false as const, error: body.error ?? "The door didn't answer." };
  publish(
    {
      locked: body.locked,
      invite: body.invite,
      joinLine: body.joinLine,
      knocks: body.knocks ?? [],
      trusted: body.trusted ?? [],
      blocked: body.blocked ?? [],
    },
    true,
  );
  return { ok: true as const, message: body.message ?? "" };
}

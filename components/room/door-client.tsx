"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ownerSession } from "@/components/room/owner-session";

export type DoorPerson = { id: string; name: string; color: string; emoji: string };
export type DoorVisitor = DoorPerson & { at: number };

/** v19 Door (Option A): invites only. No knocks, no visible code. */
export type DoorData = {
  paused: boolean;
  unused: number;
  visitors: DoorVisitor[];
  trusted: DoorPerson[];
  blocked: DoorPerson[];
};

type Brief = Partial<DoorData>;

let data: DoorData | null = null;
let access = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function shape(body: Brief): DoorData {
  return {
    paused: Boolean(body.paused),
    unused: Number(body.unused) || 0,
    visitors: Array.isArray(body.visitors) ? body.visitors : [],
    trusted: Array.isArray(body.trusted) ? body.trusted : [],
    blocked: Array.isArray(body.blocked) ? body.blocked : [],
  };
}

function publish(next: DoorData | null, allowed: boolean) {
  data = next;
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

/** Kept for the HUD badge. Option A has no knocks, so this is always 0. */
export function useKnockCount() {
  return 0;
}

export function useDoorAccess() {
  return useSyncExternalStore(subscribe, () => access, () => false);
}

function applyBrief(brief: Brief) {
  if (!data) return;
  data = shape({ ...data, ...brief });
  emit();
}

export function DoorProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let stop = false;
    let source: EventSource | null = null;
    let timer: number | undefined;
    let paused = document.hidden;
    const load = async () => {
      try {
        const res = await fetch("/api/door", { cache: "no-store" });
        if (stop) return;
        const body = (await res.json()) as Brief & { ok?: boolean };
        if (!res.ok || !body.ok) {
          publish(null, false);
          return;
        }
        publish(shape(body), true);
      } catch {
        if (!stop) publish(null, false);
      }
    };
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
      timer = window.setInterval(() => void load(), 15_000);
    };
    const connect = () => {
      if (paused || stop) return;
      source?.close();
      source = new EventSource("/api/events");
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
    void ownerSession().then((session) => {
      if (stop) return;
      if (!session.door) {
        publish(null, false);
        return;
      }
      document.addEventListener("visibilitychange", onVis);
      if (!paused) {
        void load();
        connect();
      }
    });
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVis);
      stopPoll();
      source?.close();
    };
  }, []);
  return children;
}

type ActBody = Brief & { ok?: boolean; error?: string; code?: string; message?: string; line?: string };

export async function doorAct(action: string, id = "") {
  let res: Response;
  try {
    res = await fetch("/api/door", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
  } catch {
    return { ok: false as const, error: "Can't connect. Check your connection.", code: "network" };
  }
  const body = (await res.json().catch(() => ({}))) as ActBody;
  if (!res.ok || !body.ok) {
    if (body.code === "invites_paused" && data) applyBrief({ paused: true });
    const fallback = action === "invite" ? "Couldn't make an invite. Try again." : "The door didn't answer.";
    return { ok: false as const, error: body.error ?? fallback, code: body.code ?? "" };
  }
  publish(shape(body), true);
  return { ok: true as const, message: body.message ?? "", line: body.line ?? "" };
}

/** Create one invite and return the line to paste. Rejects if the server refuses. */
export async function createInviteLine(): Promise<string> {
  const result = await doorAct("invite");
  if (!result.ok || !result.line) throw new Error(result.ok ? "No invite" : result.error);
  return result.line;
}

"use client";

import { useEffect, useState } from "react";
import { WATCH_ENDED_COPY } from "@/lib/apartments/copy";
import { setWatchEnded } from "./account/watch-ended";
import type { Snapshot } from "@/lib/room/types";

export type RoomStatus = "connecting" | "live" | "reconnecting" | "offline";
export type LiveSnapshot = Snapshot & { receivedAt: number };

export function useRoom() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");

  useEffect(() => {
    setWatchEnded(null);
    let cancelled = false;
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let paused = false;
    let held: Snapshot | null = null;
    let lastEventId = "";

    // Watch tab Redis. Before: SSE every 400ms plus /api/state every 800ms ≈ 7.5 cmds/s, hidden or not.
    // After: this stream every 2s ≈ 1/s while visible. Hidden closes it and does not poll ≈ 0.
    // /api/state runs only while the stream is down, then once on visibilitychange.
    const seen = { sig: "" };
    const apply = (data: Snapshot) => {
      if (cancelled || !data || !Array.isArray(data.agents)) return;
      const next = sign(data);
      setStatus("live");
      if (next === seen.sig) return;
      seen.sig = next;
      setSnapshot({ ...data, receivedAt: Date.now() });
    };

    const endWatch = (message?: string) => {
      cancelled = true;
      source?.close();
      source = null;
      if (poll) clearInterval(poll);
      poll = undefined;
      if (retry) clearTimeout(retry);
      setWatchEnded(message || WATCH_ENDED_COPY);
    };
    const pull = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (res.status === 403) {
          const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
          if (body.code === "watch_ended") {
            endWatch(body.error);
            return;
          }
        }
        if (!res.ok) throw new Error(String(res.status));
        apply((await res.json()) as Snapshot);
      } catch {
        if (!cancelled) setStatus((current) => (current === "live" ? "reconnecting" : "offline"));
      }
    };

    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = undefined;
    };
    const startPoll = () => {
      if (paused || cancelled || poll) return;
      void pull();
      poll = setInterval(() => void pull(), 2_000);
    };

    const connect = () => {
      if (paused || cancelled) return;
      source?.close();
      const since = lastEventId ? `?since=${encodeURIComponent(lastEventId)}` : "";
      source = new EventSource(`/api/events${since}`);
      source.onopen = () => stopPoll();
      source.addEventListener("full", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as Snapshot;
          held = data;
          lastEventId = data.events[data.events.length - 1]?.id ?? lastEventId;
          apply(data);
        } catch {
          /* ignore malformed frames */
        }
      });
      source.addEventListener("diff", (event) => {
        try {
          if (!held) return;
          const patch = JSON.parse((event as MessageEvent).data) as Partial<Snapshot> & {
            events?: Snapshot["events"];
            agentsPartial?: boolean;
          };
          held = mergeSnapshot(held, patch);
          lastEventId = held.events[held.events.length - 1]?.id ?? lastEventId;
          apply(held);
        } catch {
          /* ignore malformed frames */
        }
      });
      source.addEventListener("bye", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { reason?: string; error?: string };
          if (data.reason === "watch_ended") endWatch(data.error);
        } catch {
          /* a normal stream restart has an empty bye */
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (cancelled || paused) return;
        setStatus((current) => (current === "live" ? "reconnecting" : current));
        startPoll();
        if (retry) clearTimeout(retry);
        retry = setTimeout(connect, 1000);
      };
    };

    const pause = () => {
      paused = true;
      source?.close();
      source = null;
      stopPoll();
      if (retry) clearTimeout(retry);
    };
    const resume = () => {
      if (cancelled) return;
      paused = false;
      void pull();
      connect();
    };
    const onVis = () => {
      if (document.hidden) pause();
      else resume();
    };
    document.addEventListener("visibilitychange", onVis);
    if (document.hidden) paused = true;
    else connect();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      pause();
    };
  }, []);

  return { snapshot, status };
}

function mergeById<T extends { id: string }>(current: T[], patch: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of patch) byId.set(item.id, item);
  return [...byId.values()];
}

function mergeSnapshot(held: Snapshot, patch: Partial<Snapshot> & { events?: Snapshot["events"]; agentsPartial?: boolean }): Snapshot {
  const events = patch.events
    ? [...held.events, ...patch.events.filter((item) => !held.events.some((prev) => prev.id === item.id))].slice(-80)
    : held.events;
  const objects = patch.objects ? mergeById(held.objects, patch.objects) : held.objects;
  const agents = patch.agents ? (patch.agentsPartial ? mergeById(held.agents, patch.agents) : patch.agents) : held.agents;
  const diary = patch.diary ? mergeById(held.diary, patch.diary).slice(-40) : held.diary;
  const { agentsPartial: _partial, ...rest } = patch;
  return { ...held, ...rest, events, objects, agents, diary };
}

function sign(data: Snapshot) {
  const now = Date.now();
  const agents = data.agents
    .map((agent) => {
      const moving = agent.motion;
      const place = moving
        ? `${moving.startedAt}:${moving.arriveAt}:${moving.to.x}:${moving.to.z}`
        : `${agent.position.x.toFixed(2)}:${agent.position.z.toFixed(2)}:${agent.position.y.toFixed(2)}`;
      const talk = agent.speech && agent.speech.until > now ? agent.speech.text : "";
      return `${agent.id}:${agent.pose}:${place}:${talk}:${agent.emote ?? ""}:${agent.status}:${agent.away ? 1 : 0}:${agent.objectId ?? ""}:${agent.holding?.label ?? ""}`;
    })
    .join("|");
  const dog = data.dog;
  const pet = dog ? `${dog.mode}:${dog.since ?? 0}:${dog.followId ?? ""}:${dog.fetchUntil ?? 0}:${dog.reactUntil ?? 0}` : "";
  const objects = data.objects.map((object) => `${object.id}:${object.stateText}:${object.position.x.toFixed(2)}:${object.position.z.toFixed(2)}`).join("|");
  const tail = data.events[data.events.length - 1]?.id ?? "";
  const door = data.door ? `${data.door.locked ? 1 : 0}:${data.door.knocking ? 1 : 0}` : "";
  return `${agents}#${pet}#${objects}#${tail}#${data.radio.on}:${data.radio.name}#${data.drawings.length}#${data.diary.length}#${door}`;
}

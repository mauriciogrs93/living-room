"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomEvent } from "@/lib/room/types";
import { anchorPoint } from "./anchors";
import { toWhisper, type WhisperKind } from "./formatters";
import { WHISPER_CAP, WHISPER_MS } from "./tokens";

type Item = {
  id: string;
  text: string;
  anchor: string;
  kind: WhisperKind;
  born: number;
};

export function WhisperLayer({ events, live }: { events: RoomEvent[]; live: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const signature = events.map((event) => event.id).join("|");
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!live) return;
    const ids = signature ? signature.split("|") : [];
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = events.filter((event) => !seen.current?.has(event.id));
    for (const id of ids) seen.current.add(id);
    if (fresh.length === 0) return;
    const born = Date.now();
    setItems((current) => {
      const next = [...current];
      for (const event of fresh) {
        const hit = toWhisper(event);
        if (!hit) continue;
        next.push({ id: event.id, born, ...hit });
      }
      return next.slice(-WHISPER_CAP);
    });
  }, [signature, events, live]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setItems((current) => current.filter((item) => now - item.born < WHISPER_MS));
    }, 200);
    return () => window.clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    if (items.length === 0) return;
    let frame = 0;
    const loop = () => {
      setTick((value) => value + 1);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [items.length]);

  const placed = place(items);
  return (
    <div className="hud-whispers" data-tick={tick} aria-hidden>
      {placed.map((item) =>
        item.kind === "speech" ? null : (
        <p
          key={item.id}
          className={`hud-whisper${reduced ? " is-still" : ""}`}
          style={{ left: item.x, top: item.y }}
        >
          {item.text}
        </p>
        ),
      )}
    </div>
  );
}

function place(items: Item[]) {
  if (typeof window === "undefined" || items.length === 0) return [];
  const counts = new Map<string, number>();
  const gap = 26;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const host = document.querySelector(".room-root")?.getBoundingClientRect();
  const blocked = [...document.querySelectorAll(".agent-tag, .agent-stack, .global-tape")].map((el) => el.getBoundingClientRect());
  return items.flatMap((item) => {
    const point = anchorPoint(item.anchor);
    if (!point) return [];
    const index = counts.get(item.anchor) ?? 0;
    counts.set(item.anchor, index + 1);
    const half = 96;
    let x = Math.min(width - half - 12, Math.max(half + 12, point.x));
    let y = beamY(point.y, height) - index * gap;
    for (let step = 0; step < 6 && hitsLabel(x, y, half, host, blocked); step += 1) y = Math.max(72, y - 18);
    x = Math.min(width - half - 12, Math.max(half + 12, x));
    y = Math.min(height - 72, Math.max(72, y));
    return [{ ...item, x, y }];
  });
}

function beamY(y: number, height: number) {
  const top = 52;
  const bottom = height - 78;
  const span = Math.max(80, (bottom - top) / 3);
  const index = Math.min(2, Math.max(0, Math.floor((y - top) / span)));
  return Math.min(bottom, top + span * (index + 1) - 16);
}

function hitsLabel(x: number, y: number, half: number, host: DOMRect | undefined, rects: DOMRect[]) {
  const left = (host?.left ?? 0) + x - half;
  const top = (host?.top ?? 0) + y - 28;
  const bubble = { left, right: left + half * 2, top, bottom: top + 28 };
  return rects.some((rect) => rect.width > 0 && bubble.left < rect.right - 4 && bubble.right > rect.left + 4 && bubble.top < rect.bottom && bubble.bottom > rect.top + 4);
}

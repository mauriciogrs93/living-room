"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { str } from "./furniture-kit";

export type Headline = { title: string; source: string };

const left = new Vector3();
const right = new Vector3();
const mid = new Vector3();

export function headlinesOf(state: Record<string, unknown>): Headline[] {
  const raw = state.headlines;
  if (!Array.isArray(raw)) return [];
  const out: Headline[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = str(record, "title").replace(/[<>]/g, "").trim().slice(0, 110);
    const source = str(record, "source").replace(/[<>]/g, "").trim().slice(0, 24);
    if (!title) continue;
    out.push({ title, source });
    if (out.length >= 5) break;
  }
  return out;
}

export function NewsTape({ power, headlines }: { power: boolean; headlines: Headline[] }) {
  const anchorL = useRef<Object3D>(null);
  const anchorR = useRef<Object3D>(null);
  const el = useRef<HTMLDivElement | null>(null);
  const { camera, gl, size } = useThree();
  const label = headlines.map((item) => `${item.title} — ${item.source || "wire"}`).join("   ·   ");

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const div = document.createElement("div");
    div.className = "news-tape";
    host.appendChild(div);
    el.current = div;
    return () => {
      div.remove();
      el.current = null;
    };
  }, [gl]);

  useLayoutEffect(() => {
    const div = el.current;
    if (!div) return;
    div.replaceChildren();
    if (!power || !label) return;
    const track = document.createElement("div");
    track.className = "news-tape-track";
    track.textContent = `${label}   ·   ${label}`;
    div.appendChild(track);
  }, [power, label]);

  useFrame(() => {
    const div = el.current;
    const a = anchorL.current;
    const b = anchorR.current;
    if (!div || !a || !b) return;
    if (!power || !label) {
      div.style.visibility = "hidden";
      return;
    }
    a.updateWorldMatrix(true, false);
    b.updateWorldMatrix(true, false);
    a.getWorldPosition(left);
    b.getWorldPosition(right);
    mid.copy(left).add(right).multiplyScalar(0.5);
    const projected = mid.project(camera);
    const onScreen = projected.z >= -1 && projected.z <= 1;
    div.style.visibility = onScreen ? "visible" : "hidden";
    if (!onScreen) return;
    const x = (projected.x * 0.5 + 0.5) * size.width;
    const y = (-projected.y * 0.5 + 0.5) * size.height;
    const edgeL = left.project(camera);
    const edgeR = right.project(camera);
    const span = Math.abs(edgeR.x - edgeL.x) * 0.5 * size.width;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.width = `${Math.max(span, 168)}px`;
  });

  return (
    <>
      <object3D ref={anchorL} position={[-0.56, 1.24, 0.08]} />
      <object3D ref={anchorR} position={[0.56, 1.24, 0.08]} />
    </>
  );
}

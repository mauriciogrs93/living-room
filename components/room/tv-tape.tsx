"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { str } from "./furniture-kit";
import { homography } from "./maquette/kit";

export type Headline = { title: string; source: string };

const corner = new Vector3();
const CORNERS: [number, number][] = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

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

/**
 * The one TV ticker: an HTML band projected (matrix3d homography) onto the lower 18% of the TV glass, so it is
 * clipped inside the screen and foreshortens with it. `band` is the anchor the TV builder places on the glass.
 */
export function NewsTape({ power, headlines, band }: { power: boolean; headlines: Headline[]; band?: Object3D }) {
  const el = useRef<HTMLDivElement | null>(null);
  const { camera, gl, size } = useThree();
  const label = headlines.map((item) => `${item.title} — ${item.source || "wire"}`.toUpperCase()).join("  ·  ");

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const div = document.createElement("div");
    div.className = "news-tape";
    div.setAttribute("aria-hidden", "true");
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
    for (let i = 0; i < 2; i += 1) {
      const span = document.createElement("span");
      span.textContent = label;
      track.appendChild(span);
    }
    div.appendChild(track);
  }, [power, label]);

  useFrame(() => {
    const div = el.current;
    if (!div || !band) return;
    let visible = power && Boolean(label);
    for (let p: Object3D | null = band; p && visible; p = p.parent) if (!p.visible) visible = false;
    if (!visible) {
      div.style.visibility = "hidden";
      return;
    }
    const [bw, bh] = (band.userData.size as [number, number] | undefined) ?? [1.06, 0.108];
    band.updateWorldMatrix(true, false);
    const W = 300;
    const H = (W * bh) / bw;
    const pts: [number, number][] = [];
    let behind = false;
    for (const [sx, sy] of CORNERS) {
      corner.set((sx * bw) / 2, (sy * bh) / 2, 0).applyMatrix4(band.matrixWorld).project(camera);
      if (corner.z < -1 || corner.z > 1) behind = true;
      pts.push([(corner.x * 0.5 + 0.5) * size.width, (-corner.y * 0.5 + 0.5) * size.height]);
    }
    if (behind) {
      div.style.visibility = "hidden";
      return;
    }
    const [a, b, c, d, e, f, g, h] = homography(
      [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ],
      pts,
    );
    div.style.visibility = "visible";
    div.style.width = `${W}px`;
    div.style.height = `${H}px`;
    div.style.transform = `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
  });

  return null;
}

"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { LiveSnapshot } from "@/components/use-room";
import { anchorLift, windowAnchor } from "@/lib/room/anchor-heights";
import { stagePose } from "@/lib/room/layout";
import { publishAnchors, type ScreenPoint } from "./anchors";

export function HudAnchors({ snapshot }: { snapshot: LiveSnapshot }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const point = useRef(new THREE.Vector3());
  const snap = useRef(snapshot);
  snap.current = snapshot;

  useFrame(() => {
    const live = snap.current;
    const host = gl.domElement.getBoundingClientRect();
    const root = gl.domElement.closest(".room-root")?.getBoundingClientRect();
    const ox = host.left - (root?.left ?? host.left);
    const oy = host.top - (root?.top ?? host.top);
    const next: Record<string, ScreenPoint> = {};
    const put = (key: string, x: number, y: number, z: number) => {
      point.current.set(x, y, z);
      const projected = point.current.project(camera);
      if (projected.z < -1 || projected.z > 1) return;
      next[key] = {
        x: (projected.x * 0.5 + 0.5) * size.width + ox,
        y: (-projected.y * 0.5 + 0.5) * size.height + oy,
      };
    };

    for (const agent of live.agents) {
      const staged = stagePose(agent.position.x, agent.position.z);
      put(`agent:${agent.id}`, staged.x, agent.position.y + staged.y + 1.05, staged.z);
    }
    for (const object of live.objects) {
      if (object.id === "window") {
        const glass = windowAnchor();
        put("object:window", glass.x, glass.y, glass.z);
        continue;
      }
      const staged = stagePose(object.position.x, object.position.z);
      put(`object:${object.id}`, staged.x, staged.y + anchorLift(object.id), staged.z);
    }
    if (live.dog) {
      const staged = stagePose(live.dog.x, live.dog.z);
      put("dog", staged.x, staged.y + 0.35, staged.z);
    }
    publishAnchors(next);
  });

  return null;
}

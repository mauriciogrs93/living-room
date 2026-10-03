"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PMREMGenerator, type Group } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { disposeBuilt, mats, mergeStatic, setEnvTexture, type Mats } from "./maquette/kit";
import type { Built } from "./maquette/pieces";

export function num(state: Record<string, unknown>, key: string, fallback = 0) {
  const value = state[key];
  return typeof value === "number" ? value : fallback;
}

export function str(state: Record<string, unknown>, key: string, fallback = "") {
  const value = state[key];
  return typeof value === "string" ? value : fallback;
}

export function flag(state: Record<string, unknown>, key: string) {
  return state[key] === true;
}

type SceneLive = {
  kettle: boolean;
  lights: { lamp: boolean; living: boolean; kitchen: boolean };
  drawings: { id: string; pixels: string; agentName: string }[];
  station: string;
  onOpenBooks: () => void;
  onTapRadio: () => void;
  onTapDog: () => void;
};

const SceneLiveContext = createContext<SceneLive>({
  kettle: false,
  lights: { lamp: true, living: true, kitchen: true },
  drawings: [],
  station: "",
  onOpenBooks: () => {},
  onTapRadio: () => {},
  onTapDog: () => {},
});

export function SceneLiveProvider({ value, children }: { value: SceneLive; children: ReactNode }) {
  return <SceneLiveContext.Provider value={value}>{children}</SceneLiveContext.Provider>;
}

export function useScene() {
  return useContext(SceneLiveContext);
}

/**
 * Drawing ink, muted to sit in the maquette palette. Same 16 slots as the engine's palette (index = nibble), so a
 * drawing keeps its composition; only the saturation drops.
 */
export const INK = ["#2D3136", "#F7F5F0", "#B8674E", "#A7AD9C", "#C9915E", "#4A3E36", "#8E9AAB", "#C9B37A", "#8E6F78", "#EFECE6", "#7F8A79", "#B89758", "#A08060", "#D6C5A9", "#5E5852", "#FAF8F4"];

export function tightDevice() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios || (nav.deviceMemory ?? 8) <= 4;
}

type MatsValue = { M: Mats; night: boolean };
const MatsContext = createContext<MatsValue>({ M: mats(false), night: false });

/** Flat maquette materials for day or night, plus a RoomEnvironment probe so steel and brass have something to reflect. */
export function HouseMaterials({ night, children }: { night: boolean; children: ReactNode }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const target = pmrem.fromScene(env, 0.04);
    setEnvTexture(target.texture);
    env.traverse((obj) => {
      const mesh = obj as unknown as { geometry?: { dispose: () => void } };
      mesh.geometry?.dispose();
    });
    pmrem.dispose();
    performance.mark("house-textures");
  }, [gl]);
  const value = useMemo(() => ({ M: mats(night), night }), [night]);
  return <MatsContext.Provider value={value}>{children}</MatsContext.Provider>;
}

export function useMats() {
  return useContext(MatsContext);
}

/** Build a piece once per dependency change, merge its static meshes, and free the merged geometry on change. */
export function useBuilt(factory: () => Built, deps: readonly unknown[], opts: { noCast?: boolean } = {}): Built {
  const built = useMemo(() => {
    const b = factory();
    mergeStatic(b.group);
    // continuously animated pieces (swaying plants, the dog) stay out of the cached shadow map
    if (opts.noCast) b.group.traverse((o) => (o.castShadow = false));
    return b;
    // the caller passes the dependency list, like useMemo itself
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);
  useEffect(() => () => disposeBuilt(built.group), [built]);
  return built;
}

export function Tap({ onTap, children }: { onTap: () => void; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const hot = useRef(0);
  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const target = hot.current > 1 ? 0.985 : hot.current > 0 ? 1.012 : 1;
    const next = group.scale.x + (target - group.scale.x) * Math.min(1, delta * 14);
    group.scale.setScalar(next);
  });
  return (
    <group
      ref={ref}
      onClick={(event) => {
        event.stopPropagation();
        onTap();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        hot.current = Math.max(hot.current, 1);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hot.current = 0;
        document.body.style.cursor = "";
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        hot.current = 2;
      }}
      onPointerUp={() => {
        if (hot.current > 1) hot.current = 1;
      }}
    >
      {children}
    </group>
  );
}

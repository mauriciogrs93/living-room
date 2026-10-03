"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group } from "three";
import {
  makeArtTexture,
  makeBrick,
  makeEnamel,
  makeFabric,
  makeKitchenTile,
  makePlankBump,
  makePlankFloor,
  makePlaster,
  makeRugTexture,
  makeSkyTexture,
  makeWoodTexture,
  solidColor,
} from "./textures";

export const C = {
  wood: "#8a5a36",
  woodDark: "#5c3a24",
  frame: "#6e4328",
  plinth: "#4e311f",
  sofa: "#6e9a86",
  sofaDeep: "#567866",
  cushion: "#8fb5a0",
  cream: "#f7f1e6",
  pillow: "#fffaf4",
  rust: "#c45c4e",
  blanket: "#a8483c",
  sheet: "#f4efe6",
  shade: "#f6e2c0",
  brass: "#b8894a",
  tv: "#2a2624",
  pot: "#b56848",
  plant: "#3f7a52",
  plantDeep: "#2c5a3c",
  curtain: "#d7c4a4",
  curtainDeep: "#c2aa86",
};

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

export type Maps = {
  floor: ReturnType<typeof makePlankFloor>;
  floorBump: ReturnType<typeof makePlankBump>;
  plaster: ReturnType<typeof makePlaster>;
  stripe: ReturnType<typeof makePlaster>;
  bedroom: ReturnType<typeof makePlaster>;
  tile: ReturnType<typeof makeKitchenTile>;
  brick: ReturnType<typeof makeBrick>;
  wood: ReturnType<typeof makeWoodTexture>;
  sage: ReturnType<typeof makeFabric>;
  sageLight: ReturnType<typeof makeFabric>;
  rust: ReturnType<typeof makeFabric>;
  cream: ReturnType<typeof makeFabric>;
  rug: ReturnType<typeof makeRugTexture>;
  rugSage: ReturnType<typeof makeRugTexture>;
  rugGold: ReturnType<typeof makeRugTexture>;
  enamel: ReturnType<typeof makeEnamel>;
  sky: ReturnType<typeof makeSkyTexture>;
  art: ReturnType<typeof makeArtTexture>;
};

const MapsContext = createContext<Maps | null>(null);

export function useMaps() {
  const maps = useContext(MapsContext);
  if (!maps) throw new Error("House materials are missing.");
  return maps;
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

export const INK = ["#1a1410", "#f7f1e6", "#c45c4e", "#6e9a86", "#e07a3d", "#3a2c24", "#6d88a8", "#e2b84a", "#8d4d62", "#f4efe6", "#2c5a3c", "#b8894a", "#8a5a36", "#d7c4a4", "#4e4038", "#fffaf4"];

function coloredMaps(): Maps {
  return {
    floor: solidColor("#b07a45"),
    floorBump: null,
    plaster: solidColor("#f3e4d2"),
    stripe: solidColor("#efe6da"),
    bedroom: solidColor("#f6ebe3"),
    tile: solidColor("#f4efe8"),
    brick: solidColor("#a86858"),
    wood: solidColor("#8a5a36"),
    sage: solidColor("#6e9a86"),
    sageLight: solidColor("#8fb5a0"),
    rust: solidColor("#c45c4e"),
    cream: solidColor("#f7f1e6"),
    rug: solidColor("#a8483c"),
    rugSage: solidColor("#6e9a86"),
    rugGold: solidColor("#c6a15a"),
    enamel: solidColor("#d5ddd8"),
    sky: solidColor("#d5e3f0"),
    art: solidColor("#efe2c4"),
  };
}

export function tightDevice() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios || (nav.deviceMemory ?? 8) <= 4;
}

export function HouseMaterials({ children }: { children: ReactNode }) {
  const [maps, setMaps] = useState<Maps>(coloredMaps);
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      if (!live) return;
      const tight = tightDevice();
      setMaps({
        floor: makePlankFloor(),
        floorBump: tight ? null : makePlankBump(),
        plaster: makePlaster("warm"),
        stripe: makePlaster("stripe"),
        bedroom: makePlaster("bedroom"),
        tile: makeKitchenTile(),
        brick: makeBrick(),
        wood: makeWoodTexture(),
        sage: makeFabric([104, 140, 122], [68, 98, 84]),
        sageLight: makeFabric([156, 186, 168], [112, 148, 130]),
        rust: makeFabric([186, 92, 78], [132, 58, 48]),
        cream: makeFabric([244, 236, 224], [214, 196, 176]),
        rug: makeRugTexture("rust"),
        rugSage: makeRugTexture("sage"),
        rugGold: makeRugTexture("gold"),
        enamel: makeEnamel(),
        sky: makeSkyTexture(),
        art: makeArtTexture(),
      });
      performance.mark("house-textures");
    }, 48);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(
    () => () => {
      for (const texture of Object.values(maps)) texture?.dispose();
    },
    [maps],
  );
  return <MapsContext.Provider value={maps}>{children}</MapsContext.Provider>;
}

export function Chunk({
  position,
  args,
  color,
  map,
  bumpMap,
  radius = 0.06,
  rotation,
  roughness = 0.78,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
  castShadow = true,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color?: string;
  map?: Maps["wood"];
  bumpMap?: Maps["floorBump"];
  radius?: number;
  rotation?: [number, number, number];
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  castShadow?: boolean;
}) {
  const safe = Math.max(0.012, Math.min(radius, args[0] / 2 - 0.01, args[1] / 2 - 0.01, args[2] / 2 - 0.01));
  return (
    <RoundedBox position={position} args={args} radius={safe} smoothness={2} rotation={rotation} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial
        color={map ? "#ffffff" : (color ?? "#c4a07a")}
        map={map ?? undefined}
        bumpMap={bumpMap ?? undefined}
        bumpScale={bumpMap ? 0.035 : 0}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000"}
        emissiveIntensity={emissiveIntensity}
      />
    </RoundedBox>
  );
}

export function Tap({ onTap, children }: { onTap: () => void; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const hot = useRef(0);
  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const target = hot.current > 1 ? 0.975 : hot.current > 0 ? 1.018 : 1;
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

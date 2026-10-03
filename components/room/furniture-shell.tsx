"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FLOORS, HOUSE, SHELL } from "@/lib/room/layout";
import { useAtmosphere } from "./atmosphere";
import { useFidgets } from "./interact";
import { tapObject } from "./viewer-tap";
import { Tap, useBuilt, useMats, useScene } from "./furniture-kit";
import { SwayPlant } from "./furniture-pieces";
import { GEO, PAL } from "./maquette/config";
import { currentEnv, disposeBuilt, familyMaterial, familyPaint, pleatGeo } from "./maquette/kit";
import { counter, pendant } from "./maquette/pieces";
import { FRONT, buildShell } from "./maquette/shell";

/** 0 = kitchen close-up, 1 = living close-up: the storeys above lift off like a model's floor plate. */
export function RoomShell({ lift = null }: { lift?: number | null }) {
  const { M, night } = useMats();
  const { lightOn } = useFidgets();
  const live = useScene();
  const shell = useMemo(() => buildShell(M, night), [M, night]);
  useEffect(
    () => () => {
      disposeBuilt(shell.base);
      shell.storeys.forEach(disposeBuilt);
    },
    [shell],
  );
  useEffect(() => {
    shell.storeys.forEach((g, i) => {
      g.visible = lift == null || i <= lift;
    });
    // each flight lifts off with the plate it arrives at
    shell.flights.forEach((f, i) => {
      f.visible = lift == null || i + 1 <= lift;
    });
  }, [shell, lift]);
  const lit = [
    lightOn["kitchen-light"] ?? live.lights.kitchen,
    lightOn["living-light"] ?? live.lights.living,
    lightOn.lamp ?? live.lights.lamp,
  ];
  const show = (i: number) => lift == null || i <= lift;

  return (
    <group name="shell">
      <primitive object={shell.base} />
      {shell.storeys.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
      {show(0) && (
        <>
          <Kitchen />
          <KitchenPendant on={lit[0]} />
          <MaquetteWindow position={[SHELL.kitchenWindow.x, FLOORS[0].y + SHELL.kitchenWindow.y, GEO.wallInZ - 0.03]} w={SHELL.kitchenWindow.w} h={SHELL.kitchenWindow.h} />
          <SwayPlant position={[SHELL.plantLiving.x, FLOORS[0].y, SHELL.plantLiving.z]} scale={0.9} />
          <SwayPlant position={[SHELL.plantBed.x, FLOORS[0].y, SHELL.plantBed.z]} scale={0.7} />
        </>
      )}
      {show(2) && (
        <group position={[GEO.wallInX - 0.03, FLOORS[2].y + SHELL.bedWindow.y, SHELL.bedWindow.z]} rotation={[0, Math.PI / 2, 0]}>
          <MaquetteWindow position={[0, 0, 0]} w={SHELL.bedWindow.d} h={SHELL.bedWindow.h} catalog />
        </group>
      )}
      {!night && <DaylightPatches lift={lift} />}
      {/* night: a soft, shadowless warm bounce in each lit room so chair backs and wardrobe fronts read as wood, not holes */}
      {night &&
        lit.map((on, i) =>
          on && show(i) ? <pointLight key={i} position={[-0.3, FLOORS[i].y + 1.7, FRONT - 0.2]} color="#FFD3A8" intensity={0.9 * Math.PI} distance={7} decay={1.4} /> : null,
        )}
    </group>
  );
}

/**
 * By day, a soft pool of window light on the floor in front of each window (sky light, so it is diffuse and has no hard
 * sun edge). One merged quad mesh, one shared material: +1 draw call, no texture.
 */
const DAYLIGHT = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  // additive: the patch adds warm light to whatever floor/rug is under it, with the window's mullion cross as a soft shadow
  blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color("#FFE4BC") }, uPeak: { value: 0.26 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader:
    "uniform vec3 uColor; uniform float uPeak; varying vec2 vUv; void main(){ float side = smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.78,vUv.x); float fall = pow(1.0-vUv.y, 1.7)*smoothstep(0.0,0.06,vUv.y); float bar = 1.0 - 0.75*max(1.0-smoothstep(0.012,0.03,abs(vUv.x-0.5)), 1.0-smoothstep(0.012,0.03,abs(vUv.y-0.42))); gl_FragColor = vec4(uColor, side*fall*bar*uPeak); }",
});
function DaylightPatches({ lift }: { lift: number | null }) {
  const geo = useMemo(() => {
    const show = (i: number) => lift == null || i <= lift;
    const quads: number[][] = [];
    const k = SHELL.kitchenWindow;
    if (show(0)) {
      const y = FLOORS[0].y + 0.006;
      const z0 = GEO.wallInZ + 0.02;
      // [x,y,z] of: wall-left, wall-right, far-right, far-left (u across, v away from the wall)
      quads.push([k.x - k.w / 2 - 0.12, y, z0, k.x + k.w / 2 + 0.12, y, z0, k.x + k.w / 2 + 0.42, y, z0 + 1.25, k.x - k.w / 2 + 0.12, y, z0 + 1.25]);
    }
    const b = SHELL.bedWindow;
    if (show(2)) {
      const y = FLOORS[2].y + 0.006;
      const x0 = GEO.wallInX + 0.02;
      quads.push([x0, y, b.z + b.d / 2 + 0.12, x0, y, b.z - b.d / 2 - 0.12, x0 + 1.1, y, b.z - b.d / 2 + 0.1, x0 + 1.1, y, b.z + b.d / 2 + 0.4]);
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    quads.forEach((q, i) => {
      pos.push(...q);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      const o = i * 4;
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [lift]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh name="daylight" geometry={geo} material={DAYLIGHT} renderOrder={1} raycast={() => null} userData={{ noContact: true, skipContact: true }} />;
}

function KitchenPendant({ on }: { on: boolean }) {
  const { M } = useMats();
  const built = useBuilt(() => pendant(M, on, HOUSE.roomH), [M, on]);
  // hangs over the kitchen table
  const z = -0.35 + ((0.9 - FLOORS[0].z0) / (FLOORS[0].z1 - FLOORS[0].z0)) * (HOUSE.zFront - HOUSE.zBack);
  return (
    <group name="obj:kitchen-pendant" position={[-0.6, FLOORS[0].y, z]}>
      <primitive object={built.group} />
      {on && <pointLight position={[0, HOUSE.roomH - 0.8, 0]} color={PAL.lamp} intensity={3} distance={4.6} decay={2} />}
    </group>
  );
}

const GLASS_DAY: Record<string, string> = { sun: "#E4EBF3", clouds: "#E1E4E8", rain: "#D3DAE2", snow: "#EEF1F4", fog: "#E6E7E6" };
/** One shared glass material per (night, sky) for every window pane: clearcoat-like sheen from low roughness + env. */
const GLASS = new Map<string, THREE.MeshPhysicalMaterial>();
function glassMaterial(night: boolean, sky: string) {
  const key = `${night}|${sky}`;
  let m = GLASS.get(key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color: night ? "#3A4558" : (GLASS_DAY[sky] ?? GLASS_DAY.sun),
      emissive: night ? "#1E2633" : "#DCE5F0",
      emissiveIntensity: night ? 0.4 : 0.35,
      roughness: 0.12,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: night ? 0.75 : 0.6,
      depthWrite: false,
      envMapIntensity: 0.6,
    });
    GLASS.set(key, m);
  }
  const env = currentEnv();
  if (env && m.envMap !== env) {
    m.envMap = env;
    m.needsUpdate = true;
  }
  return m;
}

function MaquetteWindow({ position, w, h, catalog = false }: { position: [number, number, number]; w: number; h: number; catalog?: boolean }) {
  const { M } = useMats();
  const { sky, night } = useAtmosphere();
  const { curtainsOpen, toggleCurtains, say } = useFidgets();
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const drops = useRef<THREE.Group>(null);
  const open = useRef(curtainsOpen ? 1 : 0);
  const wet = sky === "rain" || sky === "snow";
  const cw = 0.2;
  const shut = (w / 2 + 0.03) / cw;
  // curtains share the house's one surface material (linen tone + sheen baked into the pleat geometry)
  const curtainGeo = useMemo(() => familyPaint(pleatGeo(cw, h + 0.12, 0.04, 4).clone(), M.linen), [M, h]);
  useEffect(() => () => curtainGeo.dispose(), [curtainGeo]);
  const curtainMat = familyMaterial("fabric", night);
  const glassMat = useMemo(() => glassMaterial(night, sky), [night, sky]);
  useFrame(({ clock }, delta) => {
    open.current += ((curtainsOpen ? 1 : 0) - open.current) * Math.min(1, delta * 4);
    const o = open.current;
    const drift = Math.sin(clock.elapsedTime * 0.8 + position[0]) * 0.006;
    const sx = shut + (1 - shut) * o;
    const x = w / 4 + (w / 2 + 0.05 - w / 4) * o;
    if (left.current) {
      left.current.scale.x = sx;
      left.current.position.x = -x + drift;
    }
    if (right.current) {
      right.current.scale.x = sx;
      right.current.position.x = x - drift;
    }
    if (drops.current) {
      drops.current.children.forEach((child, index) => {
        const speed = sky === "snow" ? 0.12 : 0.42;
        child.position.y = h * 0.3 - ((clock.elapsedTime * speed + index * 0.13) % (h * 0.6));
      });
    }
  });
  return (
    <Tap
      onTap={() => {
        toggleCurtains();
        if (catalog) tapObject("window");
        say(curtainsOpen ? "Curtains drawn" : "Curtains open");
      }}
    >
      <group name="obj:window" position={position}>
        <mesh position={[0, 0, -0.01]} userData={{ noContact: true }} material={glassMat}>
          <planeGeometry args={[w - 0.08, h - 0.08]} />
        </mesh>
        {wet && (
          <group ref={drops} position={[0, 0, -0.005]}>
            {Array.from({ length: 8 }, (_, index) => (
              <mesh key={index} position={[-w * 0.36 + (index % 4) * w * 0.24, 0, 0]} userData={{ noContact: true }}>
                <boxGeometry args={[sky === "snow" ? 0.024 : 0.008, sky === "snow" ? 0.024 : 0.06, 0.004]} />
                <meshBasicMaterial color={sky === "snow" ? "#F7F5F0" : "#C9D3DC"} />
              </mesh>
            ))}
          </group>
        )}
        {sky === "fog" && (
          <mesh position={[0, 0, -0.004]} userData={{ noContact: true }}>
            <planeGeometry args={[w - 0.08, h - 0.08]} />
            <meshBasicMaterial color="#ECEBE8" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        )}
        {/* pleated linen panels: a real fold profile, not a slab */}
        <group ref={left} position={[-(w / 2 + 0.05), -0.06, 0.09]}>
          <mesh material={curtainMat} receiveShadow geometry={curtainGeo} position={[0, -(h + 0.12) / 2, 0]} dispose={null} />
        </group>
        <group ref={right} position={[w / 2 + 0.05, -0.06, 0.09]}>
          <mesh material={curtainMat} receiveShadow geometry={curtainGeo} position={[0, -(h + 0.12) / 2, 0]} dispose={null} />
        </group>
      </group>
    </Tap>
  );
}

function Kitchen() {
  const { M } = useMats();
  const built = useBuilt(() => counter(M), [M]);
  const { cabinetOpen, toggleCabinet, say } = useFidgets();
  const open = useRef(0);
  useFrame((_, delta) => {
    open.current += ((cabinetOpen ? 1 : 0) - open.current) * Math.min(1, delta * 5);
    built.parts.left.rotation.y = -open.current * 1.15;
    built.parts.right.rotation.y = open.current * 1.15;
  });
  useEffect(() => () => disposeBuilt(built.group), [built]);
  return (
    <group name="obj:kitchen-counter" position={[SHELL.counter.x, FLOORS[0].y, SHELL.counter.z]}>
      <Tap
        onTap={() => {
          toggleCabinet();
          say(cabinetOpen ? "Cabinet shut" : "Cabinet open");
        }}
      >
        <primitive object={built.group} />
      </Tap>
    </group>
  );
}

"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { LiveSnapshot } from "@/components/use-room";
import { useAtmosphere } from "./atmosphere";
import { AgentAvatar } from "./avatar";
import { Furniture, HouseDog, HouseMaterials, RoomShell, SceneLiveProvider } from "./furniture";
import { HouseFallback, RoomStageBoundary } from "./house-fallback";
import { ComputerOverlay, ComputerProvider } from "./computer-desk";
import { stagePose } from "@/lib/room/layout";
import { HudAnchors } from "@/components/hud/anchors-bridge";
import { DeckContext, FidgetNote, FidgetProvider, useFidgets } from "./interact";

const BOUNDS = new THREE.Box3(new THREE.Vector3(-2.62, -0.46, -0.55), new THREE.Vector3(2.62, 8.58, 2.35));
/** Front-cut dollhouse. A small lift shows the floor depth and the stairs. */
const VIEW = new THREE.Vector3(0, 0.42, 1).normalize();
const _corner = new THREE.Vector3();
const _center = new THREE.Vector3();
const _screenUp = new THREE.Vector3();

function floorBox(floor: string | null) {
  const x0 = -2.22;
  const x1 = 2.22;
  const z0 = -0.42;
  const z1 = 2.2;
  if (floor === "kitchen") return new THREE.Box3(new THREE.Vector3(x0, -0.22, z0), new THREE.Vector3(x1, 2.64, z1));
  if (floor === "living") return new THREE.Box3(new THREE.Vector3(x0, 2.68, z0), new THREE.Vector3(x1, 5.52, z1));
  if (floor === "bedroom") return new THREE.Box3(new THREE.Vector3(x0, 5.52, z0), new THREE.Vector3(x1, 8.5, z1));
  return BOUNDS;
}

function fitCamera(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  box: THREE.Box3,
  floorMode: boolean,
  focus: { x: number; y: number; z: number } | null,
) {
  const portrait = height > width;
  const topInset = portrait ? 46 : 48;
  const bottomInset = portrait ? 72 : 64;
  const sideInset = portrait ? (floorMode ? 0 : 8) : 48;
  const availW = Math.max(120, width - sideInset * 2);
  const availH = Math.max(120, height - topInset - bottomInset);

  box.getCenter(_center);
  if (floorMode && focus) {
    _center.x = THREE.MathUtils.clamp(focus.x, box.min.x + 0.4, box.max.x - 0.4);
    _center.y = THREE.MathUtils.clamp(focus.y + 0.7, box.min.y + 0.3, box.max.y - 0.3);
  }
  camera.position.copy(_center).addScaledVector(VIEW, 18);
  camera.up.set(0, 1, 0);
  camera.lookAt(_center);
  camera.near = 0.1;
  camera.far = 60;
  camera.zoom = 1;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    _corner.applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, _corner.x);
    maxX = Math.max(maxX, _corner.x);
    minY = Math.min(minY, _corner.y);
    maxY = Math.max(maxY, _corner.y);
  }

  const zoomW = availW / Math.max(0.01, maxX - minX);
  const zoomH = availH / Math.max(0.01, maxY - minY);
  const framed = floorMode || portrait ? Math.max(zoomW, zoomH) : Math.min(zoomW, zoomH);
  camera.zoom = framed * (floorMode ? 1 : portrait ? 1 : 0.96);

  const upPx = height / 2 - (topInset + availH / 2);
  _screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const shift = upPx / camera.zoom;
  _center.addScaledVector(_screenUp, -shift);
  camera.position.copy(_center).addScaledVector(VIEW, 18);
  camera.lookAt(_center);
  camera.updateProjectionMatrix();
}

function LabelSpacing() {
  const gl = useThree((state) => state.gl);
  const deck = useContext(DeckContext);
  const tick = useRef(0);
  useFrame(() => {
    tick.current += 1;
    if (tick.current % 3 !== 0) return;
    const host = gl.domElement.parentElement;
    if (!host) return;
    const nodes = [...host.querySelectorAll<HTMLElement>(".agent-stack")].filter((el) => el.style.visibility !== "hidden");
    if (!nodes.length) return;
    const bounds = host.getBoundingClientRect();
    const narrow = bounds.width < 800;
    const bottomLimit = bounds.bottom - (narrow ? Math.max(deck.bottom, 72) : 18);
    const topLimit = bounds.top + (narrow ? 46 : 8);
    const items = nodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, left: rect.left, top: rect.top, w: rect.width, h: rect.height, dx: 0, dy: 0 };
      })
      .sort((a, b) => a.top - b.top);
    const gap = 6;
    for (let i = 1; i < items.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const above = items[j];
        const below = items[i];
        const ax1 = above.left + above.dx;
        const ay2 = above.top + above.dy + above.h;
        const bx1 = below.left + below.dx;
        const by1 = below.top + below.dy;
        const overlapX = Math.min(ax1 + above.w, bx1 + below.w) - Math.max(ax1, bx1);
        if (overlapX > 4 && by1 < ay2 + gap) {
          const shift = overlapX + 12;
          const roomRight = bounds.right - 8 - (below.left + below.dx + below.w);
          if (roomRight >= shift) below.dx += shift;
          else above.dx -= shift;
        }
      }
    }
    for (const item of items) {
      const left = item.left + item.dx;
      const top = item.top + item.dy;
      if (left < bounds.left + 8) item.dx += bounds.left + 8 - left;
      const right = item.left + item.dx + item.w;
      if (right > bounds.right - 8) item.dx -= right - (bounds.right - 8);
      if (top < topLimit) item.dy += topLimit - top;
      const bottom = item.top + item.dy + item.h;
      if (bottom > bottomLimit) item.dy -= bottom - bottomLimit;
    }
    for (const item of items) {
      if (item.dx === 0 && item.dy === 0) continue;
      const top = Number.parseFloat(item.el.style.top) || 0;
      const left = Number.parseFloat(item.el.style.left) || 0;
      item.el.style.top = `${top + item.dy}px`;
      item.el.style.left = `${left + item.dx}px`;
    }
  });
  return null;
}

function Backdrop() {
  const { night } = useAtmosphere();
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const paint = ctx.createRadialGradient(128, 70, 16, 128, 150, 210);
    if (night) {
      paint.addColorStop(0, "#4a3428");
      paint.addColorStop(0.55, "#2a1c16");
      paint.addColorStop(1, "#120e0c");
    } else {
      paint.addColorStop(0, "#f3dcc0");
      paint.addColorStop(0.48, "#c9956c");
      paint.addColorStop(1, "#6d4630");
    }
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, 256, 256);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [night]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh position={[0, 4, -2.4]} renderOrder={-1}>
      <planeGeometry args={[36, 36]} />
      <meshBasicMaterial map={texture} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function pixelBudget() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const tight = ios || memory <= 4;
  return {
    dpr: tight ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
    shadow: tight ? 512 : 1024,
    antialias: true,
  };
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) || canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function GlWatch({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    onLostRef.current = onLost;
  }, [onLost]);
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    const lost = (event: Event) => {
      event.preventDefault();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onLostRef.current(), 700);
    };
    const restored = () => window.clearTimeout(timer);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl]);
  return null;
}

function Picture({ night, shadows }: { night: boolean; shadows: boolean }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.shadowMap.enabled = shadows;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = night ? 1.14 : 1.05;
  }, [gl, night, shadows]);
  return null;
}

function KeyLight() {
  const { night } = useAtmosphere();
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((state) => state.scene);
  const mapSize = useMemo(() => pixelBudget().shadow, []);

  useLayoutEffect(() => {
    const sun = light.current;
    if (!sun) return;
    sun.target.position.set(0, 4.1, 0);
    scene.add(sun.target);
    return () => {
      scene.remove(sun.target);
    };
  }, [scene]);

  return (
    <directionalLight
      ref={light}
      position={[-6.2, 12.4, 7.4]}
      intensity={night ? 0.58 : 1.32}
      color={night ? "#ffc48a" : "#fff3e2"}
      castShadow={mapSize > 0}
      shadow-mapSize-width={mapSize || 256}
      shadow-mapSize-height={mapSize || 256}
      shadow-camera-near={1}
      shadow-camera-far={36}
      shadow-camera-left={-7}
      shadow-camera-right={7}
      shadow-camera-top={9}
      shadow-camera-bottom={-5}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

function RoomAmbient({
  night,
  lights,
}: {
  night: boolean;
  lights: { lamp: boolean; living: boolean; kitchen: boolean };
}) {
  const { lightOn } = useFidgets();
  const any =
    (lightOn.lamp ?? lights.lamp) ||
    (lightOn["living-light"] ?? lights.living) ||
    (lightOn["kitchen-light"] ?? lights.kitchen);
  return <ambientLight color={night ? "#ffd3ae" : "#fff6ea"} intensity={night ? 0.22 : any ? 0.4 : 0.2} />;
}

function FixedCamera({ focus }: { focus: { x: number; y: number; z: number } | null }) {
  const camera = useThree((state) => state.camera) as THREE.OrthographicCamera;
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    const floor = new URLSearchParams(window.location.search).get("floor");
    const mode = floor === "kitchen" || floor === "living" || floor === "bedroom";
    fitCamera(camera, size.width, size.height, floorBox(mode ? floor : null), mode, focus);
    document.documentElement.dataset.floorFrame = mode ? floor! : "all";
    document.documentElement.dataset.roomZoom = String(Math.round(camera.zoom));
  }, [camera, size.width, size.height, focus]);

  return null;
}

export function RoomCanvas({
  snapshot,
  selectedId,
  onSelectAgent,
  deck = "peek",
  onUnavailable,
  onOpenBooks,
  onTapRadio,
  onTapDog,
}: {
  snapshot: LiveSnapshot;
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  deck?: "min" | "peek" | "open";
  onUnavailable?: () => void;
  onOpenBooks?: () => void;
  onTapRadio?: () => void;
  onTapDog?: () => void;
}) {
  const { night } = useAtmosphere();
  const skew = snapshot.serverTime - snapshot.receivedAt;
  const lit = (id: string) => snapshot.objects.some((object) => object.id === id && object.state.on === true);
  const kettle = snapshot.objects.some((object) => object.id === "kettle" && object.state.heating === true);
  const live = useMemo(
    () => ({
      kettle,
      lights: { lamp: lit("lamp"), living: lit("living-light"), kitchen: lit("kitchen-light") },
      drawings: snapshot.drawings ?? [],
      station: snapshot.radio?.name ?? "",
      onOpenBooks: onOpenBooks ?? (() => {}),
      onTapRadio: onTapRadio ?? (() => {}),
      onTapDog: onTapDog ?? (() => {}),
    }),
    [kettle, snapshot.objects, snapshot.drawings, snapshot.radio?.name, onOpenBooks, onTapRadio, onTapDog],
  );
  const bottom = deck === "min" ? 28 : 118;
  const [down, setDown] = useState(() => !webglAvailable());
  const budget = useMemo(() => pixelBudget(), []);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  useEffect(() => {
    if (down) onUnavailableRef.current?.();
  }, [down]);

  if (down) return <HouseFallback agents={snapshot.agents} />;

  return (
    <div
      className="room-stage relative h-full w-full"
      onPointerDown={(event) => {
        if (event.target instanceof HTMLCanvasElement) onSelectAgent(null);
      }}
    >
      <FidgetProvider>
        <ComputerProvider>
        <DeckContext.Provider value={{ bottom }}>
          <RoomStageBoundary fallback={<HouseFallback agents={snapshot.agents} />}>
          <Canvas
            orthographic
            shadows={budget.shadow > 0}
            dpr={budget.dpr}
            camera={{ position: [0, 6, 16], zoom: 70, near: 0.1, far: 60 }}
            onCreated={() => performance.mark("house-webgl")}
            gl={{
              antialias: budget.antialias,
              alpha: false,
              powerPreference: "high-performance",
              failIfMajorPerformanceCaveat: false,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.02,
            }}
            onPointerMissed={() => onSelectAgent(null)}
          >
            <color attach="background" args={[night ? "#140e0c" : "#8d5c40"]} />
            <Picture night={night} shadows={budget.shadow > 0} />
            <Backdrop />
            <hemisphereLight args={[night ? "#ffd8b0" : "#fff6e8", night ? "#6b4632" : "#8d7464", night ? 0.46 : 0.5]} />
            <RoomAmbient night={night} lights={live.lights} />
            <KeyLight />
            <HouseMaterials>
              <SceneLiveProvider value={live}>
                <RoomShell />
                {snapshot.objects.map((object) => (
                  <Furniture key={object.id} object={object} />
                ))}
                {snapshot.dog && <HouseDog dog={snapshot.dog} agents={snapshot.agents} skew={skew} />}
              </SceneLiveProvider>
            </HouseMaterials>
            {snapshot.agents.map((agent) => (
              <AgentAvatar
                key={agent.id}
                agent={agent}
                skew={skew}
                focused={agent.id === selectedId}
                onSelect={onSelectAgent}
              />
            ))}
            <LabelSpacing />
            <HudAnchors snapshot={snapshot} />
            <FixedCamera
              focus={
                selectedId
                  ? stagePose(
                      snapshot.agents.find((agent) => agent.id === selectedId)?.position.x ?? 0,
                      snapshot.agents.find((agent) => agent.id === selectedId)?.position.z ?? 0,
                    )
                  : null
              }
            />
            <GlWatch onLost={() => setDown(true)} />
          </Canvas>
          </RoomStageBoundary>
          <FidgetNote />
          <ComputerOverlay />
        </DeckContext.Provider>
        </ComputerProvider>
      </FidgetProvider>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stagePose } from "@/lib/room/layout";
import type { PublicObject } from "@/lib/room/types";
import { useFidgets } from "./interact";
import { DeskModel } from "./computer-desk";
import { tapObject, useOptimistic } from "./viewer-tap";
import { INK, Tap, flag, num, useBuilt, useMats, useScene } from "./furniture-kit";
import { disposeBuilt, mergeStatic } from "./maquette/kit";
import { GEO, PAL } from "./maquette/config";
import { blk } from "./maquette/kit";
import * as P from "./maquette/pieces";
import { NewsTape, headlinesOf } from "./tv-tape";

const DRAWN = new Set(["sofa", "bed", "tv", "computer", "lamp", "fridge", "bookshelf", "window", "sink", "stove", "kettle", "radio", "light", "plant", "wall", "table", "chair", "wardrobe", "dogbed"]);

/** Untappable, unmoving pieces: drawn together by <StaticFurniture>, one merged mesh for the lot. */
export const STATIC_KINDS = new Set(["bed", "table", "chair"]);

export function StaticFurniture({ objects }: { objects: PublicObject[] }) {
  const { M } = useMats();
  const key = objects.map((o) => `${o.id}:${o.kind}:${o.position.x},${o.position.y},${o.position.z},${o.rotation}`).join("|");
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = "static-batch";
    for (const o of objects) {
      const b = o.kind === "bed" ? P.bed(M) : o.kind === "table" ? P.table(M) : P.lounge(M);
      // each piece first bakes its own AO/tone in its local frame (floor at y = 0) ...
      mergeStatic(b.group);
      const s = stagePose(o.position.x, o.position.z);
      b.group.position.set(s.x, s.y + o.position.y, s.z);
      b.group.rotation.y = o.rotation;
      g.add(b.group);
    }
    // ... then the whole set collapses into one mesh per bucket
    mergeStatic(g, {});
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [M, key]);
  useEffect(() => () => disposeBuilt(group), [group]);
  return <primitive object={group} />;
}

export function Furniture({ object }: { object: PublicObject }) {
  const staged = stagePose(object.position.x, object.position.z);
  return (
    <group name={"obj:" + object.id} position={[staged.x, staged.y + object.position.y, staged.z]} rotation={[0, object.rotation, 0]}>
      {object.kind === "sofa" && <SofaModel />}

      {object.kind === "tv" && <TvModel state={object.state} />}
      {object.kind === "computer" && <DeskModel state={object.state} />}
      {object.kind === "lamp" && <LampModel id="lamp" on={flag(object.state, "on")} onLabel="Bedroom lamp on" offLabel="Bedroom lamp off" />}
      {object.kind === "fridge" && <FridgeModel state={object.state} />}
      {object.kind === "bookshelf" && <ShelfModel />}
      {object.kind === "sink" && <SinkModel running={flag(object.state, "running")} />}
      {object.kind === "stove" && <StoveModel hot={flag(object.state, "hot")} />}
      {object.kind === "kettle" && <KettleModel heating={flag(object.state, "heating")} />}
      {object.kind === "radio" && <RadioModel on={flag(object.state, "on")} />}
      {object.id === "living-light" && <LampModel id="living-light" on={flag(object.state, "on")} onLabel="Living room light on" offLabel="Living room light off" />}
      {object.kind === "light" && object.id !== "living-light" && <SwitchTap id={object.id} on={flag(object.state, "on")} wallDz={GEO.wallInZ - staged.z} />}
      {object.kind === "plant" && <GrowingPlant stage={num(object.state, "stage", 1)} />}
      {object.kind === "wall" && <Gallery wallDx={GEO.wallInX - staged.x} rotation={object.rotation} />}
      {object.kind === "wardrobe" && <WardrobeTap open={flag(object.state, "open")} />}
      {object.kind === "dogbed" && <DogBedTap />}
      {!DRAWN.has(object.kind) && <Static make="crate" name={object.name} />}
    </group>
  );
}

function Static({ make, name }: { make: "bed" | "table" | "lounge" | "crate"; name?: string }) {
  const { M } = useMats();
  const built = useBuilt(() => P[make](M), [M, make]);
  return <primitive object={built.group} name={name} />;
}

function SofaModel() {
  const { M } = useMats();
  const { cushion, puffCushion, say } = useFidgets();
  const built = useBuilt(() => P.sofa(M, cushion), [M, cushion]);
  return (
    <Tap
      onTap={() => {
        puffCushion();
        tapObject("sofa");
        say("Cushion fluffed");
      }}
    >
      <primitive object={built.group} />
    </Tap>
  );
}

function TvModel({ state }: { state: Record<string, unknown> }) {
  const { M, night } = useMats();
  const { say } = useFidgets();
  const powerServer = flag(state, "power");
  const [power, setPower] = useOptimistic(powerServer);
  const headlines = headlinesOf(state);
  const built = useBuilt(() => P.tv(M, power), [M, power]);
  return (
    <Tap
      onTap={() => {
        const next = !power;
        setPower(next);
        tapObject("tv");
        say(next ? "Television on" : "Television off");
      }}
    >
      <primitive object={built.group} />
      {power && night && <pointLight position={[0, 0.8, 0.5]} color="#D9E3EE" intensity={0.5} distance={2.6} decay={2} />}
      <NewsTape power={power} headlines={headlines} band={built.parts.band} />
    </Tap>
  );
}

function LampModel({ id, on: serverOn, onLabel, offLabel }: { id: string; on: boolean; onLabel: string; offLabel: string }) {
  const { M } = useMats();
  const { say, setLightOn } = useFidgets();
  const [on, setOn] = useOptimistic(serverOn);
  useEffect(() => {
    setLightOn(id, serverOn);
  }, [id, serverOn, setLightOn]);
  // the living-room lamp steps 14 cm toward the stair rail so a side table fits beside the sofa arm
  const living = id === "living-light";
  const built = useBuilt(() => P.floorLamp(M, on, living), [M, on, living]);
  return (
    <Tap
      onTap={() => {
        const next = !on;
        setOn(next);
        setLightOn(id, next);
        tapObject(id);
        say(next ? onLabel : offLabel);
      }}
    >
      <group position={[living ? 0.14 : 0, 0, 0]}>
        <primitive object={built.group} />
        {on && <pointLight position={[0, 1.32, 0]} color={PAL.lamp} intensity={3.2} distance={5.2} decay={2} />}
      </group>
    </Tap>
  );
}

function FridgeModel({ state }: { state: Record<string, unknown> }) {
  const { M } = useMats();
  const built = useBuilt(() => P.fridge(M), [M]);
  const { fridgeUntil, peekFridge, say } = useFidgets();
  const openUntil = num(state, "openUntil");
  useFrame((_, delta) => {
    const door = built.parts.door;
    const open = openUntil > Date.now() || fridgeUntil > Date.now();
    const target = open ? 1.2 : 0;
    door.rotation.y += (target - door.rotation.y) * Math.min(1, delta * 6);
  });
  return (
    <Tap
      onTap={() => {
        peekFridge();
        tapObject("fridge");
        say(openUntil > Date.now() || fridgeUntil > Date.now() ? "Fridge shut" : "Fridge open");
      }}
    >
      <primitive object={built.group} />
    </Tap>
  );
}

function ShelfModel() {
  const { M } = useMats();
  const built = useBuilt(() => P.bookshelf(M), [M]);
  const { onOpenBooks } = useScene();
  const { bookOut, toggleBook, say } = useFidgets();
  const slide = useRef(0);
  useFrame((_, delta) => {
    slide.current += ((bookOut ? 1 : 0) - slide.current) * Math.min(1, delta * 6);
    built.parts.book.position.z = slide.current * 0.16;
  });
  return (
    <Tap
      onTap={() => {
        toggleBook();
        onOpenBooks();
        tapObject("bookshelf");
        say(bookOut ? "Book slid back" : "A book slides out");
      }}
    >
      <primitive object={built.group} />
    </Tap>
  );
}

function SinkModel({ running: serverOn }: { running: boolean }) {
  const { M } = useMats();
  const built = useBuilt(() => P.sink(M), [M]);
  const { say } = useFidgets();
  const [running, setRunning] = useOptimistic(serverOn);
  const flow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!flow.current) return;
    flow.current.visible = running;
    flow.current.scale.y = 0.85 + Math.sin(clock.elapsedTime * 18) * 0.1;
  });
  return (
    <Tap
      onTap={() => {
        const next = !running;
        setRunning(next);
        tapObject("sink");
        say(next ? "Tap running" : "Tap off");
      }}
    >
      <primitive object={built.group} />
      <mesh ref={flow} position={[0, 0.74 + 0.1, 0]} material={M.water} userData={{ noContact: true }}>
        <cylinderGeometry args={[0.007, 0.009, 0.18, 8]} />
      </mesh>
    </Tap>
  );
}

function StoveModel({ hot: serverOn }: { hot: boolean }) {
  const { M } = useMats();
  const { say } = useFidgets();
  const [hot, setHot] = useOptimistic(serverOn);
  const built = useBuilt(() => P.stove(M, hot), [M, hot]);
  return (
    <Tap
      onTap={() => {
        const next = !hot;
        setHot(next);
        tapObject("stove");
        say(next ? "Stove on" : "Stove off");
      }}
    >
      <primitive object={built.group} />
      {hot && <pointLight position={[0, 0.95, 0.1]} color="#E79A6B" intensity={0.8} distance={1.6} decay={2} />}
    </Tap>
  );
}

function RadioModel({ on }: { on: boolean }) {
  const { M } = useMats();
  const { onTapRadio, station } = useScene();
  const built = useBuilt(() => P.radio(M, on), [M, on]);
  return (
    <Tap onTap={() => onTapRadio()}>
      <primitive object={built.group} name={station} />
    </Tap>
  );
}

function GrowingPlant({ stage }: { stage: number }) {
  const { say } = useFidgets();
  const scale = 0.45 + Math.min(4, Math.max(1, stage)) * 0.18;
  return (
    <SwayPlant
      position={[0, 0, 0]}
      scale={scale}
      onTap={() => {
        tapObject("plant");
        say("Plant watered");
      }}
    />
  );
}

/** Terracotta pot + foliage-green leaves. Sways a little; a tap nudges it. */
export function SwayPlant({ position, scale = 1, onTap }: { position: [number, number, number]; scale?: number; onTap?: () => void }) {
  const { M } = useMats();
  const built = useBuilt(() => P.plant(M), [M], { noCast: true });
  const ref = useRef<THREE.Group>(null);
  const extra = useRef(0);
  const { plantNudge, nudgePlant, say } = useFidgets();
  const seen = useRef(plantNudge);
  useFrame(({ clock }, delta) => {
    if (plantNudge !== seen.current) {
      seen.current = plantNudge;
      extra.current = 1;
    }
    extra.current *= Math.pow(0.08, delta);
    if (!ref.current) return;
    const amp = 0.02 + extra.current * 0.18;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.25 + position[0] * 2) * amp;
    ref.current.rotation.x = Math.cos(clock.elapsedTime * 0.9 + position[2]) * amp * 0.35;
  });
  return (
    <Tap
      onTap={() => {
        if (onTap) onTap();
        else {
          nudgePlant();
          say("The leaves shiver");
        }
      }}
    >
      <group ref={ref} position={position} scale={scale}>
        <primitive object={built.group} />
      </group>
    </Tap>
  );
}

function KettleModel({ heating: serverOn }: { heating: boolean }) {
  const { M } = useMats();
  const built = useBuilt(() => P.kettle(M), [M]);
  const { say } = useFidgets();
  const live = useScene();
  const [heating, setHeating] = useOptimistic(serverOn);
  const steaming = heating || live.kettle;
  const puffs = useRef<THREE.Mesh[]>([]);
  useFrame((_, delta) => {
    puffs.current.forEach((mesh, index) => {
      if (!steaming) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.y += delta * (0.2 + index * 0.03);
      if (mesh.position.y > 1.3) mesh.position.y = 0.94;
      // one shared steam material: puffs thin out by shrinking instead of fading
      mesh.scale.setScalar(Math.max(0.15, 1 - (mesh.position.y - 0.94) / 0.42));
    });
  });
  return (
    <Tap
      onTap={() => {
        const next = !heating;
        setHeating(next);
        tapObject("kettle");
        say(next ? "Kettle on" : "Kettle quiet");
      }}
    >
      <primitive object={built.group} />
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          ref={(node) => {
            if (node) puffs.current[index] = node;
          }}
          position={[0.02, 0.96 + index * 0.12, 0]}
          material={M.steam}
          userData={{ noContact: true }}
        >
          <sphereGeometry args={[0.028 + index * 0.008, 12, 8]} />
        </mesh>
      ))}
    </Tap>
  );
}

function SwitchTap({ id, on: serverOn, wallDz }: { id: string; on: boolean; wallDz: number }) {
  const { M } = useMats();
  const { say, setLightOn } = useFidgets();
  const [on, setOn] = useOptimistic(serverOn);
  useEffect(() => {
    setLightOn(id, serverOn);
  }, [id, serverOn, setLightOn]);
  const built = useBuilt(() => P.wallSwitch(M, on, wallDz), [M, on, wallDz]);
  const name = id === "kitchen-light" ? "Kitchen light" : "Light";
  return (
    <Tap
      onTap={() => {
        const next = !on;
        setOn(next);
        setLightOn(id, next);
        tapObject(id);
        say(next ? `${name} on` : `${name} off`);
      }}
    >
      <primitive object={built.group} />
      {/* generous invisible hit box: the plate itself is 9 x 13 cm */}
      <mesh position={[0, -0.1, wallDz + 0.06]} userData={{ noContact: true }} visible={false}>
        <boxGeometry args={[0.26, 0.32, 0.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Tap>
  );
}

function WardrobeTap({ open: serverOn }: { open: boolean }) {
  const { M } = useMats();
  const built = useBuilt(() => P.wardrobe(M), [M]);
  const { say } = useFidgets();
  const [open, setOpen] = useOptimistic(serverOn);
  const swing = useRef(0);
  useFrame((_, delta) => {
    swing.current += ((open ? 1 : 0) - swing.current) * Math.min(1, delta * 5);
    built.parts.left.rotation.y = -swing.current * 1.4;
    built.parts.right.rotation.y = swing.current * 1.4;
  });
  return (
    <Tap
      onTap={() => {
        const next = !open;
        setOpen(next);
        tapObject("wardrobe");
        say(next ? "Wardrobe open" : "Wardrobe shut");
      }}
    >
      <primitive object={built.group} />
    </Tap>
  );
}

function DogBedTap() {
  const { M } = useMats();
  const built = useBuilt(() => P.dogbed(M), [M]);
  const { say } = useFidgets();
  return (
    <Tap
      onTap={() => {
        tapObject("dog-bed");
        say("Dog bed");
      }}
    >
      <primitive object={built.group} />
    </Tap>
  );
}

/**
 * Agents' 8x8 drawings, hung on the left wall's inner face. Each is 64 instanced cells in the muted ink (no textures).
 * The catalog's wall object is rotated a quarter turn, so local z points out of the left wall into the room.
 */
function Gallery({ wallDx, rotation }: { wallDx: number; rotation: number }) {
  const { drawings } = useScene();
  const along = Math.abs(Math.sin(rotation)) > 0.5;
  const depth = along ? wallDx * Math.sign(Math.sin(rotation)) : 0;
  return (
    <group position={[0, 0, depth + 0.012]}>
      {drawings.slice(0, 6).map((drawing, index) => (
        <DrawingFrame key={drawing.id} pixels={drawing.pixels} index={index} />
      ))}
    </group>
  );
}

const CELL = 0.024;
const cellGeo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96);

function DrawingFrame({ pixels, index }: { pixels: string; index: number }) {
  const { M } = useMats();
  const frame = useBuilt(() => {
    const g = new THREE.Group();
    blk(g, M.birch, 0.3, 0.3, 0.022, 0, -0.15, 0, { r: 0.006 });
    blk(g, M.plaster, 0.25, 0.25, 0.006, 0, -0.125, 0.012, { r: 0.002, cast: false });
    return { group: g, parts: {} };
  }, [M]);
  const cells = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const im = new THREE.InstancedMesh(cellGeo, mat, 64);
    const mx = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < 64; i += 1) {
      const nibble = Number.parseInt(pixels[i] ?? "0", 16);
      mx.makeTranslation(-CELL * 3.5 + (i % 8) * CELL, CELL * 3.5 - Math.floor(i / 8) * CELL, 0.017);
      im.setMatrixAt(i, mx);
      im.setColorAt(i, col.set(INK[Number.isFinite(nibble) ? nibble % INK.length : 0]));
    }
    im.userData.noContact = true;
    return im;
  }, [pixels]);
  useEffect(
    () => () => {
      (cells.material as THREE.Material).dispose();
      cells.dispose();
    },
    [cells],
  );
  const x = -0.46 + (index % 3) * 0.4;
  const y = 1.72 - Math.floor(index / 3) * 0.4;
  return (
    <group position={[x, y, 0]}>
      <primitive object={frame.group} />
      <primitive object={cells} />
    </group>
  );
}

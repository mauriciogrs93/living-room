"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, NearestFilter, SRGBColorSpace, type Group, type Mesh } from "three";
import { bed, sofa, stagePose } from "@/lib/room/layout";
import type { PublicObject } from "@/lib/room/types";
import { useFidgets } from "./interact";
import { DeskModel } from "./computer-desk";
import { tapObject, useOptimistic } from "./viewer-tap";
import { makeScreenTexture } from "./textures";
import { C, Chunk, INK, Tap, flag, num, str, useMaps, useScene } from "./furniture-kit";
import { DogBed, LampHalo, SeatChair, SwitchPlate, TableSet, Wardrobe } from "./furniture-extra";
import { SwayPlant } from "./furniture-shell";
import { NewsTape, headlinesOf } from "./tv-tape";

const DRAWN = new Set(["sofa", "bed", "tv", "computer", "lamp", "fridge", "bookshelf", "window", "sink", "stove", "kettle", "radio", "light", "plant", "wall", "table", "chair", "wardrobe", "dogbed"]);

export function Furniture({ object }: { object: PublicObject }) {
  const staged = stagePose(object.position.x, object.position.z);
  return (
    <group position={[staged.x, staged.y + object.position.y, staged.z]} rotation={[0, object.rotation, 0]}>
      {object.kind === "sofa" && <SofaModel />}
      {object.kind === "bed" && <BedModel />}
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
      {object.kind === "light" && object.id !== "living-light" && <SwitchTap id={object.id} on={flag(object.state, "on")} />}
      {object.kind === "plant" && <GrowingPlant stage={num(object.state, "stage", 1)} />}
      {object.kind === "wall" && <Gallery />}
      {object.kind === "table" && <TableSet />}
      {object.kind === "chair" && <SeatChair />}
      {object.kind === "wardrobe" && <WardrobeTap open={flag(object.state, "open")} />}
      {object.kind === "dogbed" && <DogBedTap />}
      {!DRAWN.has(object.kind) && <Crate label={object.name} />}
    </group>
  );
}

function SofaModel() {
  const maps = useMaps();
  const { cushion, puffCushion, say } = useFidgets();
  const w = sofa.width;
  const d = sofa.depth;
  return (
    <Tap
      onTap={() => {
        puffCushion();
        tapObject("sofa");
        say("Cushion fluffed");
      }}
    >
      <group>
        <Chunk position={[0, 0.2, 0]} args={[w, 0.28, d]} map={maps.sage} radius={0.08} roughness={0.9} />
        <Chunk position={[0, 0.48, -d / 2 + 0.1]} args={[w - 0.06, 0.42, 0.18]} map={maps.sage} radius={0.06} roughness={0.9} />
        <Chunk position={[-w / 2 + 0.1, 0.38, 0.02]} args={[0.16, 0.28, d - 0.1]} map={maps.sage} radius={0.05} />
        <Chunk position={[w / 2 - 0.1, 0.38, 0.02]} args={[0.16, 0.28, d - 0.1]} map={maps.sage} radius={0.05} />
        <Chunk position={[-0.46, cushion ? 0.42 : 0.38, 0.06]} args={[0.4, 0.1, d - 0.22]} map={maps.sageLight} radius={0.04} />
        <Chunk position={[0, 0.38, 0.06]} args={[0.4, 0.1, d - 0.22]} map={maps.sageLight} radius={0.04} />
        <Chunk position={[0.46, 0.38, 0.06]} args={[0.4, 0.1, d - 0.22]} map={maps.sageLight} radius={0.04} />
        <Chunk position={[-0.4, 0.58, -0.08]} args={[0.28, 0.2, 0.12]} map={maps.cream} radius={0.05} rotation={[0.2, 0, 0.08]} />
        <Chunk position={[0.52, 0.56, -0.06]} args={[0.3, 0.2, 0.12]} map={maps.rust} radius={0.05} rotation={[0.12, 0, -0.05]} />
        <Chunk position={[0, 0.08, 0.02]} args={[w - 0.2, 0.08, d - 0.16]} map={maps.wood} radius={0.02} />
      </group>
    </Tap>
  );
}

function BedModel() {
  const maps = useMaps();
  const length = bed.length;
  const width = bed.width;
  return (
    <group>
      <Chunk position={[0, 0.14, 0]} args={[length, 0.14, width]} map={maps.wood} radius={0.03} />
      <Chunk position={[0, 0.28, 0]} args={[length - 0.08, 0.14, width - 0.08]} map={maps.cream} radius={0.04} roughness={0.88} />
      <Chunk position={[length / 2 - 0.06, 0.5, 0]} args={[0.1, 0.46, width]} map={maps.wood} radius={0.03} />
      <Chunk position={[length / 2 - 0.24, 0.42, -0.12]} args={[0.28, 0.12, 0.32]} map={maps.cream} radius={0.04} />
      <Chunk position={[length / 2 - 0.26, 0.42, 0.16]} args={[0.26, 0.1, 0.28]} color={C.pillow} radius={0.04} roughness={0.8} />
      <Chunk position={[-0.08, 0.4, 0]} args={[length * 0.55, 0.07, width - 0.16]} map={maps.rust} radius={0.03} roughness={0.86} />
    </group>
  );
}

function TvModel({ state }: { state: Record<string, unknown> }) {
  const maps = useMaps();
  const { say } = useFidgets();
  const powerServer = flag(state, "power");
  const [power, setPower] = useOptimistic(powerServer);
  const name = str(state, "channelName", "Meadow");
  const color = str(state, "channelColor", "#6fa35a");
  const accent = str(state, "channelAccent", "#e5f2c4");
  const headlines = headlinesOf(state);
  const tape = headlines.map((item) => `${item.title} — ${item.source}`).join(" · ");
  const texture = useMemo(() => makeScreenTexture(power, name, color, accent, tape), [power, name, color, accent, tape]);
  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <Tap
      onTap={() => {
        const next = !power;
        setPower(next);
        tapObject("tv");
        say(next ? "Television on" : "Television off");
      }}
    >
      <group>
        <Chunk position={[0, 0.18, -0.02]} args={[1.35, 0.16, 0.4]} map={maps.wood} radius={0.03} />
        <Chunk position={[-0.42, 0.1, 0]} args={[0.06, 0.16, 0.28]} map={maps.wood} radius={0.015} />
        <Chunk position={[0.42, 0.1, 0]} args={[0.06, 0.16, 0.28]} map={maps.wood} radius={0.015} />
        <Chunk position={[0, 0.95, 0]} args={[1.28, 0.78, 0.08]} color={C.tv} radius={0.03} roughness={0.42} metalness={0.18} />
        <mesh position={[0, 0.95, 0.045]}>
          <planeGeometry args={[1.12, 0.62]} />
          {texture ? (
            <meshStandardMaterial
              map={texture}
              emissive={power ? color : "#000"}
              emissiveMap={power ? texture : null}
              emissiveIntensity={power ? 0.55 : 0}
              roughness={0.35}
              toneMapped={false}
            />
          ) : (
            <meshStandardMaterial color={power ? color : "#14161a"} emissive={power ? color : "#000"} emissiveIntensity={power ? 0.4 : 0} />
          )}
        </mesh>
        {power && <pointLight position={[0, 0.95, 0.7]} color={color} intensity={3.2} distance={4.5} decay={2} />}
        <NewsTape power={power} headlines={headlines} />
      </group>
    </Tap>
  );
}

function LampModel({ id, on: serverOn, onLabel, offLabel }: { id: string; on: boolean; onLabel: string; offLabel: string }) {
  const maps = useMaps();
  const { say, setLightOn } = useFidgets();
  const shade = useRef<Mesh>(null);
  const [on, setOn] = useOptimistic(serverOn);
  useEffect(() => {
    setLightOn(id, serverOn);
  }, [id, serverOn, setLightOn]);
  useFrame(({ clock }) => {
    const material = shade.current?.material;
    if (!material || Array.isArray(material) || !("emissiveIntensity" in material)) return;
    material.emissiveIntensity = on ? 1.25 + Math.sin(clock.elapsedTime * 2.2) * 0.08 : 0;
  });
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
      <group>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.06, 20]} />
          <meshStandardMaterial map={maps.wood ?? undefined} color="#ffffff" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.7, 0]} castShadow>
          <cylinderGeometry args={[0.025, 0.03, 1.15, 12]} />
          <meshStandardMaterial color={C.brass} roughness={0.38} metalness={0.55} />
        </mesh>
        <mesh ref={shade} position={[0, 1.32, 0]} castShadow>
          <sphereGeometry args={[0.22, 24, 18]} />
          <meshStandardMaterial color={on ? "#ffe2a8" : C.shade} roughness={0.4} emissive={on ? "#ffb03a" : "#000"} emissiveIntensity={on ? 1.25 : 0} />
        </mesh>
        {on && (
          <>
            <pointLight position={[0, 1.15, 0.15]} color="#ffb15e" intensity={16} distance={8} decay={2} />
            <LampHalo />
            <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.95, 28]} />
              <meshBasicMaterial color="#ffc56a" transparent opacity={0.42} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.48, 24]} />
              <meshBasicMaterial color="#fff1c4" transparent opacity={0.55} depthWrite={false} />
            </mesh>
          </>
        )}
      </group>
    </Tap>
  );
}

function FridgeModel({ state }: { state: Record<string, unknown> }) {
  const maps = useMaps();
  const door = useRef<Group>(null);
  const { fridgeUntil, peekFridge, say } = useFidgets();
  const openUntil = num(state, "openUntil");
  useFrame((_, delta) => {
    if (!door.current) return;
    const open = openUntil > Date.now() || fridgeUntil > Date.now();
    const target = open ? -1.2 : 0;
    door.current.rotation.y += (target - door.current.rotation.y) * Math.min(1, delta * 6);
  });

  return (
    <group>
      <Chunk position={[-0.42, 0.38, 0]} args={[0.62, 0.7, 0.48]} map={maps.wood} radius={0.03} />
      <mesh position={[-0.42, 0.78, 0]}>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshStandardMaterial color={C.pot} roughness={0.7} />
      </mesh>
      <mesh position={[-0.5, 0.88, 0.03]}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshStandardMaterial color="#d4653a" />
      </mesh>
      <mesh position={[-0.32, 0.86, -0.02]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial color="#e2b84a" />
      </mesh>
      <Tap
        onTap={() => {
          peekFridge();
          tapObject("fridge");
          say(openUntil > Date.now() || fridgeUntil > Date.now() ? "Fridge shut" : "Fridge open");
        }}
      >
        <group>
          <Chunk position={[0.15, 0.82, 0]} args={[0.62, 1.58, 0.58]} map={maps.enamel} radius={0.04} roughness={0.32} metalness={0.08} />
          <group ref={door} position={[0.44, 1.15, 0.28]}>
            <Chunk position={[-0.26, 0, 0]} args={[0.52, 0.62, 0.045]} map={maps.enamel} radius={0.02} roughness={0.3} metalness={0.06} />
            <mesh position={[-0.08, 0, 0.03]}>
              <boxGeometry args={[0.03, 0.16, 0.03]} />
              <meshStandardMaterial color="#b9c4be" metalness={0.45} roughness={0.35} />
            </mesh>
          </group>
        </group>
      </Tap>
    </group>
  );
}

function ShelfModel() {
  const maps = useMaps();
  const { onOpenBooks } = useScene();
  const { bookOut, toggleBook, say } = useFidgets();
  const book = useRef<Group>(null);
  const slide = useRef(0);
  const spines = ["#8f3d32", "#3f6154", "#c6a15a", "#6d88a8", "#f6f1e8", "#8d4d62", "#a8483c", "#6e8f72", "#4e4038", "#e6d3b8"];
  useFrame((_, delta) => {
    slide.current += (((bookOut ? 1 : 0) - slide.current) * Math.min(1, delta * 6));
    if (book.current) book.current.position.z = 0.1 + slide.current * 0.16;
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
      <group>
        <Chunk position={[0, 0.95, 0]} args={[0.78, 1.82, 0.32]} map={maps.wood} radius={0.03} />
        <Chunk position={[0, 0.95, 0.02]} args={[0.66, 1.66, 0.18]} color="#a86b42" radius={0.02} roughness={0.8} />
        {[0.35, 0.8, 1.25, 1.68].map((y) => (
          <Chunk key={y} position={[0, y, 0.05]} args={[0.68, 0.035, 0.24]} map={maps.wood} radius={0.01} />
        ))}
        {spines.map((color, index) => {
          const row = Math.floor(index / 5);
          const col = index % 5;
          const node = (
            <group position={[-0.26 + col * 0.13, 0.52 + row * 0.45, index === 2 ? 0 : 0.1]}>
              <Chunk position={[0, 0, 0]} args={[0.1, 0.26, 0.12]} color={color} radius={0.012} />
              <mesh position={[0, 0.02, 0.062]}>
                <boxGeometry args={[0.062, 0.14, 0.006]} />
                <meshStandardMaterial color="#f6eedc" />
              </mesh>
            </group>
          );
          if (index === 2) {
            return (
              <group key={`${color}-${index}`} ref={book}>
                {node}
              </group>
            );
          }
          return <group key={`${color}-${index}`}>{node}</group>;
        })}
      </group>
    </Tap>
  );
}

function SinkModel({ running: serverOn }: { running: boolean }) {
  const { say } = useFidgets();
  const [running, setRunning] = useOptimistic(serverOn);
  const flow = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!flow.current) return;
    flow.current.visible = running;
    flow.current.scale.y = running ? 0.7 + Math.sin(clock.elapsedTime * 18) * 0.2 : 0.2;
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
    <group position={[0, 0.72, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.14, 0.08, 16]} />
        <meshStandardMaterial color="#d9d3c8" roughness={0.28} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <torusGeometry args={[0.05, 0.012, 8, 14]} />
        <meshStandardMaterial color="#b9c0c4" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={flow} position={[0, -0.08, 0]}>
        <boxGeometry args={[0.03, 0.16, 0.03]} />
        <meshStandardMaterial color="#9fd4ea" transparent opacity={0.75} />
      </mesh>
    </group>
    </Tap>
  );
}

function StoveModel({ hot: serverOn }: { hot: boolean }) {
  const { say } = useFidgets();
  const [hot, setHot] = useOptimistic(serverOn);
  return (
    <Tap
      onTap={() => {
        const next = !hot;
        setHot(next);
        tapObject("stove");
        say(next ? "Stove on" : "Stove off");
      }}
    >
    <group position={[0, 0.74, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.42, 0.08, 0.36]} />
        <meshStandardMaterial color="#2c2826" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.06, 0.1, 16]} />
        <meshStandardMaterial color={hot ? "#e07a3d" : "#5c534c"} emissive={hot ? "#ff6a2a" : "#000"} emissiveIntensity={hot ? 0.8 : 0} />
      </mesh>
      {hot && <pointLight position={[0, 0.2, 0.1]} color="#ff8a3d" intensity={1.4} distance={1.8} decay={2} />}
    </group>
    </Tap>
  );
}

function RadioModel({ on }: { on: boolean }) {
  const { onTapRadio, station } = useScene();
  const glow = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const material = glow.current?.material;
    if (!material || Array.isArray(material) || !("emissiveIntensity" in material)) return;
    material.emissiveIntensity = on ? 0.4 + Math.sin(clock.elapsedTime * 6) * 0.25 : 0;
  });
  return (
    <Tap
      onTap={() => {
        onTapRadio();
      }}
    >
      <group>
      <mesh position={[0, 0.39, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.48, 0.78, 0.36]} />
        <meshStandardMaterial color="#6b4a32" roughness={0.72} />
      </mesh>
      <group position={[0, 0.82, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.34, 0.16, 0.14]} />
          <meshStandardMaterial color="#5c3a24" roughness={0.55} />
        </mesh>
        <mesh position={[-0.08, 0.02, 0.07]}>
          <circleGeometry args={[0.045, 16]} />
          <meshStandardMaterial color="#1a1410" />
        </mesh>
        <mesh ref={glow} position={[0.08, 0.02, 0.075]}>
          <circleGeometry args={[0.02, 12]} />
          <meshStandardMaterial color={on ? "#e07a3d" : "#3a2c24"} emissive={on ? "#ffb15a" : "#000"} />
        </mesh>
        <mesh position={[0, 0.12, 0]} visible={false} name={station} />
      </group>
      </group>
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

function KettleModel({ heating: serverOn }: { heating: boolean }) {
  const { say } = useFidgets();
  const live = useScene();
  const [heating, setHeating] = useOptimistic(serverOn);
  const steaming = heating || live.kettle;
  const puffs = useRef<Mesh[]>([]);
  useFrame((_, delta) => {
    puffs.current.forEach((mesh, index) => {
      const material = mesh.material as { opacity: number };
      if (!steaming) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.y += delta * (0.22 + index * 0.03);
      if (mesh.position.y > 0.55) mesh.position.y = 0.16;
      material.opacity = 0.28 * (1 - mesh.position.y / 0.6);
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
      <group position={[0, 0.82, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.075, 0.14, 16]} />
          <meshStandardMaterial color="#c5ccd1" metalness={0.72} roughness={0.28} />
        </mesh>
        <mesh position={[0.08, 0.01, 0]} rotation={[0, 0, -0.6]}>
          <cylinderGeometry args={[0.016, 0.02, 0.07, 8]} />
          <meshStandardMaterial color="#aeb6bc" metalness={0.7} roughness={0.3} />
        </mesh>
        {[0, 1, 2].map((index) => (
          <mesh
            key={index}
            ref={(node) => {
              if (node) puffs.current[index] = node;
            }}
            position={[0, 0.18 + index * 0.1, 0]}
          >
            <sphereGeometry args={[0.03 + index * 0.006, 8, 6]} />
            <meshBasicMaterial color="#f7f4ef" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </Tap>
  );
}

function SwitchTap({ id, on: serverOn }: { id: string; on: boolean }) {
  const { say, setLightOn } = useFidgets();
  const [on, setOn] = useOptimistic(serverOn);
  useEffect(() => {
    setLightOn(id, serverOn);
  }, [id, serverOn, setLightOn]);
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
      <group position={[0, -0.05, 0.12]}>
        <SwitchPlate on={on} />
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[0.22, 0.28, 0.08]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </Tap>
  );
}

function WardrobeTap({ open: serverOn }: { open: boolean }) {
  const { say } = useFidgets();
  const [open, setOpen] = useOptimistic(serverOn);
  return (
    <Tap
      onTap={() => {
        const next = !open;
        setOpen(next);
        tapObject("wardrobe");
        say(next ? "Wardrobe open" : "Wardrobe shut");
      }}
    >
      <Wardrobe open={open} />
    </Tap>
  );
}

function DogBedTap() {
  const { say } = useFidgets();
  return (
    <Tap
      onTap={() => {
        tapObject("dog-bed");
        say("Dog bed");
      }}
    >
      <DogBed />
    </Tap>
  );
}

function drawingTexture(pixels: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    for (let i = 0; i < 64; i += 1) {
      const nibble = Number.parseInt(pixels[i] ?? "0", 16);
      ctx.fillStyle = INK[Number.isFinite(nibble) ? nibble % INK.length : 0]!;
      ctx.fillRect(i % 8, Math.floor(i / 8), 1, 1);
    }
  }
  const map = new CanvasTexture(canvas);
  map.magFilter = NearestFilter;
  map.minFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  return map;
}

function Gallery() {
  const { drawings } = useScene();
  return (
    <group>
      {drawings.slice(0, 6).map((drawing, index) => (
        <DrawingFrame key={drawing.id} pixels={drawing.pixels} index={index} />
      ))}
    </group>
  );
}

function DrawingFrame({ pixels, index }: { pixels: string; index: number }) {
  const texture = useMemo(() => drawingTexture(pixels), [pixels]);
  useEffect(() => () => texture.dispose(), [texture]);
  const x = -0.7 + (index % 3) * 0.46;
  const y = 1.55 - Math.floor(index / 3) * 0.42;
  return (
    <group position={[x, y, 0]}>
      <mesh>
        <boxGeometry args={[0.32, 0.32, 0.03]} />
        <meshStandardMaterial color="#f7f1e6" />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.24, 0.24]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Crate({ label }: { label: string }) {
  const maps = useMaps();
  return (
    <mesh name={label} position={[0, 0.28, 0]} castShadow>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial map={maps.wood ?? undefined} color="#ffffff" />
    </mesh>
  );
}

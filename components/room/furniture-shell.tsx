"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";
import { FLOORS, HOUSE, SHELL } from "@/lib/room/layout";
import { HouseStairs } from "./furniture-stairs";
import { paintSkyCanvas, useAtmosphere } from "./atmosphere";
import { useFidgets } from "./interact";
import { tapObject } from "./viewer-tap";
import { C, Chunk, Tap, useMaps, useScene, type Maps } from "./furniture-kit";

export function RoomShell() {
  const { dusk, night } = useAtmosphere();
  const maps = useMaps();
  const { lightOn } = useFidgets();
  const live = useScene();
  const floorLit = [
    lightOn["kitchen-light"] ?? live.lights.kitchen,
    lightOn["living-light"] ?? live.lights.living,
    lightOn.lamp ?? live.lights.lamp,
  ];
  const x0 = HOUSE.x0 - 0.18;
  const x1 = HOUSE.x1 + 0.18;
  const width = x1 - x0;
  const zBack = HOUSE.zBack - 0.12;
  const zFront = HOUSE.zFront + 0.16;
  const depth = zFront - zBack;
  const zMid = (zBack + zFront) / 2;
  const top = FLOORS[2].y + HOUSE.roomH;
  // Right-hand shaft. Floors stop here so a climber on the stairs is not buried.
  const cut = 1.22;
  const bayW = cut - x0;
  const bayX = (x0 + cut) / 2;

  return (
    <group>
      <RoundedBox position={[0, -0.24, zMid]} args={[width + 0.34, 0.42, depth + 0.34]} radius={0.08} smoothness={2} receiveShadow>
        <meshStandardMaterial map={maps.wood ?? undefined} color="#ffffff" roughness={0.62} />
      </RoundedBox>

      {FLOORS.map((floor, index) => {
        const wall = index === 2 ? maps.bedroom : index === 1 ? maps.stripe : maps.plaster;
        const roof = index === 2;
        const ground = index === 0;
        const slabX = roof ? 0 : bayX;
        const slabW = roof ? width + 0.16 : bayW + 0.08;
        const floorX = ground ? 0 : bayX;
        const floorW = ground ? width - 0.12 : bayW - 0.1;
        return (
          <group key={floor.y} position={[0, floor.y, 0]}>
            <mesh position={[floorX, 0.05, (zBack + zFront) / 2]} receiveShadow>
              <boxGeometry args={[floorW, 0.1, depth - 0.1]} />
              <meshStandardMaterial
                map={maps.floor ?? undefined}
                bumpMap={maps.floorBump ?? undefined}
                bumpScale={0.05}
                color={maps.floor ? "#ffffff" : "#b8885a"}
                roughness={0.86}
              />
            </mesh>
            {index > 0 && (
              <mesh position={[bayX, -0.04, (zBack + zFront) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[bayW - 0.12, depth - 0.16]} />
                <meshBasicMaterial color="#120e0c" transparent opacity={0.42} depthWrite={false} />
              </mesh>
            )}
            <Chunk position={[0, HOUSE.roomH / 2, zBack]} args={[width, HOUSE.roomH, 0.1]} map={wall} radius={0.02} roughness={0.94} castShadow={false} />
            <Chunk position={[x0, HOUSE.roomH / 2, zMid]} args={[0.12, HOUSE.roomH, depth]} map={maps.plaster} radius={0.02} roughness={0.94} castShadow={false} />
            <Chunk position={[x1, HOUSE.roomH / 2, zMid]} args={[0.12, HOUSE.roomH, depth]} map={maps.plaster} radius={0.02} roughness={0.94} castShadow={false} />
            <mesh position={[0, 0.07, zBack + 0.08]} receiveShadow>
              <boxGeometry args={[width - 0.28, 0.07, 0.045]} />
              <meshStandardMaterial map={maps.wood ?? undefined} color="#ffffff" roughness={0.7} />
            </mesh>
            <Chunk position={[slabX, HOUSE.roomH, (zBack + zFront) / 2]} args={[slabW, HOUSE.frame, depth + 0.08]} map={maps.wood} radius={0.03} roughness={0.58} />
            <pointLight
              position={[0.2, 1.85, 0.85]}
              intensity={(index === 2 ? 0.45 : 0.52) + (night ? 0.9 : dusk ? 0.28 : 0) + (floorLit[index] ? 1.85 : 0)}
              distance={5.4}
              decay={2}
              color={night ? "#ffb56a" : "#fff1d4"}
            />
            <Chunk position={[slabX, HOUSE.roomH, zFront - 0.02]} args={[roof ? width + 0.28 : bayW + 0.14, 0.22, 0.22]} map={maps.wood} radius={0.04} roughness={0.55} />
          </group>
        );
      })}

      <group position={[0, FLOORS[0].y, 0]}>
        <mesh position={[0, 1.28, HOUSE.zBack - 0.02]}>
          <planeGeometry args={[width - 0.5, 0.9]} />
          <meshStandardMaterial map={maps.tile ?? undefined} color="#ffffff" roughness={0.42} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.48, HOUSE.zBack - 0.015]} receiveShadow>
          <planeGeometry args={[width - 0.7, 0.62]} />
          <meshStandardMaterial map={maps.brick ?? undefined} color="#ffffff" roughness={0.92} />
        </mesh>
      </group>

      <HouseStairs />
      <Chunk position={[x0 - 0.02, top / 2, zFront]} args={[0.28, top + 0.5, 0.22]} map={maps.wood} radius={0.04} roughness={0.55} />
      <Chunk position={[x1 + 0.02, top / 2, zFront]} args={[0.28, top + 0.5, 0.22]} map={maps.wood} radius={0.04} roughness={0.55} />

      <group position={[SHELL.bedWindow.x, FLOORS[2].y + SHELL.bedWindow.y, SHELL.bedWindow.z]} rotation={[0, Math.PI / 2, 0]}>
        <ShutterWindow position={[0, 0, 0]} catalog />
      </group>
      <ShutterWindow position={[SHELL.kitchenWindow.x, FLOORS[0].y + SHELL.kitchenWindow.y, SHELL.kitchenWindow.z]} />

      <Frame position={[SHELL.frameGap.x, FLOORS[SHELL.frameGap.floor].y + SHELL.frameGap.y, SHELL.frameGap.z]} w={SHELL.frameGap.d} h={SHELL.frameGap.h} map={maps.art} rotation={[0, -Math.PI / 2, 0]} />
      <Frame position={[SHELL.frameTv.x, FLOORS[SHELL.frameTv.floor].y + SHELL.frameTv.y, SHELL.frameTv.z]} w={SHELL.frameTv.d} h={SHELL.frameTv.h} color="#efe2c4" rotation={[0, -Math.PI / 2, 0]} />
      <Frame position={[SHELL.frameBed.x, FLOORS[SHELL.frameBed.floor].y + SHELL.frameBed.y, SHELL.frameBed.z]} w={SHELL.frameBed.d} h={SHELL.frameBed.h} color="#f3d9c8" rotation={[0, -Math.PI / 2, 0]} />

      <WallShelf position={[SHELL.wallShelf.x, FLOORS[2].y + SHELL.wallShelf.y, SHELL.wallShelf.z]} />
      <Kitchen />
      <SwayPlant position={[SHELL.plantLiving.x, FLOORS[SHELL.plantLiving.floor].y + SHELL.plantLiving.y, SHELL.plantLiving.z]} />
      <SwayPlant position={[SHELL.plantBed.x, FLOORS[SHELL.plantBed.floor].y + SHELL.plantBed.y, SHELL.plantBed.z]} scale={0.72} />

      <Rug position={[0.2, FLOORS[0].y + 0.11, 1.0]} args={[1.15, 0.82]} map={maps.rugGold} />
      <Rug position={[-0.2, FLOORS[1].y + 0.11, 1.2]} args={[1.85, 1.12]} map={maps.rug} />
      <Rug position={[0.15, FLOORS[2].y + 0.11, 1.05]} args={[1.45, 0.9]} map={maps.rugSage} />
    </group>
  );
}

function Rug({
  position,
  args,
  map,
}: {
  position: [number, number, number];
  args: [number, number];
  map: Maps["rug"];
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={args} />
      <meshStandardMaterial map={map ?? undefined} color="#ffffff" roughness={0.92} />
    </mesh>
  );
}

function WeatherGlass() {
  const { sky, night } = useAtmosphere();
  const texture = useMemo(() => {
    const canvas = paintSkyCanvas(sky);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [sky]);
  useEffect(() => () => texture.dispose(), [texture]);
  const drops = useRef<Group>(null);
  const wet = sky === "rain" || sky === "snow";
  useFrame(({ clock }) => {
    const group = drops.current;
    if (!group) return;
    group.children.forEach((child, index) => {
      const speed = sky === "snow" ? 0.12 : 0.42;
      child.position.y = 0.24 - ((clock.elapsedTime * speed + index * 0.13) % 0.52);
    });
  });
  return (
    <>
      <mesh position={[0, 0.02, 0.04]}>
        <planeGeometry args={[0.78, 0.58]} />
        <meshStandardMaterial
          map={texture}
          color="#ffffff"
          roughness={0.28}
          emissive={night ? "#ffb06a" : "#ffd7a8"}
          emissiveIntensity={night ? 0.62 : sky === "sun" ? 0.22 : 0.1}
        />
      </mesh>
      {wet && (
        <group ref={drops} position={[0, 0, 0.055]}>
          {Array.from({ length: 8 }, (_, index) => (
            <mesh key={index} position={[-0.28 + (index % 4) * 0.18, 0.1 - (index > 3 ? 0.2 : 0), 0]}>
              <boxGeometry args={[sky === "snow" ? 0.028 : 0.012, sky === "snow" ? 0.028 : 0.07, 0.008]} />
              <meshBasicMaterial color={sky === "snow" ? "#f4f7fb" : "#d5e7f2"} />
            </mesh>
          ))}
        </group>
      )}
      {sky === "fog" && (
        <mesh position={[0, 0.02, 0.06]}>
          <planeGeometry args={[0.78, 0.58]} />
          <meshBasicMaterial color="#e4e6e2" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

function ShutterWindow({ position, catalog = false }: { position: [number, number, number]; catalog?: boolean }) {
  const maps = useMaps();
  const { curtainsOpen, toggleCurtains, say } = useFidgets();
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const open = useRef(0);
  useFrame(({ clock }, delta) => {
    const target = curtainsOpen ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, delta * 4);
    const drift = Math.sin(clock.elapsedTime * 0.8 + position[0]) * 0.012;
    if (left.current) left.current.position.x = -0.42 - open.current * 0.22 + drift;
    if (right.current) right.current.position.x = 0.42 + open.current * 0.22 - drift;
  });
  return (
    <Tap
      onTap={() => {
        toggleCurtains();
        if (catalog) tapObject("window");
        say(curtainsOpen ? "Curtains drawn" : "Curtains open");
      }}
    >
      <group position={position}>
        <Chunk position={[0, 0, 0]} args={[1.15, 0.9, 0.07]} map={maps.wood} radius={0.03} />
        <WeatherGlass />
        <mesh position={[0, 0.02, 0.045]}>
          <boxGeometry args={[0.025, 0.58, 0.01]} />
          <meshStandardMaterial color="#4a3424" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.02, 0.045]}>
          <boxGeometry args={[0.78, 0.02, 0.01]} />
          <meshStandardMaterial color="#4a3424" roughness={0.5} />
        </mesh>
        <group ref={left}>
          <Chunk position={[0, 0.02, 0.06]} args={[0.22, 0.78, 0.03]} color={C.curtain} radius={0.02} roughness={0.84} />
        </group>
        <group ref={right}>
          <Chunk position={[0, 0.02, 0.06]} args={[0.22, 0.78, 0.03]} color={C.curtainDeep} radius={0.02} roughness={0.84} />
        </group>
      </group>
    </Tap>
  );
}

function Frame({
  position,
  w,
  h,
  color = "#f4eadc",
  map,
  rotation = [0, 0, 0] as [number, number, number],
}: {
  position: [number, number, number];
  w: number;
  h: number;
  color?: string;
  map?: Maps["art"];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <Chunk position={[0, 0, 0]} args={[w, h, 0.04]} color="#5c4030" radius={0.02} roughness={0.45} />
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[w - 0.08, h - 0.08]} />
        {map ? (
          <meshStandardMaterial map={map} roughness={0.62} />
        ) : (
          <meshStandardMaterial color={color} roughness={0.7} />
        )}
      </mesh>
    </group>
  );
}

function WallShelf({ position }: { position: [number, number, number] }) {
  const maps = useMaps();
  const spines = ["#8f3d32", "#3f6154", "#c6a15a", "#6d88a8", "#f4efe6"];
  return (
    <group position={position}>
      <Chunk position={[0, 0, 0.08]} args={[0.7, 0.045, 0.18]} map={maps.wood} radius={0.015} />
      {spines.slice(0, 4).map((color, index) => (
        <Chunk key={color} position={[-0.24 + index * 0.16, 0.16, 0.08]} args={[0.09, 0.24, 0.14]} color={color} radius={0.012} />
      ))}
    </group>
  );
}

export function SwayPlant({
  position,
  scale = 1,
  onTap,
}: {
  position: [number, number, number];
  scale?: number;
  onTap?: () => void;
}) {
  const ref = useRef<Group>(null);
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
    const amp = 0.035 + extra.current * 0.22;
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
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.13, 0.1, 0.16, 16]} />
          <meshStandardMaterial color={C.pot} roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.14, 0.13, 0.03, 16]} />
          <meshStandardMaterial color="#8d4e34" roughness={0.6} />
        </mesh>
        {[0, 1.1, 2.2, 3.4, 4.6].map((angle) => (
          <mesh key={angle} position={[Math.sin(angle) * 0.05, 0.48, Math.cos(angle) * 0.05]} rotation={[0.45, angle, 0.2]} castShadow>
            <capsuleGeometry args={[0.03, 0.36, 4, 8]} />
            <meshStandardMaterial color={angle % 2 ? C.plantDeep : C.plant} roughness={0.62} />
          </mesh>
        ))}
      </group>
    </Tap>
  );
}

function Kitchen() {
  const maps = useMaps();
  const { cabinetOpen, toggleCabinet, say } = useFidgets();
  const leftDoor = useRef<Group>(null);
  const rightDoor = useRef<Group>(null);
  const open = useRef(0);
  useFrame((_, delta) => {
    open.current += (((cabinetOpen ? 1 : 0) - open.current) * Math.min(1, delta * 5));
    if (leftDoor.current) leftDoor.current.rotation.y = -open.current * 1.15;
    if (rightDoor.current) rightDoor.current.rotation.y = open.current * 1.15;
  });
  return (
    <group position={[SHELL.counter.x, FLOORS[0].y, SHELL.counter.z]}>
      <Chunk position={[0, 0.36, 0]} args={[SHELL.counter.w - 0.08, 0.64, 0.48]} map={maps.wood} radius={0.03} />
      <mesh position={[0, 0.7, 0]} receiveShadow>
        <boxGeometry args={[SHELL.counter.w, 0.045, SHELL.counter.d]} />
        <meshStandardMaterial color="#d9d3c8" roughness={0.28} metalness={0.12} />
      </mesh>
      <group ref={leftDoor} position={[-0.88, 0.36, 0.24]}>
        <Tap
          onTap={() => {
            toggleCabinet();
            say(cabinetOpen ? "Cabinet shut" : "Cabinet open");
          }}
        >
          <Chunk position={[0.44, 0, 0]} args={[0.86, 0.5, 0.04]} map={maps.wood} radius={0.015} />
          <mesh position={[0.72, 0, 0.03]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.35} />
          </mesh>
        </Tap>
      </group>
      <group ref={rightDoor} position={[0.88, 0.36, 0.24]}>
        <Tap
          onTap={() => {
            toggleCabinet();
            say(cabinetOpen ? "Cabinet shut" : "Cabinet open");
          }}
        >
          <Chunk position={[-0.44, 0, 0]} args={[0.86, 0.5, 0.04]} map={maps.wood} radius={0.015} />
        </Tap>
      </group>
      <mesh position={[0.22, 0.78, 0.04]} castShadow>
        <cylinderGeometry args={[0.045, 0.04, 0.07, 12]} />
        <meshStandardMaterial color="#f4efe6" roughness={0.4} />
      </mesh>
      <mesh position={[0.34, 0.8, -0.02]}>
        <boxGeometry args={[0.08, 0.1, 0.06]} />
        <meshStandardMaterial color="#6e8f72" roughness={0.55} />
      </mesh>
    </group>
  );
}

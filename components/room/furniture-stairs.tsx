"use client";

import { FLOORS, HOUSE, STAIR_X } from "@/lib/room/layout";
import { useMaps } from "./furniture-kit";

const STEPS = 8;

function Flight({ lower, upper }: { lower: number; upper: number }) {
  const maps = useMaps();
  const y0 = FLOORS[lower]!.y;
  const y1 = FLOORS[upper]!.y;
  const z0 = HOUSE.zFront - 0.02;
  const z1 = HOUSE.zBack + 0.08;
  const run = Math.abs(z1 - z0);
  return (
    <group>
      {Array.from({ length: STEPS }, (_, index) => {
        const t0 = index / STEPS;
        const t1 = (index + 1) / STEPS;
        const rise = (y1 - y0) / STEPS;
        const top = y0 + rise * (index + 1) + 0.015;
        const height = rise * 0.9;
        const z = z0 + (z1 - z0) * ((t0 + t1) / 2);
        return (
          <mesh key={index} position={[STAIR_X, top - height / 2, z]} receiveShadow>
            <boxGeometry args={[0.64, height, (run / STEPS) * 0.94]} />
            <meshStandardMaterial map={maps.wood ?? undefined} color={maps.wood ? "#ffffff" : "#8a5a36"} roughness={0.68} />
          </mesh>
        );
      })}
      <mesh position={[STAIR_X + 0.22, (y0 + y1) / 2 + 0.32, (z0 + z1) / 2]} rotation={[Math.atan2(y1 - y0, run), 0, 0]}>
        <boxGeometry args={[0.035, 0.035, Math.hypot(run, y1 - y0)]} />
        <meshStandardMaterial color="#5c3a24" roughness={0.55} />
      </mesh>
      <mesh position={[STAIR_X + 0.22, y0 + 0.22, z0 - 0.02]}>
        <boxGeometry args={[0.04, 0.42, 0.04]} />
        <meshStandardMaterial color="#5c3a24" roughness={0.55} />
      </mesh>
      <mesh position={[STAIR_X + 0.22, y1 + 0.22, z1 + 0.02]}>
        <boxGeometry args={[0.04, 0.42, 0.04]} />
        <meshStandardMaterial color="#5c3a24" roughness={0.55} />
      </mesh>
    </group>
  );
}

export function HouseStairs() {
  return (
    <group>
      <Flight lower={0} upper={1} />
      <Flight lower={1} upper={2} />
    </group>
  );
}

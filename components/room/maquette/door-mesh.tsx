"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FLOORS } from "@/lib/room/layout";
import { Tap, useBuilt, useMats } from "../furniture-kit";
import { GEO, PAL } from "./config";
import { bar, blk, cap, cyl, sph, type Mats } from "./kit";
import type { Built } from "./pieces";

/**
 * The v16 front door as a maquette piece. Presentational only: the HUD owns the door logic.
 *
 * Placement (proposal): ground floor, LEFT wall, leaf centred 1.15 m from the back wall (stage z 0.75 to 1.55).
 * The stair foot is at the open front-right where there is no wall, and the back wall is taken by the fridge, the
 * counter and the kitchen window, so the left wall is the visible wall nearest the entry route. Its inner face is
 * lit and square-on to the default camera. The leaf swings 70 degrees into the room toward the dining table and
 * stops 0.34 m short of it; the fridge cabinet, the plant and the framed print all stay clear.
 */
export const DOOR_PLACEMENT = {
  x: GEO.wallInX,
  y: FLOORS[0].y,
  z: 1.15,
  rotationY: Math.PI / 2,
  width: 0.8,
  height: 2.04,
} as const;

/**
 * Stage-space centre of the leaf. The door is not a snapshot object, so the HUD
 * ring and the watcher tap publish this point directly (no stagePose).
 * The leaf hangs just inside the wall: local z 0.024 becomes world +x after rotationY.
 */
export function doorLeafAnchor() {
  const leafH = DOOR_PLACEMENT.height - 0.02;
  return {
    x: DOOR_PLACEMENT.x + 0.024,
    y: DOOR_PLACEMENT.y + 0.012 + leafH / 2,
    z: DOOR_PLACEMENT.z,
  };
}

export type DoorMeshProps = { locked: boolean; knocking: boolean; open: boolean; onTap?: () => void };

const W = DOOR_PLACEMENT.width;
/** knock shiver of the leaf (about 2 degrees) */
const KNOCK_SHIVER = THREE.MathUtils.degToRad(2);
const H = DOOR_PLACEMENT.height;

function buildDoor(M: Mats, locked: boolean): Built {
  const g = new THREE.Group();
  // the opening: a soft stone-toned reveal flush in the wall (reads as the hall beyond when the leaf swings open;
  // never a black hole), with a deeper jamb return along the top and sides
  blk(g, M.stone, W + 0.04, H + 0.02, 0.004, 0, 0, 0.001, { r: 0.0015, cast: false, noContact: true });
  for (const sx of [-1, 1]) bar(g, M.linenDeep, 0.02, H + 0.02, 0.012, sx * (W / 2 + 0.01), 0, 0.007);
  bar(g, M.linenDeep, W + 0.04, 0.02, 0.012, 0, H, 0.007);
  // plaster architrave matching the windows, birch plinth blocks, an oak threshold
  const aw = 0.06;
  blk(g, M.plaster, W + 2 * aw + 0.04, aw, 0.018, 0, H + 0.02, 0.009, { r: 0.006 });
  for (const sx of [-1, 1]) {
    blk(g, M.plaster, aw, H + 0.02, 0.018, sx * (W / 2 + 0.02 + aw / 2), 0, 0.009, { r: 0.006 });
    blk(g, M.birch, aw + 0.012, 0.12, 0.024, sx * (W / 2 + 0.02 + aw / 2), 0, 0.012, { r: 0.004 });
  }
  blk(g, M.oak, W + 0.04, 0.012, 0.09, 0, 0, 0.045, { r: 0.004, cast: false });
  // the leaf hangs from a hinge at local +x (world: the back-wall side)
  const pivot = new THREE.Group();
  pivot.position.set(W / 2, 0.012, 0.024);
  pivot.userData.keep = true;
  g.add(pivot);
  const leaf = new THREE.Group();
  leaf.position.set(-W / 2, 0, 0);
  pivot.add(leaf);
  const lw = W - 0.01;
  const lh = H - 0.02;
  blk(leaf, M.oak, lw, lh, 0.04, 0, 0, 0, { r: 0.006 });
  // two raised upper panels with cut grooves
  for (const sx of [-1, 1]) {
    const px = sx * 0.17;
    blk(leaf, M.oak, 0.27, 0.78, 0.008, px, 1.02, 0.022, { r: 0.004 });
    for (const sy of [1.0, 1.82]) bar(leaf, M.seam, 0.29, 0.004, 0.003, px, sy, 0.0205);
    for (const ex of [-1, 1]) {
      const v = bar(leaf, M.seam, 0.004, 0.82, 0.003, px + ex * 0.145, 1.0, 0.0205);
      v.userData.noContact = true;
    }
  }
  // fluted lower panel: half-round reeds between two rails
  blk(leaf, M.oak, lw - 0.1, 0.04, 0.01, 0, 0.9, 0.022, { r: 0.004 });
  blk(leaf, M.oak, lw - 0.1, 0.04, 0.01, 0, 0.1, 0.022, { r: 0.004 });
  for (let k = 0; k < 15; k += 1) {
    const f = cyl(leaf, M.oak, 0.011, 0.011, 0.76, -0.315 + k * 0.045, 0.14, 0.02, { bevel: 0.003, seg: 8 });
    f.castShadow = false;
  }
  // brass hinges on the hinge edge
  for (const hy of [0.25, 1.75]) cyl(pivot, M.brass, 0.008, 0.008, 0.1, 0.003, hy, 0.0, { bevel: 0.002, seg: 10 });
  // lever handle on an escutcheon plate near the free edge
  const hx = -lw / 2 + 0.07;
  blk(leaf, M.brass, 0.042, 0.17, 0.008, hx, 0.94, 0.02, { r: 0.004 });
  cyl(leaf, M.brass, 0.018, 0.018, 0.02, hx, 1.06, 0.028, { rx: Math.PI / 2, bevel: 0.004, seg: 14 });
  cap(leaf, M.brass, 0.009, 0.1, hx + 0.055, 1.06, 0.05, { rz: Math.PI / 2 });
  sph(leaf, M.brass, 0.006, hx, 0.975, 0.025, [1, 1.6, 0.6]);
  // lock: a brass thumb-turn on its rose (horizontal = locked, vertical = unlocked) and a status dot above it
  cyl(leaf, M.brass, 0.022, 0.022, 0.008, hx, 1.22, 0.024, { rx: Math.PI / 2, bevel: 0.003, seg: 16 });
  const turn = blk(leaf, M.brass, 0.05, 0.014, 0.014, hx, 1.213, 0.034, { r: 0.005 });
  if (!locked) {
    turn.rotation.z = Math.PI / 2;
    turn.position.y = 1.22;
  }
  const dot = sph(leaf, locked ? M.terracotta : M.steel, 0.01, hx, 1.29, 0.026, [1, 1, 0.6]);
  dot.castShadow = false;
  // the leaf sits flush in the wall: it never casts into the static shadow map, so the knock shiver and the swing never
  // force a shadow-map redraw (the opening keeps its contact AO)
  pivot.traverse((o) => (o.castShadow = false));
  return { group: g, parts: { pivot, leaf, dot } };
}

/** Presentational front door. Engineer: render <DoorMesh {...door} onTap={...} /> inside the canvas (see room-canvas). */
export function DoorMesh({ locked, knocking, open, onTap }: DoorMeshProps) {
  const { M } = useMats();
  const built = useBuilt(() => buildDoor(M, locked), [M, locked]);
  // after the per-family merge: nothing on the moving leaf casts into the cached shadow map
  useMemo(() => built.parts.pivot.traverse((o) => (o.castShadow = false)), [built]);
  const swing = useRef(open ? 1 : 0);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: PAL.steel, transparent: true, opacity: 0, depthWrite: false }), []);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  useFrame(({ clock }, delta) => {
    swing.current += ((open ? 1 : 0) - swing.current) * Math.min(1, delta * 4);
    if (Math.abs((open ? 1 : 0) - swing.current) < 0.002) swing.current = open ? 1 : 0;
    const t = clock.elapsedTime;
    // knock: three small raps every 1.8 s, a 0.5 degree shiver of the leaf, never a glow
    const cycle = t % 1.8;
    const rap = knocking && cycle < 0.6 ? Math.max(0, Math.sin((cycle / 0.2) * Math.PI)) : 0;
    built.parts.pivot.rotation.y = THREE.MathUtils.degToRad(70) * swing.current + (knocking && !open ? rap * KNOCK_SHIVER : 0);
    const r = ring.current;
    if (r) {
      r.visible = knocking;
      if (knocking) {
        const p = (t % 1.8) / 1.8;
        r.scale.setScalar(1 + p * 0.9);
        ringMat.opacity = 0.85 * (1 - p);
      }
    }
  });
  const inner = (
    <>
      <primitive object={built.group} />
      {/* pulse ring around the lock while someone knocks: graphite ink, readable at phone zoom, never a glow */}
      <mesh ref={ring} position={[-W / 2 + 0.07 + 0.005, 1.25, 0.075]} material={ringMat} visible={false} userData={{ noContact: true }} raycast={() => null}>
        <ringGeometry args={[0.064, 0.09, 40]} />
      </mesh>
    </>
  );
  return (
    <group position={[DOOR_PLACEMENT.x, DOOR_PLACEMENT.y, DOOR_PLACEMENT.z]} rotation={[0, DOOR_PLACEMENT.rotationY, 0]} name="v16-door">
      {onTap ? <Tap onTap={onTap}>{inner}</Tap> : inner}
    </group>
  );
}

import type { Vec2, Vec3 } from "./types";

/**
 * Three stacked rooms share one walkable plan. Each floor is a band of z.
 * The viewer lifts those bands into a vertical dollhouse.
 * Bands are wide enough for the placed furniture. The gaps between them are stairs.
 */
export const FLOORS = [
  { z0: -1.15, z1: 1.55, y: 0 },
  { z0: 3.45, z1: 6.55, y: 2.85 },
  { z0: 8.65, z1: 11.2, y: 5.7 },
] as const;

/** Right-hand flight. Walkers meet the stairs here so the climb stays continuous. */
export const STAIR_X = 1.58;

/** In-place actions must be this close to the approach. Farther ones walk. */
export const IN_PLACE = 0.62;

export const HOUSE = {
  x0: -2.2,
  x1: 2.2,
  zBack: -0.35,
  zFront: 2.15,
  roomH: 2.58,
  frame: 0.16,
};

export const ROOM = {
  id: "living-room",
  name: "The Living Room",
  description:
    "A three-floor dollhouse: a kitchen on the ground floor, a living room in the middle, and a bedroom on top.",
  width: 4.4,
  depth: 2.2,
  height: 8.4,
  bounds: { minX: -1.9, maxX: 1.9, minZ: -1.15, maxZ: 11.2 },
};

export const WINDOW = {
  x: -1.85,
  z: 10.3,
  width: 1.15,
  height: 0.85,
  sill: 1.15,
};

export function worldXZ(
  position: { x: number; z: number },
  rotation: number,
  localX: number,
  localZ: number,
): Vec2 {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return {
    x: position.x + localX * c + localZ * s,
    z: position.z - localX * s + localZ * c,
  };
}

/** Map a walkable x/z into the stacked dollhouse. Mid-stair z values rise between floors. */
const BACK_CLEAR = 0.12;

export function stagePose(x: number, z: number): { x: number; y: number; z: number } {
  const depth = HOUSE.zFront - HOUSE.zBack;
  for (const floor of FLOORS) {
    if (z >= floor.z0 && z <= floor.z1) {
      const t = (z - floor.z0) / (floor.z1 - floor.z0);
      // Physicist 1e: keep the torso off the back wall (inner face at zBack).
      return { x, y: floor.y, z: HOUSE.zBack + BACK_CLEAR + t * (depth - BACK_CLEAR) };
    }
  }
  for (let i = 0; i < FLOORS.length - 1; i += 1) {
    const below = FLOORS[i];
    const above = FLOORS[i + 1];
    if (z > below.z1 && z < above.z0) {
      const t = (z - below.z1) / (above.z0 - below.z1);
      return {
        x: x + (STAIR_X - 0.12 - x) * Math.sin(Math.PI * t),
        y: below.y + (above.y - below.y) * t,
        z: HOUSE.zFront + (HOUSE.zBack + BACK_CLEAR - HOUSE.zFront) * t,
      };
    }
  }
  if (z < FLOORS[0].z0) return { x, y: FLOORS[0].y, z: HOUSE.zBack };
  const top = FLOORS[FLOORS.length - 1];
  return { x, y: top.y, z: HOUSE.zFront };
}

export const sofa = {
  position: { x: -0.32, y: 0, z: 5.7 } as Vec3,
  rotation: Math.PI,
  width: 1.58,
  depth: 0.72,
  seatY: 0.42,
};

export const tv = {
  position: { x: -1.12, y: 0, z: 3.72 } as Vec3,
  rotation: 0,
  approach: { x: -1.5, z: 4.45 } as Vec2,
};

export const lamp = {
  position: { x: 0.22, y: 0, z: 10.6 } as Vec3,
  rotation: 0,
  // Physicist #6: the old approach (−0.48, 10.48) stood inside the bed.
  approach: { x: 0.3, z: 10.05 } as Vec2,
};

export const bookshelf = {
  position: { x: 0.24, y: 0, z: 3.72 } as Vec3,
  rotation: 0,
  approach: { x: -0.2, z: 4.28 } as Vec2,
};

export const bed = {
  position: { x: -0.72, y: 0, z: 10.72 } as Vec3,
  rotation: 0,
  length: 1.46,
  width: 0.95,
  top: 0.42,
  approach: { x: -0.72, z: 9.95 } as Vec2,
};

export const fridge = {
  position: { x: -1.22, y: 0, z: -0.62 } as Vec3,
  rotation: 0,
  approach: { x: -1.22, z: 0.15 } as Vec2,
};

export const windowSpot = {
  position: { x: WINDOW.x, y: 1.35, z: WINDOW.z } as Vec3,
  rotation: Math.PI / 2,
  approach: { x: -1.55, z: 9.95 } as Vec2,
};

export const SPAWNS: Vec2[] = [
  { x: 0.15, z: 0.35 },
  { x: -0.15, z: 0.2 },
  { x: 0.55, z: 0.25 },
  { x: 0.85, z: 0.45 },
  { x: -1.05, z: 0.35 },
];

export const sinkSpot = {
  position: { x: -0.48, y: 0, z: -0.72 } as Vec3,
  rotation: 0,
  approach: { x: -0.48, z: -0.12 } as Vec2,
};

export const stoveSpot = {
  position: { x: 0.22, y: 0, z: -0.72 } as Vec3,
  rotation: 0,
  approach: { x: 0.22, z: -0.12 } as Vec2,
};

export const kettleSpot = {
  position: { x: 0.62, y: 0, z: -0.72 } as Vec3,
  rotation: 0,
  approach: { x: 1.05, z: 0.28 } as Vec2,
};

export const radioSpot = {
  position: { x: -1.82, y: 0, z: 5.7 } as Vec3,
  rotation: 0,
  approach: { x: -1.25, z: 6.22 } as Vec2,
};

export const livingLight = {
  position: { x: 0.86, y: 0, z: 5.78 } as Vec3,
  rotation: 0,
  approach: { x: 0.4, z: 6.28 } as Vec2,
};

export const kitchenLight = {
  position: { x: 0.48, y: 1.42, z: -1.05 } as Vec3,
  rotation: 0,
  approach: { x: -0.05, z: 0.45 } as Vec2,
};

export const plantSpot = {
  position: { x: -1.6, y: 0, z: 1.25 } as Vec3,
  rotation: 0,
  approach: { x: -1.2, z: 0.85 } as Vec2,
};

export const desk = {
  position: { x: -1.58, y: 0, z: 9.4 } as Vec3,
  rotation: 0,
  approach: { x: -0.9, z: 8.95 } as Vec2,
};

export const wallSpot = {
  position: { x: -1.85, y: 0, z: 4.5 } as Vec3,
  rotation: Math.PI / 2,
  approach: { x: -0.85, z: 5.05 } as Vec2,
};

export const tableSpot = {
  position: { x: -0.6, y: 0, z: 0.9 } as Vec3,
  rotation: 0,
  approach: { x: -0.6, z: 0.42 } as Vec2,
};

export const armchairSpot = {
  position: { x: -1.38, y: 0, z: 5.7 } as Vec3,
  rotation: Math.PI,
  approach: { x: -1.38, z: 4.95 } as Vec2,
};

export const readingSpot = {
  position: { x: 0.15, y: 0, z: 1.28 } as Vec3,
  rotation: Math.PI,
  approach: { x: 0.7, z: 0.85 } as Vec2,
};

export const wardrobeSpot = {
  position: { x: 0.84, y: 0, z: 10.6 } as Vec3,
  rotation: 0,
  approach: { x: 0.84, z: 9.9 } as Vec2,
};

export const dogBedSpot = {
  position: { x: -1.74, y: 0, z: 10.22 } as Vec3,
  rotation: 0,
  approach: { x: -1.74, z: 10.75 } as Vec2,
};

/** Preset places an agent can move a few pieces to. Kept off the stair column. */
export const SPOTS: Record<string, Record<string, Vec3>> = {
  sofa: {
    center: { x: -0.32, y: 0, z: 5.7 },
    window: { x: -0.2, y: 0, z: 5.9 },
    wall: { x: -0.15, y: 0, z: 5.55 },
  },
  bookshelf: {
    right: { x: 0.24, y: 0, z: 3.72 },
    left: { x: 0.05, y: 0, z: 4.05 },
  },
  plant: {
    corner: { x: -1.6, y: 0, z: 1.25 },
    window: { x: 1.5, y: 0, z: 0.2 },
  },
  radio: {
    sideboard: { x: -1.82, y: 0, z: 5.7 },
    shelf: { x: 0.7, y: 0, z: 4.15 },
  },
};

/** The dog lives on the bedroom floor. Spots stay off the stairs, so it never crosses a flight. */
export const DOG_SPOTS: Vec2[] = [
  { x: -1.76, z: 10.12 },
  { x: -1.55, z: 10.35 },
  { x: -1.7, z: 9.7 },
  { x: -1.4, z: 10.05 },
];

export const DECOR = {
  rug: { x: -0.2, z: 0.15, w: 1.5, d: 1.05 },
  table: { x: -0.6, z: 0.9 },
  plant: { x: -1.6, z: 1.25 },
  art: { x: -1.85, y: 1.55, z: 4.5 },
  mat: { x: -0.15, z: 8.78 },
};

/** Shell meshes in stage space. y is height above that floor. The overlap script reads these. */
export const SHELL = {
  counter: { x: 0.22, z: -0.08, w: 1.9, d: 0.52, top: 0.74 },
  frameGap: { x: 2.12, y: 1.7, z: 0.95, w: 0.05, h: 0.32, d: 0.28, floor: 1 },
  frameTv: { x: 2.12, y: 1.55, z: 0.35, w: 0.05, h: 0.3, d: 0.26, floor: 0 },
  frameBed: { x: 2.12, y: 1.65, z: 0.4, w: 0.05, h: 0.3, d: 0.26, floor: 2 },
  wallShelf: { x: -1.42, y: 2.02, z: -0.28, w: 0.7, h: 0.26, d: 0.16, floor: 2 },
  plantLiving: { x: 1.42, y: 0, z: 1.2, w: 0.26, h: 0.5, d: 0.26, floor: 0 },
  plantBed: { x: 0.95, y: 0, z: 0.45, w: 0.22, h: 0.4, d: 0.22, floor: 0 },
  kitchenWindow: { x: 1.48, y: 1.28, z: -0.33, w: 1.15, h: 0.9, d: 0.1, floor: 0 },
  bedWindow: { x: -2.12, y: 1.48, z: 1.27, w: 0.12, h: 0.95, d: 1.15, floor: 2 },
};

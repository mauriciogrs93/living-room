import { DOG_SPOTS, FLOORS, ROOM, STAIR_X } from "./layout";
import type { Vec2 } from "./types";

export type Obstacle = { x: number; z: number; hw: number; hd: number };

const FOOT: Record<string, { hw: number; hd: number }> = {
  sofa: { hw: 1.02, hd: 0.36 },
  sink: { hw: 0.32, hd: 0.26 },
  stove: { hw: 0.3, hd: 0.24 },
  fridge: { hw: 0.32, hd: 0.28 },
  table: { hw: 0.42, hd: 0.32 },
  bed: { hw: 0.85, hd: 0.42 },
  armchair: { hw: 0.34, hd: 0.32 },
  "reading-chair": { hw: 0.3, hd: 0.3 },
  bookshelf: { hw: 0.32, hd: 0.18 },
  wardrobe: { hw: 0.36, hd: 0.22 },
  computer: { hw: 0.5, hd: 0.26 },
};

const obstacleStore = globalThis as typeof globalThis & { __livingObstacles?: Obstacle[] };

export function syncObstacles(objects: Iterable<{ id: string; position: { x: number; z: number } }>) {
  const next: Obstacle[] = [];
  for (const object of objects) {
    const size = FOOT[object.id];
    if (!size) continue;
    next.push({ x: object.position.x, z: object.position.z, hw: size.hw, hd: size.hd });
  }
  obstacleStore.__livingObstacles = next;
}

function obstacles() {
  return obstacleStore.__livingObstacles ?? [];
}

/** A place an agent may stop. Stair gaps are for climbing, not for standing. */
export function onFloor(point: Vec2): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  if (point.x < ROOM.bounds.minX || point.x > ROOM.bounds.maxX) return false;
  if (point.z < ROOM.bounds.minZ || point.z > ROOM.bounds.maxZ) return false;
  return FLOORS.some((floor) => point.z >= floor.z0 && point.z <= floor.z1);
}

/** Snap a standing spot onto a floor band. */
export function approachOnFloor(x: number, z: number): Vec2 {
  const clampedX = Math.min(ROOM.bounds.maxX, Math.max(ROOM.bounds.minX, x));
  if (onFloor({ x: clampedX, z })) return { x: clampedX, z };
  let bestZ = FLOORS[0]!.z0 + 0.08;
  let bestDist = Infinity;
  for (const floor of FLOORS) {
    const z2 = Math.min(floor.z1 - 0.08, Math.max(floor.z0 + 0.08, z));
    const dist = Math.abs(z2 - z);
    if (dist < bestDist) {
      bestDist = dist;
      bestZ = z2;
    }
  }
  return { x: clampedX, z: bestZ };
}

/** A step away from a piece, at least 0.32 m, kept on its floor. */
export function standBefore(x: number, z: number, forward = 0.55): Vec2 {
  const floor = FLOORS.find((band) => z >= band.z0 && z <= band.z1);
  if (!floor) return approachOnFloor(x, z);
  const edge = floor.z1 - 0.08;
  const backEdge = floor.z0 + 0.08;
  const ahead = z + forward;
  if (ahead <= edge) return { x, z: ahead };
  const back = z - forward;
  if (back >= backEdge) return { x, z: back };
  const side = x >= 0 ? Math.max(-1.7, x - 0.4) : Math.min(1.7, x + 0.4);
  return approachOnFloor(side, Math.min(edge, Math.max(backEdge, z)));
}

/** Physicist 1a: 1.19 plan-units/s ≈ 1.3 m/s cruise (was 2.75, about 2.2× real). */
export const WALK_SPEED = 1.19;
/** Physicist 1b: stair segments cost 4× (≈0.45 m/s vertical) in both duration and sampling. */
const STAIR_COST = 4;

function segmentWeight(a: Vec2, b: Vec2) {
  return bandOf(a.z).floor !== bandOf(b.z).floor || bandOf(a.z).gap || bandOf(b.z).gap ? STAIR_COST : 1;
}

type Band = { floor: number; gap: boolean; flight: number };

function bandOf(z: number): Band {
  for (let i = 0; i < FLOORS.length; i += 1) {
    const floor = FLOORS[i]!;
    if (z >= floor.z0 && z <= floor.z1) return { floor: i, gap: false, flight: i };
  }
  for (let i = 0; i < FLOORS.length - 1; i += 1) {
    const below = FLOORS[i]!;
    const above = FLOORS[i + 1]!;
    if (z > below.z1 && z < above.z0) return { floor: i, gap: true, flight: i };
  }
  if (z < FLOORS[0]!.z0) return { floor: 0, gap: false, flight: 0 };
  return { floor: FLOORS.length - 1, gap: false, flight: FLOORS.length - 2 };
}

function dedupe(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - point.x, prev.z - point.z) < 0.05) continue;
    out.push({ x: point.x, z: point.z });
  }
  return out.length > 0 ? out : [{ x: 0, z: 0 }];
}

function climb(points: Vec2[], fromFloor: number, toFloor: number) {
  const steps = 8;
  let floor = fromFloor;
  // Physicist 1d: between flights, walk on the landing slab inside the guardrail (x = 1.0), not over the stairwell.
  const landing = (band: { z0: number; z1: number }, up: boolean) => {
    const a = band.z0 + 0.53;
    const b = band.z1 - 0.42;
    const seq = up ? [a, b] : [b, a];
    points.push({ x: STAIR_X, z: seq[0]! }, { x: 1.0, z: seq[0]! }, { x: 1.0, z: seq[1]! }, { x: STAIR_X, z: seq[1]! });
  };
  while (floor < toFloor) {
    if (floor > fromFloor) landing(FLOORS[floor]!, true);
    const z0 = FLOORS[floor]!.z1;
    const z1 = FLOORS[floor + 1]!.z0;
    for (let i = 0; i <= steps; i += 1) points.push({ x: STAIR_X, z: z0 + ((z1 - z0) * i) / steps });
    floor += 1;
  }
  while (floor > toFloor) {
    if (floor < fromFloor) landing(FLOORS[floor]!, false);
    const z0 = FLOORS[floor]!.z0;
    const z1 = FLOORS[floor - 1]!.z1;
    for (let i = 0; i <= steps; i += 1) points.push({ x: STAIR_X, z: z0 + ((z1 - z0) * i) / steps });
    floor -= 1;
  }
}

/** Walk to the stairs, climb one flight at a time, then walk to the target. */
export function route(from: Vec2, to: Vec2): Vec2[] {
  const points: Vec2[] = [{ x: from.x, z: from.z }];
  const start = bandOf(from.z);
  const end = bandOf(to.z);
  if (!start.gap && !end.gap && start.floor === end.floor) {
    points.push({ x: to.x, z: to.z });
    return dedupe(expand(dedupe(points)));
  }
  if (start.gap && end.gap && start.flight === end.flight) {
    points.push({ x: to.x, z: to.z });
    return dedupe(points);
  }
  let floor = start.floor;
  if (start.gap) {
    const headingUp = end.gap ? end.flight > start.flight || to.z >= from.z : end.floor > start.floor;
    if (headingUp) {
      points.push({ x: STAIR_X, z: FLOORS[start.flight + 1]!.z0 });
      floor = start.flight + 1;
    } else {
      points.push({ x: STAIR_X, z: FLOORS[start.flight]!.z1 });
      floor = start.flight;
    }
  }
  if (end.gap) {
    const lower = end.flight;
    const upper = end.flight + 1;
    if (floor <= lower) {
      climb(points, floor, lower);
      points.push({ x: STAIR_X, z: FLOORS[lower]!.z1 });
    } else {
      climb(points, floor, upper);
      points.push({ x: STAIR_X, z: FLOORS[upper]!.z0 });
    }
    points.push({ x: to.x, z: to.z });
    return dedupe(expand(dedupe(points)));
  }
  climb(points, floor, end.floor);
  points.push({ x: to.x, z: to.z });
  return dedupe(expand(dedupe(points)));
}

function hits(a: Vec2, b: Vec2, box: Obstacle) {
  const steps = 8;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (Math.abs(x - box.x) <= box.hw && Math.abs(z - box.z) <= box.hd) return true;
  }
  return false;
}

function blocked(a: Vec2, b: Vec2): Obstacle | null {
  for (const box of obstacles()) {
    if (hits(a, b, box)) return box;
  }
  return null;
}

function legal(point: Vec2) {
  return onFloor(point) && point.x <= 1.22;
}

function chainClear(from: Vec2, points: Vec2[]) {
  let prev = from;
  for (const point of points) {
    if (!legal(point) || blocked(prev, point)) return false;
    prev = point;
  }
  return true;
}

function dodgeSegment(from: Vec2, to: Vec2): Vec2[] {
  const box = blocked(from, to);
  if (!box) return [to];
  const pad = 0.36;
  const options: Vec2[][] = [
    [{ x: box.x - box.hw - pad, z: from.z }, { x: box.x - box.hw - pad, z: to.z }, to],
    [{ x: box.x + box.hw + pad, z: from.z }, { x: box.x + box.hw + pad, z: to.z }, to],
    [{ x: from.x, z: box.z - box.hd - pad }, { x: to.x, z: box.z - box.hd - pad }, to],
    [{ x: from.x, z: box.z + box.hd + pad }, { x: to.x, z: box.z + box.hd + pad }, to],
  ];
  const open = options.filter((points) => chainClear(from, points));
  open.sort((a, b) => {
    const len = (pts: Vec2[]) => pts.reduce((sum, point, index) => {
      const prev = index ? pts[index - 1]! : from;
      return sum + Math.hypot(point.x - prev.x, point.z - prev.z);
    }, 0);
    return len(a) - len(b);
  });
  return open[0] ?? [to];
}

function expand(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const next = points[i]!;
    if (i === 0) {
      out.push(next);
      continue;
    }
    const prev = points[i - 1]!;
    const start = bandOf(prev.z);
    const end = bandOf(next.z);
    if (start.gap || end.gap || start.floor !== end.floor) {
      out.push(next);
      continue;
    }
    out.push(...dodgeSegment(prev, next));
  }
  return out;
}

export function pathLength(points: Vec2[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z) * segmentWeight(a, b);
  }
  return total;
}

export function walkMs(points: Vec2[]) {
  return Math.min(14000, Math.max(420, (pathLength(points) / WALK_SPEED) * 1000));
}

/** Ease only the first and last steps so a stair flight stays a steady climb. */
function smooth(t: number) {
  const c = Math.min(1, Math.max(0, t));
  const edge = 0.08;
  if (c < edge) return (c * c) / (2 * edge);
  if (c > 1 - edge) {
    const u = 1 - c;
    return 1 - (u * u) / (2 * edge);
  }
  return edge / 2 + ((c - edge) * (1 - edge)) / (1 - 2 * edge);
}

export function samplePath(points: Vec2[], t: number): { x: number; z: number; yaw: number } {
  if (points.length === 0) return { x: 0, z: 0, yaw: 0 };
  const first = points[0]!;
  if (points.length === 1) return { x: first.x, z: first.z, yaw: 0 };
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z) * segmentWeight(a, b);
    lengths.push(total);
  }
  if (total < 1e-4) return { x: first.x, z: first.z, yaw: 0 };
  const dist = smooth(t) * total;
  let index = 1;
  while (index < lengths.length - 1 && lengths[index]! < dist) index += 1;
  const span = (lengths[index] ?? total) - (lengths[index - 1] ?? 0) || 1;
  const u = (dist - (lengths[index - 1] ?? 0)) / span;
  const a = points[index - 1]!;
  const b = points[index]!;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return { x: a.x + dx * u, z: a.z + dz * u, yaw: Math.atan2(dx, dz) };
}

export function motionPoint(
  path: Vec2[] | undefined,
  from: Vec2,
  to: Vec2,
  startedAt: number,
  arriveAt: number,
  now: number,
) {
  const span = Math.max(1, arriveAt - startedAt);
  const t = (now - startedAt) / span;
  const points = path && path.length >= 2 ? path : [from, to];
  return samplePath(points, t);
}

export function dogWander(now: number): { x: number; z: number; mode: "wander" | "nap" } {
  const slot = Math.floor(now / 8000);
  const from = DOG_SPOTS[slot % DOG_SPOTS.length]!;
  const to = DOG_SPOTS[(slot + 1) % DOG_SPOTS.length]!;
  if (slot % 5 === 4) return { x: from.x, z: from.z, mode: "nap" };
  const at = samplePath(route(from, to), (now % 8000) / 8000);
  return { x: at.x, z: at.z, mode: "wander" };
}

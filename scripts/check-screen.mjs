/**
 * Screen-space overlap check. Projects each solid to the default 393×852
 * camera (the same fit as the dollhouse) and fails when a nearer object
 * covers more than 15% of a farther object's on-screen bounds.
 *
 * Items on a surface, rugs under furniture, and the bed (pillows are part of
 * the bed mesh) are allowed. Run: node scripts/check-screen.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";

const WIDTH = 393;
const HEIGHT = 852;
const COVER = 0.15;

const root = join(import.meta.dirname, "..");
const layoutSrc = readFileSync(join(root, "lib/room/layout.ts"), "utf8")
  .replace(/import type[\s\S]*?;\n/, "")
  .replace(/ as Vec[23]/g, "")
  .replace(/: Vec[23](?:\[\])?/g, "")
  .replace(/ as const/g, "")
  .replace(/:\s*\{[^}]*\b(?:number|string)\b[^}]*\}/g, "")
  .replace(/:\s*number/g, "")
  .replace(/export const (\w+)\s*:[^=]+=/g, "export const $1 =");
const dir = mkdtempSync(join(tmpdir(), "layout-"));
const file = join(dir, "layout.mjs");
writeFileSync(file, layoutSrc);
const layout = await import(pathToFileURL(file).href);
const { FLOORS, HOUSE, SHELL, DOG_SPOTS, stagePose } = layout;
const catalog = readFileSync(join(root, "lib/room/catalog.ts"), "utf8");

const MESH = {
  sofa: { w: 1.58, d: 0.72, h: 0.72, y0: 0 },
  bed: { w: 1.46, d: 0.95, h: 0.56, y0: 0 },
  tv: { w: 1.35, d: 0.4, h: 1.36, y0: 0 },
  computer: { w: 0.96, d: 0.78, h: 1.28, y0: 0, oz: -0.06 },
  lamp: { w: 0.44, d: 0.44, h: 1.54, y0: 0 },
  "living-light": { w: 0.44, d: 0.44, h: 1.54, y0: 0 },
  fridge: { w: 1.19, d: 0.58, h: 1.62, y0: 0, ox: -0.135 },
  bookshelf: { w: 0.78, d: 0.32, h: 1.86, y0: 0 },
  sink: { w: 0.32, d: 0.32, h: 0.16, y0: 0.68 },
  stove: { w: 0.42, d: 0.36, h: 0.12, y0: 0.7 },
  kettle: { w: 0.2, d: 0.18, h: 0.18, y0: 0.75 },
  radio: { w: 0.48, d: 0.36, h: 0.98, y0: 0 },
  "kitchen-light": { w: 0.14, d: 0.06, h: 0.2, y0: -0.1, oz: -0.1, mount: "wall" },
  plant: { w: 0.36, d: 0.36, h: 0.75, y0: 0 },
  wall: { w: 1.72, d: 0.06, h: 1.16, y0: 0.97, mount: "wall" },
  table: { w: 0.78, d: 1.18, h: 0.64, y0: 0 },
  armchair: { w: 0.36, d: 0.36, h: 0.66, y0: 0 },
  "reading-chair": { w: 0.36, d: 0.36, h: 0.66, y0: 0 },
  wardrobe: { w: 0.56, d: 0.48, h: 1.62, y0: 0 },
  "dog-bed": { w: 0.55, d: 0.4, h: 0.16, y0: 0 },
};

const pieces = [];
for (const chunk of catalog.split(/\n    \{/)) {
  const id = chunk.match(/^\s*id: "([^"]+)"/)?.[1];
  const spot = chunk.match(/position: (\w+)\.position/)?.[1];
  if (!id || !spot || !MESH[id]) continue;
  const node = layout[spot];
  if (!node?.position) throw new Error(`catalog ${id} uses unknown layout ${spot}`);
  pieces.push({ id, x: node.position.x, z: node.position.z, y: node.position.y, rot: node.rotation ?? 0, ...MESH[id] });
}

function floorOf(z) {
  return FLOORS.findIndex((floor) => z >= floor.z0 - 0.02 && z <= floor.z1 + 0.02);
}

function solidBox(piece) {
  const pose = stagePose(piece.x, piece.z);
  let w = piece.w;
  let d = piece.d;
  if (Math.abs(Math.sin(piece.rot || 0)) > 0.5) [w, d] = [d, w];
  const cx = pose.x + (piece.ox || 0);
  const cz = pose.z + (piece.oz || 0);
  const floor = floorOf(piece.z);
  const base = pose.y + (piece.y || 0) + piece.y0;
  return {
    id: piece.id,
    floor,
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    minY: base,
    maxY: base + piece.h,
  };
}

function shellBox(id, spec, mount) {
  const floor = FLOORS[spec.floor];
  const y = spec.y ?? 0;
  const h = spec.h ?? spec.top ?? 0.2;
  const centered = mount === "wall" || id.includes("frame") || id.includes("Window");
  const minY = floor.y + (centered ? y - h / 2 : y);
  return {
    id: `shell:${id}`,
    floor: spec.floor,
    minX: spec.x - spec.w / 2,
    maxX: spec.x + spec.w / 2,
    minZ: spec.z - spec.d / 2,
    maxZ: spec.z + spec.d / 2,
    minY,
    maxY: minY + h,
  };
}

const boxes = pieces.map(solidBox);
boxes.push(shellBox("counter", { ...SHELL.counter, y: 0, h: SHELL.counter.top, floor: 0 }, "floor"));
for (const [id, spec] of Object.entries(SHELL)) {
  if (id === "counter") continue;
  const mount = id.includes("plant") ? "floor" : "wall";
  boxes.push(shellBox(id, spec, mount));
}
const rug = (id, x, z, w, d, floor) =>
  boxes.push({
    id,
    floor,
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    minY: FLOORS[floor].y + 0.02,
    maxY: FLOORS[floor].y + 0.12,
  });
rug("rug:kitchen", 0.2, 1.0, 1.15, 0.82, 0);
rug("rug:living", -0.2, 1.2, 1.85, 1.12, 1);
rug("rug:bedroom", 0.15, 1.05, 1.45, 0.9, 2);

const VIEW = new THREE.Vector3(0, 0.42, 1).normalize();
const camera = new THREE.OrthographicCamera(-WIDTH / 2, WIDTH / 2, HEIGHT / 2, -HEIGHT / 2, 0.1, 60);
const box = new THREE.Box3(new THREE.Vector3(-2.62, -0.46, -0.55), new THREE.Vector3(2.62, 8.58, 2.35));
const corner = new THREE.Vector3();
const center = new THREE.Vector3();
const screenUp = new THREE.Vector3();

function fit() {
  const topInset = 46;
  const bottomInset = 72;
  const sideInset = 8;
  const availW = WIDTH - sideInset * 2;
  const availH = HEIGHT - topInset - bottomInset;
  box.getCenter(center);
  camera.position.copy(center).addScaledVector(VIEW, 18);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.zoom = 1;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
  }
  const zoomW = availW / Math.max(0.01, maxX - minX);
  const zoomH = availH / Math.max(0.01, maxY - minY);
  camera.zoom = Math.max(zoomW, zoomH);
  const upPx = HEIGHT / 2 - (topInset + availH / 2);
  screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  center.addScaledVector(screenUp, -(upPx / camera.zoom));
  camera.position.copy(center).addScaledVector(VIEW, 18);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}

fit();

function hull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = [];
  for (const point of sorted) {
    const prev = unique[unique.length - 1];
    if (prev && Math.abs(prev.x - point.x) < 1e-4 && Math.abs(prev.y - point.y) < 1e-4) continue;
    unique.push(point);
  }
  if (unique.length < 3) return unique;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function clip(subject, edgeA, edgeB) {
  if (!subject.length) return [];
  const out = [];
  const inside = (point) => (edgeB.x - edgeA.x) * (point.y - edgeA.y) - (edgeB.y - edgeA.y) * (point.x - edgeA.x) >= -1e-6;
  const hit = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ex = edgeB.x - edgeA.x;
    const ey = edgeB.y - edgeA.y;
    const den = dx * ey - dy * ex;
    const t = Math.abs(den) < 1e-9 ? 0 : ((edgeA.x - a.x) * ey - (edgeA.y - a.y) * ex) / den;
    return { x: a.x + dx * t, y: a.y + dy * t };
  };
  let prev = subject[subject.length - 1];
  for (const point of subject) {
    const pin = inside(point);
    const qin = inside(prev);
    if (pin) {
      if (!qin) out.push(hit(prev, point));
      out.push(point);
    } else if (qin) out.push(hit(prev, point));
    prev = point;
  }
  return out;
}

function intersect(a, b) {
  let out = a;
  for (let i = 0; i < b.length; i += 1) out = clip(out, b[i], b[(i + 1) % b.length]);
  return out;
}

function areaOf(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const VIEWPORT = [
  { x: 0, y: 0 },
  { x: WIDTH, y: 0 },
  { x: WIDTH, y: HEIGHT },
  { x: 0, y: HEIGHT },
];

function project(solid) {
  const points = [];
  const point = new THREE.Vector3();
  const center = new THREE.Vector3(
    (solid.minX + solid.maxX) / 2,
    (solid.minY + solid.maxY) / 2,
    (solid.minZ + solid.maxZ) / 2,
  );
  const near = center.applyMatrix4(camera.matrixWorldInverse).z;
  for (let i = 0; i < 8; i += 1) {
    point.set(i & 1 ? solid.maxX : solid.minX, i & 2 ? solid.maxY : solid.minY, i & 4 ? solid.maxZ : solid.minZ);
    const ndc = point.clone().project(camera);
    points.push({ x: (ndc.x * 0.5 + 0.5) * WIDTH, y: (-ndc.y * 0.5 + 0.5) * HEIGHT });
  }
  const raw = hull(points);
  const poly = intersect(raw, VIEWPORT);
  return { id: solid.id, near, area: areaOf(poly), poly };
}

const ON_COUNTER = new Set(["kettle", "sink", "stove"]);
function allowed(a, b) {
  const ids = new Set([a, b]);
  if ([...ids].some((id) => id.startsWith("rug:"))) return true;
  if ([...ids].some((id) => ON_COUNTER.has(id)) && ids.has("shell:counter")) return true;
  return false;
}

const screen = boxes.map(project).filter((item) => item.area > 8);
const fails = [];
const rows = [];
for (let i = 0; i < screen.length; i += 1) {
  for (let j = i + 1; j < screen.length; j += 1) {
    const a = screen[i];
    const b = screen[j];
    const cover = areaOf(intersect(a.poly, b.poly));
    if (cover <= 1) continue;
    const nearer = a.near >= b.near ? a : b;
    const farther = nearer === a ? b : a;
    const ratio = cover / farther.area;
    if (ratio < 0.04) continue;
    rows.push({ nearer: nearer.id, farther: farther.id, ratio, ok: allowed(a.id, b.id) });
    if (ratio > COVER && !allowed(a.id, b.id)) {
      fails.push(`${nearer.id} covers ${(ratio * 100).toFixed(0)}% of ${farther.id}`);
    }
  }
}
rows.sort((a, b) => b.ratio - a.ratio);

const bedFloor = FLOORS[2];
for (const spot of DOG_SPOTS) {
  const onBed = spot.z >= bedFloor.z0 && spot.z <= bedFloor.z1;
  if (!onBed || spot.x > 0.85) fails.push(`dog spot (${spot.x}, ${spot.z}) is not on open bedroom floor`);
}
const bed = boxes.find((item) => item.id === "dog-bed");
if (!bed || bed.floor !== 2 || bed.maxX > 0.9) fails.push("dog bed should sit on open bedroom floor, clear of the stairs");

if (process.argv.includes("--pairs")) {
  for (const row of rows) {
    const mark = row.ok ? "ok" : row.ratio > COVER ? "FAIL" : "near";
    console.log(`${mark}\t${(row.ratio * 100).toFixed(0)}%\t${row.nearer} → ${row.farther}`);
  }
}

if (fails.length) {
  console.error(`screen overlap failed (${fails.length})`);
  for (const message of fails) console.error(`- ${message}`);
  process.exit(1);
}
console.log(`screen overlap passed (${screen.length} projected, camera ${WIDTH}x${HEIGHT}, cover ≤ ${COVER})`);

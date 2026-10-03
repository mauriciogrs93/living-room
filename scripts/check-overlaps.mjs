/**
 * Bounding boxes from layout.ts, the catalog, and SHELL decorations.
 * Fails if two solids intersect, or a piece clips a wall, floats, pokes out
 * the front cut, blocks the stair shaft, or sits in a nonsense place.
 *
 *   node scripts/check-overlaps.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
const { FLOORS, HOUSE, SHELL, SPOTS, stagePose } = layout;

const catalog = readFileSync(join(root, "lib/room/catalog.ts"), "utf8");

/** Local mesh size. y0 is the bottom relative to the object's group origin. ox/oz shift the center. */
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
  pieces.push({ id, spot, x: node.position.x, z: node.position.z, y: node.position.y, rot: node.rotation ?? 0, ...MESH[id] });
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
    mount: piece.mount || "floor",
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
  const h = spec.h ?? 0.2;
  const centered = mount === "wall" || id.includes("frame") || id.includes("Window");
  const minY = floor.y + (centered ? y - h / 2 : y);
  return {
    id: `shell:${id}`,
    floor: spec.floor,
    mount,
    minX: spec.x - spec.w / 2,
    maxX: spec.x + spec.w / 2,
    minZ: spec.z - spec.d / 2,
    maxZ: spec.z + spec.d / 2,
    minY,
    maxY: minY + h,
  };
}

const shells = [
  shellBox("frameGap", SHELL.frameGap, "wall"),
  shellBox("frameTv", SHELL.frameTv, "wall"),
  shellBox("frameBed", SHELL.frameBed, "wall"),
  shellBox("wallShelf", SHELL.wallShelf, "wall"),
  shellBox("plantLiving", SHELL.plantLiving, "floor"),
  shellBox("plantBed", SHELL.plantBed, "floor"),
  shellBox("kitchenWindow", SHELL.kitchenWindow, "wall"),
  shellBox("bedWindow", SHELL.bedWindow, "wall"),
];

const support = {
  minX: SHELL.counter.x - SHELL.counter.w / 2,
  maxX: SHELL.counter.x + SHELL.counter.w / 2,
  minZ: SHELL.counter.z - SHELL.counter.d / 2,
  maxZ: SHELL.counter.z + SHELL.counter.d / 2,
  top: FLOORS[0].y + SHELL.counter.top,
};

const fails = [];
const fail = (message) => fails.push(message);

function hits(a, b) {
  const pad = 0.02;
  return a.minX + pad < b.maxX && a.maxX - pad > b.minX && a.minY + pad < b.maxY && a.maxY - pad > b.minY && a.minZ + pad < b.maxZ && a.maxZ - pad > b.minZ;
}

function checkOne(box) {
  const floor = FLOORS[box.floor];
  if (!floor) {
    fail(`${box.id} is not on a floor`);
    return;
  }
  const wallMount = box.mount === "wall";
  const innerX = wallMount ? -2.28 : -2.08;
  const outerX = wallMount ? 2.28 : 2.08;
  const innerZ = wallMount ? -0.52 : -0.36;
  if (box.minX < innerX) fail(`${box.id} clips the left wall (${box.minX.toFixed(2)})`);
  if (box.maxX > outerX) fail(`${box.id} clips the right wall (${box.maxX.toFixed(2)})`);
  if (box.minZ < innerZ) fail(`${box.id} clips the back wall (${box.minZ.toFixed(2)})`);
  if (box.maxZ > HOUSE.zFront + 0.06) fail(`${box.id} pokes out of the front cut (${box.maxZ.toFixed(2)})`);
  if (box.maxY > floor.y + HOUSE.roomH - 0.02) fail(`${box.id} hits the ceiling (${(box.maxY - floor.y).toFixed(2)} m)`);
  if (box.floor > 0 && box.maxX > 1.16 && box.minX < 1.95) fail(`${box.id} blocks the stairs (x ${box.maxX.toFixed(2)})`);
  if (box.minY > floor.y + 0.16) {
    const onCounter = box.floor === 0 && box.minX < support.maxX && box.maxX > support.minX && box.minZ < support.maxZ && box.maxZ > support.minZ && Math.abs(box.minY - support.top) < 0.18;
    const onWall = wallMount && (box.minX < -1.7 || box.maxX > 1.7 || box.minZ < -0.2);
    if (!onCounter && !onWall) fail(`${box.id} is floating (${(box.minY - floor.y).toFixed(2)} m up)`);
  }
}

function checkSet(boxes, label) {
  for (const box of boxes) checkOne(box);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (hits(boxes[i], boxes[j])) fail(`${label}: ${boxes[i].id} overlaps ${boxes[j].id}`);
    }
  }
}

const defaults = pieces.map(solidBox);
checkSet([...defaults, ...shells], "default");

const tv = defaults.find((box) => box.id === "tv");
const shelf = defaults.find((box) => box.id === "bookshelf");
if (tv && shelf && tv.maxZ > shelf.minZ && shelf.maxZ > tv.minZ) {
  const gap = Math.max(shelf.minX - tv.maxX, tv.minX - shelf.maxX);
  if (gap < 0.28) fail(`television and bookshelf need clear wall between them (gap ${gap.toFixed(2)} m)`);
}

const byId = Object.fromEntries(pieces.map((piece) => [piece.id, piece]));
const walkFloor = (z) => FLOORS.findIndex((floor) => z >= floor.z0 && z <= floor.z1);
function near(id, other, max) {
  const a = byId[id];
  const b = byId[other];
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  if (gap > max) fail(`${id} should sit by ${other} (${gap.toFixed(2)} m)`);
}
if (walkFloor(byId.tv.z) !== 1 || walkFloor(byId.sofa.z) !== 1) fail("the television and sofa should share the living room");
if (!(byId.tv.z < byId.sofa.z)) fail("the television should face the sofa from the back wall");
near("living-light", "sofa", 1.7);
near("lamp", "bed", 1.3);
if (walkFloor(byId.computer.z) !== 2) fail("the desk and computer should be in the bedroom");
for (const id of ["fridge", "kettle", "stove", "sink"]) {
  if (walkFloor(byId[id].z) !== 0) fail(`${id} should be in the kitchen`);
}
if (walkFloor(byId["dog-bed"].z) !== 2 || byId["dog-bed"].y > 0.05) fail("the dog bed should sit on the bedroom floor");
if (walkFloor(byId.plant.z) !== 0 || byId.plant.y > 0.05) fail("the plant should sit on the kitchen floor");
if (byId.radio.y > 0.05) fail("the radio should sit on a surface, not float");
for (const id of ["kettle", "stove", "sink"]) {
  const box = defaults.find((item) => item.id === id);
  const on = box.minX < support.maxX && box.maxX > support.minX && box.minZ < support.maxZ && box.maxZ > support.minZ;
  if (!on) fail(`${id} should sit on the kitchen counter`);
}

for (const [id, spots] of Object.entries(SPOTS)) {
  const home = pieces.find((piece) => piece.id === id);
  if (!home) continue;
  for (const [name, at] of Object.entries(spots)) {
    const moved = solidBox({ ...home, x: at.x, z: at.z, y: at.y });
    const others = defaults.filter((box) => box.id !== id);
    checkSet([moved, ...others, ...shells], `${id}:${name}`);
  }
}

const approaches = [];
for (const chunk of catalog.split(/\n    \{/)) {
  const id = chunk.match(/^\s*id: "([^"]+)"/)?.[1];
  const inline = chunk.match(/approach: \{ x: (\w+)\.position\.x, z: \1\.position\.z - ([\d.]+) \}/);
  const named = chunk.match(/approach: (\w+)\.approach/);
  if (!id) continue;
  if (inline) {
    const node = layout[inline[1]];
    approaches.push({ id, x: node.position.x, z: node.position.z - Number(inline[2]) });
  } else if (named && layout[named[1]]?.approach) {
    approaches.push({ id, ...layout[named[1]].approach });
  }
}
for (const spot of approaches) {
  const piece = byId[spot.id];
  if (!piece) continue;
  const gap = Math.hypot(spot.x - piece.x, spot.z - piece.z);
  if (gap < 0.3) fail(`${spot.id} approach is ${gap.toFixed(2)} m from the object`);
}
for (let i = 0; i < approaches.length; i += 1) {
  for (let j = i + 1; j < approaches.length; j += 1) {
    const gap = Math.hypot(approaches[i].x - approaches[j].x, approaches[i].z - approaches[j].z);
    if (gap < 0.5) fail(`${approaches[i].id} and ${approaches[j].id} approaches are ${gap.toFixed(2)} m apart`);
  }
}

function standBefore(x, z, forward = 0.55) {
  const floor = FLOORS.find((band) => z >= band.z0 && z <= band.z1);
  if (!floor) return { x, z };
  const edge = floor.z1 - 0.08;
  const backEdge = floor.z0 + 0.08;
  const ahead = z + forward;
  if (ahead <= edge) return { x, z: ahead };
  const back = z - forward;
  if (back >= backEdge) return { x, z: back };
  return { x, z: Math.min(edge, Math.max(backEdge, z)) };
}

const spotApproaches = [];
for (const [id, spots] of Object.entries(SPOTS)) {
  for (const [name, at] of Object.entries(spots)) {
    const front = id === "sofa" ? { x: at.x, z: at.z - 0.65 } : standBefore(at.x, at.z);
    spotApproaches.push({ id: `${id}:${name}`, ...front });
  }
}
const sofa = layout.sofa;
const armchair = layout.armchairSpot;
const leftCushion = sofa.position.x - 0.5;
const armSeat = armchair.position;
if (Math.hypot(leftCushion - armSeat.x, sofa.position.z - armSeat.z) < 0.5) {
  fail(`sofa left cushion is too close to the armchair seat`);
}
const computerSeat = -1.42;
if (computerSeat <= layout.ROOM.bounds.minX + 0.05) fail("the computer seat is on the wall line");
for (const spot of spotApproaches) {
  const piece = pieceOf(spot.id);
  for (const approach of approaches) {
    if (approach.id === piece) continue;
    const gap = Math.hypot(spot.x - approach.x, spot.z - approach.z);
    if (gap < 0.5 - 1e-6) fail(`${spot.id} and ${approach.id} are ${gap.toFixed(2)} m apart`);
  }
}

function pieceOf(label) {
  return String(label).split(":")[0];
}

if (fails.length) {
  console.error(`overlap check failed (${fails.length})`);
  for (const message of fails) console.error(`- ${message}`);
  process.exit(1);
}
console.log(`overlap check passed (${defaults.length} objects, ${shells.length} shell pieces, ${approaches.length} approaches)`);

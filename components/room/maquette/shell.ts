import * as THREE from "three";
import { FLOORS, HOUSE, SHELL, STAIR_X } from "@/lib/room/layout";
import { GEO } from "./config";
import { bar, blk, cap, cyl, extrude, mergeStatic, rboxGeo, rectHole, rectShape, sph, type Mats } from "./kit";

/**
 * The house as a study model: basswood plinth, plaster storeys with real window openings, screed floors, an
 * open-riser birch stair in a shaft on the right. No walnut frame, no beams, no roof: the model is cut open.
 * Every storey is merged to one mesh per material; flights stay separate so a floor close-up can lift them off.
 */

export const FRONT = HOUSE.zFront + 0.16;
const { wallInX, wallOutX, wallInZ, wallOutZ, edgeR, slab, cut } = GEO;

export type ShellParts = {
  base: THREE.Group;
  storeys: THREE.Group[];
  flights: THREE.Group[];
};

function storeyShell(g: THREE.Group, M: Mats, i: number) {
  const y = FLOORS[i].y;
  const top = y + HOUSE.roomH;
  if (i > 0) {
    blk(g, M.plaster, cut - wallOutX, slab - 0.02, FRONT - wallOutZ, (cut + wallOutX) / 2, y - slab, (FRONT + wallOutZ) / 2, { r: 0.02 });
    blk(g, M.screed, cut - wallInX - 0.01, 0.02, FRONT - wallInZ - 0.01, (cut + wallInX) / 2, y - 0.02, (FRONT + wallInZ) / 2, { r: 0.006, cast: false });
    // Physicist 1e: back landing 0.42 → 0.30 deep so its edge meets the top tread.
    blk(g, M.plaster, edgeR - cut, slab, 0.3, (edgeR + cut) / 2, y - slab, wallInZ + 0.15, { r: 0.02 });
    if (i < 2) blk(g, M.plaster, edgeR - cut, slab, 0.5, (edgeR + cut) / 2, y - slab, FRONT - 0.25, { r: 0.02 });
  }
  const back = rectShape(wallOutX, y, edgeR, top);
  if (i === 0) {
    const k = SHELL.kitchenWindow;
    back.holes.push(rectHole(k.x - k.w / 2, y + k.y - k.h / 2, k.x + k.w / 2, y + k.y + k.h / 2));
  }
  const bw = extrude(back, wallInZ - wallOutZ, M.plaster);
  bw.position.z = wallOutZ;
  g.add(bw);
  const left = rectShape(-FRONT, y, -wallInZ, top);
  if (i === 2) {
    const b = SHELL.bedWindow;
    left.holes.push(rectHole(-(b.z + b.d / 2), y + b.y - b.h / 2, -(b.z - b.d / 2), y + b.y + b.h / 2));
  }
  const lw = extrude(left, wallInX - wallOutX, M.plaster);
  lw.rotation.y = Math.PI / 2;
  lw.position.x = wallOutX;
  g.add(lw);
  // skirting: a 7 cm birch board with a cut bead line near its top
  const bwid = (i === 0 ? edgeR : cut) - wallInX - 0.02;
  const bx = wallInX + 0.01 + bwid / 2;
  blk(g, M.birch, bwid, 0.07, 0.016, bx, y, wallInZ + 0.008, { r: 0.004, cast: false });
  blk(g, M.birch, 0.016, 0.07, FRONT - wallInZ - 0.02, wallInX + 0.008, y, (FRONT + wallInZ) / 2, { r: 0.004, cast: false });
  bar(g, M.seam, bwid, 0.003, 0.002, bx, y + 0.055, wallInZ + 0.0165);
  bar(g, M.seam, 0.002, 0.003, FRONT - wallInZ - 0.02, wallInX + 0.0165, y + 0.055, (FRONT + wallInZ) / 2);
  // cornice under the ceiling of the two lower storeys: a two-step plaster profile
  if (i < 2) {
    const cw = cut - wallInX;
    blk(g, M.plaster, cw, 0.04, 0.03, (cut + wallInX) / 2, top - 0.04, wallInZ + 0.015, { r: 0.012, cast: false });
    blk(g, M.plaster, cw, 0.02, 0.05, (cut + wallInX) / 2, top - 0.02, wallInZ + 0.025, { r: 0.008, cast: false });
    blk(g, M.plaster, 0.03, 0.04, FRONT - wallInZ, wallInX + 0.015, top - 0.04, (FRONT + wallInZ) / 2, { r: 0.012, cast: false });
    blk(g, M.plaster, 0.05, 0.02, FRONT - wallInZ, wallInX + 0.025, top - 0.02, (FRONT + wallInZ) / 2, { r: 0.008, cast: false });
  }
  planks(g, M, i);
  // slab cut edge: laminated plywood read as two fine lines on the cut faces
  if (i > 0) {
    for (const f of [0.34, 0.68]) {
      bar(g, M.seam, cut - wallOutX - 0.04, 0.003, 0.003, (cut + wallOutX) / 2, y - slab + slab * f, FRONT + 0.0005);
      bar(g, M.seam, 0.003, 0.003, FRONT - wallOutZ - 0.04, cut + 0.0005, y - slab + slab * f, (FRONT + wallOutZ) / 2);
    }
  }
}

/**
 * Plank floor: 15 cm oak boards parallel to the back wall, each board its own tone (+-7%), staggered butt joints and
 * a dark seam between rows, so the floor reads as boards even at full phone zoom. One merged mesh per storey.
 */
function planks(g: THREE.Group, M: Mats, i: number) {
  const y = i === 0 ? 0 : FLOORS[i].y;
  const x0 = wallInX + 0.02;
  const x1 = (i === 0 ? edgeR : cut) - 0.02;
  const pitch = 0.15;
  const gap = 0.006;
  let row = 0;
  for (let z = wallInZ + 0.01; z < FRONT - 0.02; z += pitch) {
    const zEnd = Math.min(z + pitch, FRONT - 0.005);
    const dz = zEnd - z - gap;
    if (dz < 0.02) break;
    const off = ((row * 0.37) % 1.05) + 0.2;
    const cuts = [x0];
    for (let x = x0 + off; x < x1 - 0.12; x += 1.05) cuts.push(x);
    cuts.push(x1);
    for (let k = 0; k < cuts.length - 1; k += 1) {
      const a = cuts[k] + (k ? gap / 2 : 0);
      const b2 = cuts[k + 1] - (k < cuts.length - 2 ? gap / 2 : 0);
      const m = bar(g, M.oak, b2 - a, 0.004, dz, (a + b2) / 2, y - 0.002, z + gap / 2 + dz / 2);
      m.userData.jitter = 0.2;
    }
    bar(g, M.seam, x1 - x0, 0.0015, gap + 0.002, (x0 + x1) / 2, y - 0.0015, z + 0.0005);
    row += 1;
  }
}

function flight(M: Mats, lower: number) {
  const g = new THREE.Group();
  g.userData.keep = true;
  const y0 = FLOORS[lower].y;
  const y1 = FLOORS[lower + 1].y;
  // Physicist 1e: treads line up with the walker's 8 steps (run 0.3125).
  const z0 = HOUSE.zFront;
  const z1 = HOUSE.zBack + 0.3125;
  const steps = 8;
  const rise = (y1 - y0) / steps;
  const run = (z0 - z1) / steps;
  for (let k = 0; k < steps - 1; k += 1) {
    blk(g, M.stair, 0.6, 0.045, run + 0.04, STAIR_X, y0 + (k + 1) * rise - 0.045, z0 - (k + 0.5) * run, { r: 0.008, cast: false });
  }
  const len = Math.hypot(z0 - z1, y1 - y0);
  const ang = Math.atan2(z1 - z0, y1 - y0);
  for (const sx of [-1, 1]) {
    const st = new THREE.Mesh(rboxGeo(0.028, len + 0.04, 0.13, 0.008), M.stair);
    st.position.set(STAIR_X + sx * 0.31, (y0 + y1) / 2 - 0.02, (z0 + z1) / 2 - 0.02);
    st.rotation.x = ang;
    st.castShadow = true;
    st.receiveShadow = true;
    g.add(st);
  }
  const rail = cap(g, M.rail, 0.006, len - 0.25, STAIR_X + 0.31, (y0 + y1) / 2 + 0.86, (z0 + z1) / 2);
  rail.rotation.set(ang, 0, 0);
  for (const k of [1.5, steps - 1.5]) cyl(g, M.rail, 0.005, 0.005, 0.86, STAIR_X + 0.31, y0 + k * rise - 0.02, z0 - k * run, { bevel: 0.002, seg: 10 });
  // birch nosing on every tread and a slim baluster per tread up to the handrail
  const railY = (z: number) => (y0 + y1) / 2 + 0.86 + ((z - (z0 + z1) / 2) * (y1 - y0)) / (z1 - z0);
  for (let k = 0; k < steps - 1; k += 1) {
    const top = y0 + (k + 1) * rise;
    const front = z0 - (k + 0.5) * run + (run + 0.04) / 2;
    blk(g, M.birch, 0.6, 0.02, 0.022, STAIR_X, top - 0.019, front - 0.011, { r: 0.008, cast: false });
    if (k >= 1 && k <= steps - 3) {
      const bz = z0 - (k + 0.5) * run;
      const h = railY(bz) - top;
      if (h > 0.2) cyl(g, M.rail, 0.0035, 0.0035, h, STAIR_X + 0.285, top, bz, { bevel: 0.001, seg: 8 });
    }
  }
  return g;
}

/** Window frame, mullions and sill (static). Glass, curtains and weather live in the React window component. */
export function windowFrame(parent: THREE.Object3D, M: Mats, w: number, h: number) {
  const fw = 0.04;
  const depth = 0.08;
  blk(parent, M.birch, w, fw, depth, 0, -h / 2, 0, { r: 0.008 });
  blk(parent, M.birch, w, fw, depth, 0, h / 2 - fw, 0, { r: 0.008 });
  blk(parent, M.birch, fw, h, depth, -w / 2 + fw / 2, -h / 2, 0, { r: 0.008 });
  blk(parent, M.birch, fw, h, depth, w / 2 - fw / 2, -h / 2, 0, { r: 0.008 });
  blk(parent, M.birch, 0.022, h - 2 * fw, 0.03, 0, -h / 2 + fw, 0, { r: 0.006 });
  blk(parent, M.birch, w - 2 * fw, 0.022, 0.03, 0, -0.011, 0, { r: 0.006 });
  blk(parent, M.plaster, w + 0.1, 0.035, 0.12, 0, -h / 2 - 0.035, 0.04, { r: 0.01 });
  // plaster architrave around the opening, proud of the wall
  const aw = 0.05;
  const az = 0.048;
  blk(parent, M.plaster, w + 2 * aw, aw, 0.016, 0, h / 2, az, { r: 0.006, cast: false });
  for (const sx of [-1, 1]) blk(parent, M.plaster, aw, h + aw, 0.016, sx * (w / 2 + aw / 2), -h / 2, az, { r: 0.006, cast: false });
  const rod = cyl(parent, M.rail, 0.008, 0.008, w + 0.5, 0, h / 2 + 0.07, 0.09, { rz: Math.PI / 2, bevel: 0.003, seg: 10 });
  rod.position.x = (w + 0.5) / 2;
}

export function books(g: THREE.Object3D, M: Mats, x0: number, y: number, z: number, n: number, h = 0.22, d = 0.15, accentIdx = -1, lean = false) {
  const tones = [M.linen, M.birch, M.stone, M.linenDeep, M.oak, M.enamel, M.walnut, M.linen];
  let x = x0;
  let last = 0;
  for (let i = 0; i < n; i += 1) {
    const w = 0.03 + ((i * 37) % 5) * 0.007;
    const hh = h - ((i * 53) % 5) * 0.016;
    last = hh;
    if (i !== accentIdx) {
      const tone = tones[(i * 5 + 3) % tones.length];
      blk(g, tone, w, hh, d, x + w / 2, y, z, { r: 0.005 });
      // spine detail: a pale title band, or two fine graphite rules on darker books
      if (i % 3 === 0) blk(g, M.plaster, w * 0.72, 0.022, 0.003, x + w / 2, y + hh * 0.72, z + d / 2, { r: 0.001, cast: false, noContact: true });
      else if (i % 3 === 1) {
        bar(g, M.graphite, w * 0.8, 0.003, 0.002, x + w / 2, y + hh * 0.86, z + d / 2 + 0.001);
        bar(g, M.graphite, w * 0.8, 0.003, 0.002, x + w / 2, y + hh * 0.14, z + d / 2 + 0.001);
      }
    }
    x += w + 0.003;
  }
  if (lean) {
    // one book leaning on the row end: tilted about its bottom-left edge so it touches the last spine and the shelf
    const w = 0.032;
    const hh = last * 0.94;
    const tilt = 0.24;
    const b = new THREE.Group();
    b.position.set(x + w + Math.sin(tilt) * hh, y, z);
    b.rotation.z = tilt;
    g.add(b);
    blk(b, M.linenDeep, w, hh, d * 0.92, -w / 2, 0, 0, { r: 0.005 });
    x += w + Math.sin(tilt) * hh + 0.01;
  }
  return x;
}

// ---------------------------------------------------------------- analytic wall AO: gradient strips, one merged mesh per storey
const aoCache = new Map<boolean, THREE.ShaderMaterial>();
export function aoMaterial(night: boolean) {
  let m = aoCache.get(night);
  if (!m) {
    m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: { uColor: { value: new THREE.Color(night ? "#10131A" : "#5B5247") }, uOp: { value: night ? 0.38 : 0.3 } },
      vertexShader: "varying float vT; void main(){ vT = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
      fragmentShader: "uniform vec3 uColor; uniform float uOp; varying float vT; void main(){ float a = pow(1.-vT, 2.2); gl_FragColor = vec4(uColor, a*uOp); }",
    });
    aoCache.set(night, m);
  }
  return m;
}

function aoStrips(i: number, night: boolean) {
  const y = FLOORS[i].y;
  const top = y + HOUSE.roomH;
  const bw = edgeR - wallInX;
  const lw = FRONT - wallInZ;
  const e = 0.004;
  const baseH = 0.42;
  const under = 0.5;
  const corner = 0.55;
  const parts: THREE.BufferGeometry[] = [];
  // mode: 0 dark at bottom, 1 dark at top, 2 dark at left (u = 0), 3 dark at right (u = 1)
  const strip = (w: number, h: number, mode: number, pos: THREE.Vector3, ry = 0) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k += 1) {
      const u = uv.getX(k);
      const v = uv.getY(k);
      uv.setY(k, mode === 0 ? v : mode === 1 ? 1 - v : mode === 2 ? u : 1 - u);
    }
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(pos));
    parts.push(g);
  };
  strip(bw, baseH, 0, new THREE.Vector3((edgeR + wallInX) / 2, y + baseH / 2, wallInZ + e));
  strip(lw, baseH, 0, new THREE.Vector3(wallInX + e, y + baseH / 2, (FRONT + wallInZ) / 2), Math.PI / 2);
  strip(corner, HOUSE.roomH, 2, new THREE.Vector3(wallInX + corner / 2, y + HOUSE.roomH / 2, wallInZ + e));
  strip(corner, HOUSE.roomH, 3, new THREE.Vector3(wallInX + e, y + HOUSE.roomH / 2, wallInZ + corner / 2), Math.PI / 2);
  if (i < 2) {
    strip(cut - wallInX, under, 1, new THREE.Vector3((cut + wallInX) / 2, top - under / 2, wallInZ + e));
    strip(lw, under, 1, new THREE.Vector3(wallInX + e, top - under / 2, (FRONT + wallInZ) / 2), Math.PI / 2);
  }
  // merge by hand (all share one shader; uv.y carries the fade)
  let count = 0;
  for (const p of parts) count += p.index ? p.index.count : p.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  let o = 0;
  for (const p of parts) {
    const ni = p.toNonIndexed();
    pos.set(ni.attributes.position.array as Float32Array, o * 3);
    uvs.set(ni.attributes.uv.array as Float32Array, o * 2);
    o += ni.attributes.position.count;
    ni.dispose();
    p.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geo, aoMaterial(night));
  mesh.renderOrder = 1;
  mesh.userData.noContact = true;
  mesh.userData.keep = true;
  return mesh;
}

/** Build the static shell for day or night. */
export function buildShell(M: Mats, night: boolean): ShellParts {
  const base = new THREE.Group();
  const storeys = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  // basswood base board the model is built on, and the ground-floor screed
  blk(base, M.birch, edgeR - wallOutX + 0.5, 0.2, FRONT - wallOutZ + 0.5, (edgeR + wallOutX) / 2, -0.26, (FRONT + wallOutZ) / 2, { r: 0.03 });
  blk(base, M.screed, edgeR - wallOutX, 0.06, FRONT - wallOutZ, (edgeR + wallOutX) / 2, -0.06, (FRONT + wallOutZ) / 2, { r: 0.015 });
  storeys.forEach((g, i) => storeyShell(g, M, i));
  const flights = [flight(M, 0), flight(M, 1)];
  // named so the speech-note placer can keep notes off the top of each flight
  flights.forEach((f) => (f.name = "stair-flight"));
  storeys[0].add(flights[0]);
  storeys[1].add(flights[1]);
  // edge rail along the upper floors' shaft edge
  for (const i of [1, 2]) {
    const y = FLOORS[i].y;
    cap(storeys[i], M.rail, 0.007, 1.25, cut - 0.03, y + 0.9, 0.95, { rx: Math.PI / 2 });
    cyl(storeys[i], M.rail, 0.006, 0.006, 0.9, cut - 0.03, y, 0.3, { bevel: 0.002, seg: 10 });
    cyl(storeys[i], M.rail, 0.006, 0.006, 0.9, cut - 0.03, y, 1.6, { bevel: 0.002, seg: 10 });
  }
  // window frames
  {
    const k = SHELL.kitchenWindow;
    const g = new THREE.Group();
    g.position.set(k.x, k.y, wallInZ - 0.03);
    storeys[0].add(g);
    windowFrame(g, M, k.w, k.h);
  }
  {
    const b = SHELL.bedWindow;
    const g = new THREE.Group();
    g.position.set(wallInX - 0.03, FLOORS[2].y + b.y, b.z);
    g.rotation.y = Math.PI / 2;
    storeys[2].add(g);
    windowFrame(g, M, b.d, b.h);
  }
  // wall shelf in the bedroom
  {
    const s = SHELL.wallShelf;
    const g = new THREE.Group();
    g.position.set(s.x, FLOORS[2].y + s.y, wallInZ);
    storeys[2].add(g);
    blk(g, M.birch, 0.7, 0.03, 0.18, 0, 0, 0.09, { r: 0.008 });
    for (const sx of [-1, 1]) blk(g, M.steel, 0.012, 0.06, 0.14, sx * 0.28, -0.06, 0.07, { r: 0.004 });
    books(g, M, -0.25, 0.03, 0.09, 6, 0.2, 0.14);
    blk(g, M.terracotta, 0.04, 0.17, 0.14, 0.2, 0.03, 0.09, { r: 0.006, rz: -0.25 });
  }
  // floor-1 rug: one deep-linen plane, no pattern
  blk(storeys[1], M.linenDeep, 1.85, 0.012, 1.12, -0.2, FLOORS[1].y, 1.2, { r: 0.005, cast: false, noContact: true });
  // woven border: a pale linen band inset 7 cm, laid flush on the pile (2 mm proud)
  {
    const y = FLOORS[1].y + 0.012;
    const bw = 0.035;
    const ix = 1.85 / 2 - 0.07;
    const iz = 1.12 / 2 - 0.07;
    for (const sz of [-1, 1]) bar(storeys[1], M.linen, ix * 2 + bw, 0.002, bw, -0.2, y, 1.2 + sz * iz);
    for (const sx of [-1, 1]) bar(storeys[1], M.linen, bw, 0.002, iz * 2 - bw, -0.2 + sx * ix, y, 1.2);
  }
  // open shelf above the counter, flush to the back wall on two steel brackets
  {
    const g = new THREE.Group();
    g.position.set(SHELL.counter.x - 0.45, 1.62, wallInZ);
    storeys[0].add(g);
    blk(g, M.birch, 0.8, 0.028, 0.2, 0, 0, 0.1, { r: 0.008 });
    for (const sx of [-1, 1]) blk(g, M.steel, 0.012, 0.06, 0.15, sx * 0.32, -0.06, 0.075, { r: 0.004 });
    cyl(g, M.linen, 0.045, 0.04, 0.1, -0.2, 0.028, 0.1, { bevel: 0.01 });
    cyl(g, M.linenDeep, 0.04, 0.036, 0.12, -0.08, 0.028, 0.1, { bevel: 0.01 });
    cyl(g, M.plaster, 0.05, 0.045, 0.08, 0.2, 0.028, 0.1, { bevel: 0.01 });
    // storage jars with oak and brass lids
    for (const [jx, jh, lid] of [[0.04, 0.13, M.oak], [0.12, 0.1, M.brass], [0.3, 0.15, M.oak]] as const) {
      cyl(g, M.stone, 0.032, 0.032, jh, jx, 0.028, 0.1, { bevel: 0.006, seg: 16 });
      cyl(g, lid, 0.034, 0.034, 0.014, jx, 0.028 + jh, 0.1, { bevel: 0.004, seg: 16 });
    }
    // utensil rail under the shelf: steel bar, hooks, a ladle, a spatula, a whisk
    cyl(g, M.steel, 0.006, 0.006, 0.66, -0.33, -0.26, 0.05, { rz: -Math.PI / 2, bevel: 0.002, seg: 10 });
    for (const sx of [-1, 1]) blk(g, M.steel, 0.012, 0.012, 0.05, sx * 0.31, -0.266, 0.025, { r: 0.004 });
    for (const [ux, kind] of [[-0.18, 0], [-0.06, 1], [0.06, 2], [0.18, 0]] as const) {
      cyl(g, M.steel, 0.003, 0.003, 0.03, ux, -0.29, 0.05, { bevel: 0.001, seg: 6 });
      cyl(g, kind === 1 ? M.walnut : M.steel, 0.005, 0.005, 0.2, ux, -0.49, 0.05, { bevel: 0.002, seg: 8 });
      if (kind === 0) sph(g, M.steel, 0.03, ux, -0.5, 0.05, [1, 0.45, 1]);
      else if (kind === 1) blk(g, M.walnut, 0.05, 0.07, 0.008, ux, -0.56, 0.05, { r: 0.003 });
      else sph(g, M.steel, 0.026, ux, -0.52, 0.05, [0.8, 1.5, 0.8]);
    }
  }
  // worktop: fruit bowl between sink and hob, chopping board beyond the kettle
  {
    const top = SHELL.counter.top;
    const g = storeys[0];
    cyl(g, M.stone, 0.085, 0.05, 0.05, -0.14, top, -0.2, { bevel: 0.01 });
    sph(g, M.terracotta, 0.032, -0.16, top + 0.065, -0.2);
    sph(g, M.foliage, 0.03, -0.11, top + 0.062, -0.18);
    sph(g, M.brass, 0.028, -0.14, top + 0.07, -0.23);
    blk(g, M.oak, 0.3, 0.02, 0.2, 0.95, top, -0.14, { r: 0.008, ry: 0.08 });
    bar(g, M.seam, 0.26, 0.002, 0.004, 0.95, top + 0.02, -0.06, 0.08);
    cyl(g, M.walnut, 0.01, 0.01, 0.05, 1.11, top + 0.005, -0.14, { rz: Math.PI / 2, bevel: 0.003, seg: 8 });
  }
  // column radiator under the kitchen window (behind the stair's high end), brass valves
  {
    const g = storeys[0];
    const z = wallInZ + 0.05;
    for (let k = 0; k < 12; k += 1) blk(g, M.enamel, 0.04, 0.48, 0.07, 1.33 + k * 0.052, 0.14, z, { r: 0.016 });
    blk(g, M.enamel, 0.62, 0.03, 0.03, 1.33 + 0.286, 0.6, z, { r: 0.012 });
    for (const sx of [1.29, 1.95]) cyl(g, M.brass, 0.012, 0.012, 0.06, sx, 0.08, z, { bevel: 0.003, seg: 12 });
  }
  // framed pieces: flat colour blocks and line reliefs in birch frames (no images)
  const frame = (parent: THREE.Object3D, w: number, h: number, fill: (inner: THREE.Group) => void) => {
    blk(parent, M.birch, w, h, 0.024, 0, 0, 0.012, { r: 0.006 });
    blk(parent, M.plaster, w - 0.05, h - 0.05, 0.006, 0, 0.025, 0.022, { r: 0.002, cast: false });
    const inner = new THREE.Group();
    inner.position.set(0, 0.025, 0.028);
    parent.add(inner);
    fill(inner);
  };
  {
    // living: above the TV, a terracotta block and a stone block
    const g = new THREE.Group();
    g.position.set(-1.12, FLOORS[1].y + 1.48, wallInZ);
    storeys[1].add(g);
    frame(g, 0.52, 0.38, (i) => {
      blk(i, M.terracotta, 0.16, 0.2, 0.004, -0.08, 0.06, 0, { r: 0.0015, cast: false });
      blk(i, M.stone, 0.12, 0.13, 0.004, 0.09, 0.1, 0, { r: 0.0015, cast: false });
      bar(i, M.graphite, 0.36, 0.003, 0.003, 0, 0.04, 0.002);
    });
  }
  {
    // bedroom: two frames on the back wall, a line relief and a sage block
    for (const [fx, kind] of [[-0.62, 0], [-0.22, 1]] as const) {
      const g = new THREE.Group();
      g.position.set(fx, FLOORS[2].y + 1.36, wallInZ);
      storeys[2].add(g);
      frame(g, 0.3, 0.4, (i) => {
        if (kind === 0) for (let k = 0; k < 5; k += 1) bar(i, M.linenDeep, 0.003, 0.24, 0.004, -0.08 + k * 0.04, 0.04 + (k % 2) * 0.03, 0);
        else {
          blk(i, M.foliage, 0.18, 0.22, 0.004, 0, 0.06, 0, { r: 0.0015, cast: false });
          cyl(i, M.linen, 0.035, 0.035, 0.005, 0.03, 0.22, 0.0, { rx: Math.PI / 2, seg: 18 });
        }
      });
    }
  }
  {
    // kitchen: a small block print over the plant (left wall front, clear of the v16 door zone)
    const g = new THREE.Group();
    g.position.set(wallInX, 1.32, 1.98);
    g.rotation.y = Math.PI / 2;
    storeys[0].add(g);
    frame(g, 0.32, 0.4, (i) => {
      blk(i, M.linenDeep, 0.2, 0.26, 0.004, 0, 0.04, 0, { r: 0.0015, cast: false });
      blk(i, M.terracotta, 0.06, 0.06, 0.005, 0.04, 0.2, 0, { r: 0.0015, cast: false });
    });
  }
  {
    // office pinboard on the left wall by the desk: oak board, plain coloured cards, brass pins
    const g = new THREE.Group();
    g.position.set(wallInX, FLOORS[2].y + 1.2, 0.29);
    g.rotation.y = Math.PI / 2;
    storeys[2].add(g);
    blk(g, M.birch, 0.5, 0.38, 0.02, 0, 0, 0.01, { r: 0.006 });
    blk(g, M.oak, 0.46, 0.34, 0.006, 0, 0.02, 0.02, { r: 0.002, cast: false });
    const cards: [number, number, number, number, THREE.Material][] = [
      [-0.15, 0.24, 0.09, 0.12, M.linen],
      [-0.03, 0.27, 0.08, 0.06, M.terracotta],
      [0.11, 0.22, 0.12, 0.08, M.stone],
      [-0.13, 0.09, 0.1, 0.07, M.foliage],
      [0.02, 0.08, 0.07, 0.1, M.enamel],
      [0.14, 0.07, 0.08, 0.08, M.linenDeep],
    ];
    for (const [cx, cy, cw2, ch, mm] of cards) {
      blk(g, mm, cw2, ch, 0.002, cx, cy - ch / 2, 0.025, { r: 0.0008, cast: false });
      sph(g, M.brass, 0.006, cx, cy - 0.012, 0.03, [1, 1, 0.6]);
    }
  }
  mergeStatic(base);
  storeys.forEach((g, i) => mergeStatic(g, { floorY: FLOORS[i].y }));
  for (const f of flights) {
    f.userData.keep = false;
    mergeStatic(f, {});
    f.userData.keep = true;
  }
  storeys.forEach((g, i) => g.add(aoStrips(i, night)));
  return { base, storeys, flights };
}

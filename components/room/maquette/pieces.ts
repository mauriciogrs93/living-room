import * as THREE from "three";
import { SHELL } from "@/lib/room/layout";
import { PAL } from "./config";
import { bar, blk, cap, cyl, leafGeo, sph, torus, type Mats } from "./kit";
import { books } from "./shell";

/**
 * Maquette versions of every catalog piece, built in the piece's local frame with y = 0 on the floor.
 * Anything that moves (doors, the book, curtains) is returned in `parts` as a group flagged `keep`, so the static
 * merge leaves it alone and the React component can animate it.
 */
export type Built = { group: THREE.Group; parts: Record<string, THREE.Object3D> };

function part(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.userData.keep = true;
  parent.add(g);
  return g;
}

export function legs4(g: THREE.Object3D, mat: THREE.Material, w: number, d: number, h: number, inset = 0.04, r = 0.014, y = 0) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, mat, r, r, h, sx * (w / 2 - inset), y, sz * (d / 2 - inset), { bevel: 0.004, seg: 14 });
}

export function chair(g: THREE.Object3D, M: Mats, x: number, z: number, yaw: number, seat = 0.445) {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  c.rotation.y = yaw;
  g.add(c);
  legs4(c, M.steel, 0.34, 0.32, seat - 0.03, 0.03, 0.011);
  blk(c, M.birch, 0.36, 0.03, 0.34, 0, seat - 0.03, 0, { r: 0.01 });
  // spindle back: a curved top rail on five turned birch spindles, steel back posts
  blk(c, M.birch, 0.34, 0.06, 0.028, 0, seat + 0.32, -0.155, { r: 0.012 });
  for (let k = -2; k <= 2; k += 1) cyl(c, M.birch, 0.0065, 0.0075, 0.32, k * 0.055, seat, -0.155, { bevel: 0.002, seg: 8 });
  for (const sx of [-1, 1]) cyl(c, M.steel, 0.01, 0.01, 0.36, sx * 0.155, seat, -0.155, { bevel: 0.003, seg: 10 });
}

function screenBars(parent: THREE.Object3D, M: Mats, w: number, h: number) {
  const widths = [0.62, 0.78, 0.45];
  widths.forEach((f, i) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w * f, h * 0.06), M.screenLine);
    b.position.set(-w * 0.5 + (w * f) / 2 + w * 0.08, h * 0.18 - i * h * 0.17, 0.001);
    b.userData.noContact = true;
    parent.add(b);
  });
}

function group() {
  return new THREE.Group();
}

export function sofa(M: Mats, cushion: boolean): Built {
  const g = group();
  const w = 1.58;
  const d = 0.72;
  blk(g, M.birch, w - 0.06, 0.06, d - 0.08, 0, 0.07, 0, { r: 0.015 });
  bar(g, M.seam, w - 0.07, 0.003, 0.002, 0, 0.1, (d - 0.08) / 2 + 0.0005);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(g, M.walnut, 0.018, 0.014, 0.065, sx * (w / 2 - 0.1), 0.005, sz * (d / 2 - 0.1), { bevel: 0.005, seg: 12 });
    cyl(g, M.brass, 0.015, 0.015, 0.005, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), { bevel: 0.002, seg: 12 });
  }
  blk(g, M.linen, w, 0.2, d, 0, 0.13, 0, { r: 0.03 });
  // back: a frame with three loose back cushions, each tufted with six buttons
  blk(g, M.linen, w - 0.04, 0.36, 0.1, 0, 0.3, -d / 2 + 0.05, { r: 0.03 });
  const by = 0.33;
  for (const cx of [-0.42, 0, 0.42]) {
    blk(g, M.linen, 0.4, 0.3, 0.1, cx, by, -d / 2 + 0.135, { r: 0.04, rx: -0.08 });
    for (const [bx, byy] of [[-0.11, 0.1], [0, 0.1], [0.11, 0.1], [-0.055, 0.2], [0.055, 0.2]] as const) {
      const b = sph(g, M.linenDeep, 0.011, cx + bx, by + byy, -d / 2 + 0.187 - (byy - 0.15) * 0.08, [1, 1, 0.55], [10, 8]);
      b.rotation.x = -0.08;
      b.castShadow = false;
    }
  }
  // arms with piping along the top outer edges
  for (const sx of [-1, 1]) {
    blk(g, M.linen, 0.15, 0.24, d, sx * (w / 2 - 0.075), 0.3, 0, { r: 0.03 });
    for (const ex of [-1, 1]) {
      const pp = cap(g, M.linenDeep, 0.0055, d - 0.06, sx * (w / 2 - 0.075) + ex * 0.068, 0.535, 0, { rx: Math.PI / 2 });
      pp.castShadow = false;
    }
  }
  // seat cushions: split three ways, piped along the front and top edges
  for (const cx of [-0.42, 0, 0.42]) {
    const y = cx < 0 && cushion ? 0.37 : 0.33;
    blk(g, M.linen, 0.41, 0.1, d - 0.2, cx, y, 0.07, { r: 0.03 });
    const front = 0.07 + (d - 0.2) / 2;
    for (const py of [y + 0.092, y + 0.008]) {
      const pp = cap(g, M.linenDeep, 0.0055, 0.35, cx, py, front - 0.008, { rz: Math.PI / 2 });
      pp.castShadow = false;
    }
  }
  blk(g, M.terracotta, 0.28, 0.24, 0.09, 0.45, 0.42, -0.2, { r: 0.03, rx: -0.25, rz: -0.08 });
  blk(g, M.linenDeep, 0.27, 0.22, 0.09, -0.48, 0.42, -0.2, { r: 0.03, rx: -0.2, rz: 0.1 });
  return { group: g, parts: {} };
}

export function bed(M: Mats): Built {
  const g = group();
  const L = 1.46;
  const W = 0.95;
  blk(g, M.birch, L, 0.16, W, 0, 0.06, 0, { r: 0.02 });
  blk(g, M.oak, L - 0.12, 0.06, W - 0.12, 0, 0, 0, { r: 0.01, cast: false });
  blk(g, M.linen, L - 0.06, 0.15, W - 0.06, -0.01, 0.22, 0, { r: 0.03 });
  // headboard: birch frame with three vertical panel grooves
  blk(g, M.birch, 0.06, 0.66, W, L / 2 - 0.03, 0.06, 0, { r: 0.02 });
  for (const z of [-0.24, 0, 0.24]) bar(g, M.seam, 0.003, 0.4, 0.006, L / 2 - 0.061, 0.3, z);
  // quilted cover: a grid of stitched channels across the duvet
  const qy = 0.37;
  const qx0 = -L / 2 + 0.04;
  const qx1 = L / 2 - 0.36;
  for (let k = 0; k <= 5; k += 1) bar(g, M.linenDeep, 0.006, 0.003, W - 0.1, qx0 + ((qx1 - qx0) * k) / 5, qy - 0.001, 0);
  for (let k = 1; k <= 3; k += 1) bar(g, M.linenDeep, qx1 - qx0, 0.003, 0.006, (qx0 + qx1) / 2, qy - 0.001, -W / 2 + 0.05 + ((W - 0.1) * k) / 4);
  // turned-down top sheet band and two pillows with a piped edge, one smaller cushion in front
  blk(g, M.plaster, 0.1, 0.012, W - 0.07, qx1 + 0.06, qy - 0.004, 0, { r: 0.005 });
  for (const z of [-0.2, 0.2]) {
    blk(g, M.plaster, 0.26, 0.1, 0.38, L / 2 - 0.2, qy - 0.01, z, { r: 0.045 });
    const pp = cap(g, M.linenDeep, 0.005, 0.32, L / 2 - 0.33, qy + 0.04, z, { rx: Math.PI / 2 });
    pp.castShadow = false;
  }
  blk(g, M.linenDeep, 0.1, 0.13, 0.3, L / 2 - 0.37, qy - 0.01, 0, { r: 0.04, rz: 0.35 });
  // folded throw at the foot (the one terracotta object up here)
  blk(g, M.terracotta, L * 0.26, 0.05, W - 0.02, -L / 2 + L * 0.13 + 0.03, 0.35, 0, { r: 0.02 });
  bar(g, M.seam, 0.004, 0.003, W - 0.03, -L / 2 + 0.03 + L * 0.13 + L * 0.06, 0.4, 0);
  // bedside table on the back-wall side of the head: drawer, brass knob, a small lamp, a book and a glass
  {
    const t = new THREE.Group();
    t.position.set(L / 2 - 0.16, 0, -W / 2 - 0.21);
    g.add(t);
    legs4(t, M.walnut, 0.34, 0.3, 0.1, 0.03, 0.012);
    blk(t, M.birch, 0.36, 0.34, 0.32, 0, 0.1, 0, { r: 0.015 });
    bar(t, M.seam, 0.32, 0.004, 0.003, 0, 0.3, 0.1605);
    sph(t, M.brass, 0.012, 0, 0.36, 0.165, [1, 1, 0.7]);
    // lamp: walnut base, brass stem, linen drum shade
    cyl(t, M.walnut, 0.05, 0.055, 0.03, -0.07, 0.44, -0.05, { bevel: 0.008 });
    cyl(t, M.brass, 0.006, 0.006, 0.2, -0.07, 0.47, -0.05, { bevel: 0.002, seg: 10 });
    cyl(t, M.linen, 0.075, 0.09, 0.12, -0.07, 0.62, -0.05, { bevel: 0.006 });
    blk(t, M.linenDeep, 0.15, 0.025, 0.11, 0.06, 0.44, 0.06, { r: 0.004, ry: 0.2 });
    blk(t, M.oak, 0.13, 0.02, 0.1, 0.06, 0.465, 0.06, { r: 0.004, ry: 0.1 });
    cyl(t, M.stone, 0.024, 0.02, 0.08, 0.1, 0.44, -0.07, { bevel: 0.004, seg: 14 });
  }
  // rug under the bed: wool field with a pale woven border (flat, outside contact shadows)
  blk(g, M.linenDeep, 1.6, 0.006, 1.22, -0.26, 0, -0.25, { r: 0.002, cast: false, noContact: true });
  for (const sz of [-1, 1]) bar(g, M.linen, 1.46, 0.002, 0.03, -0.26, 0.006, -0.25 + sz * 0.54);
  for (const sx of [-1, 1]) bar(g, M.linen, 0.03, 0.002, 1.08, -0.26 + sx * 0.72, 0.006, -0.25);
  return { group: g, parts: {} };
}

/** Walnut console on steel legs; the screen stands on a steel foot. `band` is the ticker's 3D anchor on the glass. */
export function tv(M: Mats, power: boolean): Built {
  const g = group();
  legs4(g, M.steel, 1.3, 0.36, 0.09, 0.06, 0.012);
  blk(g, M.walnut, 1.35, 0.28, 0.4, 0, 0.09, 0, { r: 0.02 });
  // fluted doors: half-round reeds across the front, a centre joint, two brass pulls
  for (let k = 0; k < 44; k += 1) {
    const x = -0.645 + k * 0.03;
    if (Math.abs(x) < 0.012) continue;
    const f = cyl(g, M.walnut, 0.0115, 0.0115, 0.22, x, 0.12, 0.2, { bevel: 0.003, seg: 8 });
    f.castShadow = false;
  }
  bar(g, M.graphite, 0.004, 0.22, 0.004, 0, 0.12, 0.2);
  for (const sx of [-1, 1]) cyl(g, M.brass, 0.006, 0.006, 0.06, sx * 0.04, 0.2, 0.214, { bevel: 0.002, seg: 10 });
  // low objects in front of the screen (kept under its bottom edge so the ticker stays clear)
  blk(g, M.oak, 0.26, 0.012, 0.13, -0.42, 0.37, 0.11, { r: 0.005 });
  cyl(g, M.plaster, 0.026, 0.023, 0.045, -0.47, 0.382, 0.11, { bevel: 0.005, seg: 16 });
  torus(g, M.plaster, 0.014, 0.004, -0.442, 0.405, 0.11, { arc: Math.PI, rz: -Math.PI / 2 });
  cyl(g, M.stone, 0.035, 0.03, 0.03, -0.37, 0.382, 0.11, { bevel: 0.006, seg: 18 });
  blk(g, M.linen, 0.2, 0.018, 0.14, 0.44, 0.37, 0.1, { r: 0.004 });
  blk(g, M.oak, 0.18, 0.016, 0.13, 0.45, 0.388, 0.1, { r: 0.004, ry: 0.12 });
  blk(g, M.linenDeep, 0.16, 0.014, 0.12, 0.44, 0.404, 0.1, { r: 0.004, ry: -0.08 });
  blk(g, M.steel, 0.32, 0.012, 0.16, 0, 0.37, -0.06, { r: 0.005 });
  blk(g, M.steel, 0.05, 0.12, 0.03, 0, 0.38, -0.08, { r: 0.008 });
  blk(g, M.steel, 1.12, 0.66, 0.035, 0, 0.44, -0.07, { r: 0.012 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.6), power ? M.screenOn : M.screenOff);
  scr.position.set(0, 0.77, -0.05);
  scr.userData.noContact = true;
  g.add(scr);
  if (power) {
    const sg = new THREE.Group();
    sg.position.set(0, 0.77 + 0.05, -0.049);
    g.add(sg);
    screenBars(sg, M, 1.06, 0.6);
  }
  const band = new THREE.Object3D();
  band.position.set(0, 0.77 - 0.3 + 0.054, -0.048);
  band.userData.size = [1.06, 0.108];
  g.add(band);
  return { group: g, parts: { band } };
}

/**
 * Desk sense fix: the engine seats both agents at local z -0.44 facing +z, so the desk sits in FRONT of them and
 * the monitor faces them (the site had the screen facing away from the chairs).
 */
export function desk(M: Mats, power: boolean, night: boolean): Built {
  const g = group();
  const d = new THREE.Group();
  d.position.set(0.18, 0, 0);
  g.add(d);
  legs4(d, M.steel, 1.28, 0.48, 0.72, 0.04, 0.013);
  blk(d, M.birch, 1.32, 0.03, 0.5, 0, 0.72, 0, { r: 0.01 });
  // monitor at local x 0.43 (between the two seats), screen toward the chairs (-z)
  const mx = 0.25;
  blk(d, M.steel, 0.2, 0.01, 0.12, mx, 0.75, 0.12, { r: 0.004 });
  blk(d, M.steel, 0.04, 0.16, 0.025, mx, 0.75, 0.14, { r: 0.006 });
  blk(d, M.steel, 0.52, 0.32, 0.03, mx, 0.88, 0.14, { r: 0.01 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.28), power ? M.screenOn : M.screenOff);
  scr.position.set(mx, 1.04, 0.123);
  scr.rotation.y = Math.PI;
  scr.userData.noContact = true;
  d.add(scr);
  if (power) {
    const sg = new THREE.Group();
    sg.position.set(mx, 1.04, 0.122);
    sg.rotation.y = Math.PI;
    d.add(sg);
    screenBars(sg, M, 0.48, 0.28);
  }
  blk(d, M.linenDeep, 0.34, 0.012, 0.11, mx, 0.75, -0.1, { r: 0.004 });
  // brass task lamp on the left end
  cyl(d, M.brass, 0.045, 0.05, 0.018, -0.5, 0.75, 0.1, { bevel: 0.006 });
  cyl(d, M.brass, 0.007, 0.007, 0.26, -0.5, 0.768, 0.1, { bevel: 0.002, seg: 10 });
  cyl(d, M.brass, 0.045, 0.02, 0.06, -0.5, 1.0, 0.06, { bevel: 0.004, rx: -0.5 });
  books(d, M, -0.36, 0.75, 0.12, 4, 0.18, 0.13);
  // desk objects: a mug, a pen pot with pencils, a notepad with a pencil, a small stone paperweight
  cyl(d, M.plaster, 0.03, 0.027, 0.08, 0.6, 0.75, -0.08, { bevel: 0.005, seg: 16 });
  torus(d, M.plaster, 0.016, 0.005, 0.632, 0.79, -0.08, { arc: Math.PI, rz: -Math.PI / 2 });
  cyl(d, M.terracotta, 0.028, 0.026, 0.09, 0.0, 0.75, 0.17, { bevel: 0.005, seg: 14 });
  for (const [px, pz, rz] of [[-0.01, 0.0, 0.12], [0.012, 0.008, -0.1], [0.0, -0.012, 0.04]] as const) {
    const pc = cyl(d, M.graphite, 0.0035, 0.0035, 0.12, px, 0.78, 0.17 + pz, { bevel: 0.001, seg: 6, rz });
    pc.castShadow = false;
  }
  blk(d, M.enamel, 0.15, 0.01, 0.2, -0.1, 0.75, -0.1, { r: 0.003, ry: -0.1 });
  bar(d, M.seam, 0.12, 0.002, 0.004, -0.1, 0.76, -0.06, -0.1);
  cap(d, M.oak, 0.004, 0.13, -0.05, 0.764, -0.12, { rx: Math.PI / 2, ry: 0.3 });
  sph(d, M.stone, 0.025, -0.25, 0.765, -0.12, [1, 0.6, 1]);
  chair(g, M, 0.16, -0.44, 0, 0.45);
  chair(g, M, 0.7, -0.44, 0, 0.45);
  const anchor = new THREE.Object3D();
  anchor.position.set(0.43, 1.06, 0.14);
  g.add(anchor);
  const lamp = new THREE.Object3D();
  lamp.position.set(-0.32, 0.95, -0.1);
  g.add(lamp);
  void night;
  return { group: g, parts: { anchor, lamp } };
}

export function floorLamp(M: Mats, on: boolean, sideTable = false): Built {
  const g = group();
  if (sideTable) {
    // round side table between the sofa arm and the lamp: walnut pedestal, birch top, a mug, two books, a tray
    const t = new THREE.Group();
    t.position.set(-0.345, 0, -0.12);
    g.add(t);
    cyl(t, M.walnut, 0.11, 0.115, 0.022, 0, 0, 0, { bevel: 0.008 });
    cyl(t, M.walnut, 0.02, 0.026, 0.46, 0, 0.022, 0, { bevel: 0.004, seg: 14 });
    cyl(t, M.birch, 0.15, 0.145, 0.03, 0, 0.482, 0, { bevel: 0.01 });
    cyl(t, M.brass, 0.034, 0.034, 0.006, 0, 0.476, 0, { bevel: 0.002, seg: 14 });
    blk(t, M.linenDeep, 0.15, 0.024, 0.11, -0.03, 0.512, 0.03, { r: 0.004, ry: 0.35 });
    blk(t, M.oak, 0.13, 0.02, 0.1, -0.03, 0.536, 0.03, { r: 0.004, ry: 0.2 });
    cyl(t, M.plaster, 0.028, 0.025, 0.07, 0.07, 0.512, -0.05, { bevel: 0.005, seg: 16 });
    torus(t, M.plaster, 0.015, 0.0045, 0.07 + 0.03, 0.548, -0.05, { arc: Math.PI, rz: -Math.PI / 2 });
  }
  cyl(g, M.steel, 0.15, 0.16, 0.035, 0, 0, 0, { bevel: 0.012 });
  cyl(g, M.steel, 0.011, 0.011, 1.27, 0, 0.035, 0, { bevel: 0.004, seg: 12 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.25, 40, 1, true), on ? M.shadeOn : M.shadeOff);
  shade.position.y = 1.29 + 0.125;
  shade.castShadow = !on;
  shade.userData.keep = true;
  g.add(shade);
  torus(g, M.brass, 0.19, 0.006, 0, 1.29, 0, { rx: Math.PI / 2 });
  torus(g, M.brass, 0.15, 0.006, 0, 1.54, 0, { rx: Math.PI / 2 });
  // brass collars on the stem, a socket cap and a finial; a cord to the floor with an inline switch
  for (const y of [0.035, 0.62, 1.24]) cyl(g, M.brass, 0.016, 0.016, 0.03, 0, y, 0, { bevel: 0.004, seg: 14 });
  cyl(g, M.brass, 0.022, 0.018, 0.05, 0, 1.3, 0, { bevel: 0.006, seg: 14 });
  sph(g, M.brass, 0.012, 0, 1.56, 0, [1, 1, 1], [12, 8]);
  // short lead from the base to a foot switch resting on the boards (no loose cable across the room)
  const cord = cap(g, M.graphite, 0.004, 0.09, -0.04, 0.004, -0.2, { rx: Math.PI / 2 });
  cord.castShadow = false;
  blk(g, M.graphite, 0.03, 0.014, 0.05, -0.04, 0, -0.27, { r: 0.005 });
  return { group: g, parts: { shade } };
}

/** Fridge pulled back to the wall; the upper door is a hinged part. */
export function fridge(M: Mats): Built {
  const g = group();
  const fz = -0.18;
  blk(g, M.birch, 0.56, 0.7, 0.48, -0.46, 0, fz + 0.05, { r: 0.02 });
  blk(g, M.birch, 0.52, 0.01, 0.01, -0.46, 0.35, fz + 0.29, { r: 0.003, cast: false });
  cyl(g, M.oak, 0.11, 0.07, 0.07, -0.46, 0.7, fz + 0.05, { bevel: 0.01 });
  sph(g, M.plaster, 0.045, -0.49, 0.79, fz + 0.06);
  sph(g, M.linenDeep, 0.04, -0.42, 0.785, fz + 0.03);
  sph(g, M.terracotta, 0.035, -0.45, 0.79, fz + 0.1);
  blk(g, M.enamel, 0.62, 1.58, 0.56, 0.15, 0, fz - 0.01, { r: 0.035 });
  blk(g, M.enamel, 0.6, 0.9, 0.024, 0.15, 0.04, fz + 0.27, { r: 0.01 });
  blk(g, M.steel, 0.02, 0.2, 0.025, 0.4, 0.66, fz + 0.3, { r: 0.008 });
  // kick vent under the lower door
  bar(g, M.graphite, 0.36, 0.012, 0.004, 0.15, 0.012, fz + 0.272);
  // upper door, hinged on the right edge
  const door = part(g, 0.45, 0.97, fz + 0.27);
  blk(door, M.enamel, 0.6, 0.6, 0.024, -0.3, 0, 0, { r: 0.01 });
  blk(door, M.steel, 0.02, 0.3, 0.025, -0.55, 0.08, 0.025, { r: 0.008 });
  return { group: g, parts: { door } };
}

/** Bookshelf; the terracotta book is a part that slides out. */
export function bookshelf(M: Mats): Built {
  const g = group();
  const W = 0.78;
  const H = 1.82;
  const D = 0.32;
  for (const sx of [-1, 1]) blk(g, M.birch, 0.03, H, D, sx * (W / 2 - 0.015), 0, 0, { r: 0.008 });
  blk(g, M.plaster, W - 0.06, H - 0.06, 0.012, 0, 0.03, -D / 2 + 0.006, { r: 0.004, cast: false });
  for (const y of [0.04, 0.42, 0.8, 1.18, 1.56, 1.79]) blk(g, M.birch, W - 0.06, 0.03, D - 0.02, 0, y, 0, { r: 0.008 });
  books(g, M, -0.34, 0.07, 0, 9, 0.26, 0.2, 3, true);
  books(g, M, -0.34, 0.45, 0, 6, 0.24, 0.2, -1, true);
  blk(g, M.linenDeep, 0.12, 0.1, 0.12, 0.25, 0.45, 0.02, { r: 0.03 });
  // a lying stack and a small vase on the third shelf
  blk(g, M.oak, 0.2, 0.03, 0.15, -0.24, 0.83, 0.01, { r: 0.005 });
  blk(g, M.stone, 0.19, 0.026, 0.14, -0.235, 0.86, 0.01, { r: 0.005, ry: 0.06 });
  blk(g, M.linen, 0.17, 0.024, 0.13, -0.24, 0.886, 0.01, { r: 0.005, ry: -0.05 });
  books(g, M, -0.1, 0.83, 0, 7, 0.25, 0.2, -1, true);
  cyl(g, M.brass, 0.04, 0.05, 0.12, -0.25, 1.21, 0, { bevel: 0.01 });
  books(g, M, -0.13, 1.21, 0, 6, 0.23, 0.2);
  sph(g, M.stone, 0.05, 0.22, 1.59 + 0.045, 0.0, [1, 0.9, 1], [16, 12]);
  books(g, M, -0.34, 1.59, 0, 5, 0.17, 0.18, -1, true);
  // plank seams on the plaster back panel
  for (const y of [0.42, 0.8, 1.18, 1.56]) bar(g, M.seam, W - 0.07, 0.002, 0.002, 0, y + 0.034, -D / 2 + 0.013);
  // the accent book: position of index 3 in the first row
  // (same width/height formula as books() in shell.ts)
  let x = -0.34;
  for (let i = 0; i < 3; i += 1) x += 0.03 + ((i * 37) % 5) * 0.007 + 0.003;
  const w = 0.03 + ((3 * 37) % 5) * 0.007;
  const book = part(g, 0, 0, 0);
  blk(book, M.terracotta, w, 0.26 - ((3 * 53) % 5) * 0.016, 0.2, x + w / 2, 0.07, 0, { r: 0.005 });
  return { group: g, parts: { book } };
}

export function sink(M: Mats): Built {
  const g = group();
  const y = SHELL.counter.top;
  blk(g, M.sinkRim, 0.4, 0.012, 0.32, 0, y, 0, { r: 0.004, cast: false });
  blk(g, M.sinkBasin, 0.32, 0.004, 0.24, 0, y + 0.01, 0.01, { r: 0.0015, cast: false });
  cyl(g, M.steel, 0.012, 0.012, 0.2, 0, y, -0.13, { bevel: 0.004, seg: 12 });
  cap(g, M.steel, 0.011, 0.1, 0, y + 0.2, -0.08, { rx: Math.PI / 2 });
  // lever on the tap column, a nozzle tip and a drain cap in the basin
  cap(g, M.steel, 0.006, 0.05, 0.03, y + 0.16, -0.13, { rz: Math.PI / 2 });
  cyl(g, M.steel, 0.014, 0.012, 0.012, 0, y + 0.18, -0.02, { bevel: 0.003, seg: 12 });
  cyl(g, M.steel, 0.02, 0.02, 0.003, 0, y + 0.014, 0.01, { bevel: 0.001, seg: 14 });
  return { group: g, parts: {} };
}

export function stove(M: Mats, hot: boolean): Built {
  const g = group();
  const y = SHELL.counter.top;
  blk(g, M.steel, 0.44, 0.014, 0.36, 0, y, 0, { r: 0.005 });
  for (const sx of [-1, 1]) {
    torus(g, hot ? M.hot : M.graphite, 0.065, 0.008, sx * 0.1, y + 0.016, 0, { rx: Math.PI / 2 });
    torus(g, M.graphite, 0.035, 0.006, sx * 0.1, y + 0.016, 0, { rx: Math.PI / 2 });
    cyl(g, M.graphite, 0.014, 0.014, 0.006, sx * 0.1, y + 0.014, 0, { bevel: 0.002, seg: 12 });
    // control knob near the front lip
    cyl(g, M.graphite, 0.014, 0.014, 0.014, sx * 0.05, y + 0.014, 0.14, { bevel: 0.003, seg: 12 });
  }
  return { group: g, parts: {} };
}

export function kettle(M: Mats): Built {
  const g = group();
  const y0 = SHELL.counter.top;
  // power base with its cord running back to the wall socket along the worktop
  cyl(g, M.graphite, 0.088, 0.09, 0.012, 0, y0, 0, { bevel: 0.004 });
  cap(g, M.graphite, 0.004, 0.1, 0, y0 + 0.004, -0.15, { rx: Math.PI / 2 });
  const y = y0 + 0.012;
  cyl(g, M.brass, 0.065, 0.078, 0.16, 0, y, 0, { bevel: 0.02 });
  cyl(g, M.walnut, 0.018, 0.022, 0.025, 0, y + 0.16, 0, { bevel: 0.006, seg: 16 });
  cap(g, M.brass, 0.012, 0.07, 0.085, y + 0.09, 0, { rz: -0.9 });
  torus(g, M.walnut, 0.055, 0.009, 0, y + 0.16, 0, { ry: Math.PI / 2, arc: Math.PI });
  return { group: g, parts: {} };
}

/** Walnut sideboard + birch radio (with the TV console, the only walnut in the house). */
export function radio(M: Mats, on: boolean): Built {
  const g = group();
  legs4(g, M.steel, 0.44, 0.32, 0.1, 0.04, 0.011);
  blk(g, M.walnut, 0.48, 0.6, 0.36, 0, 0.1, 0, { r: 0.02 });
  blk(g, M.walnut, 0.44, 0.008, 0.01, 0, 0.4, 0.18, { r: 0.003, cast: false });
  bar(g, M.graphite, 0.003, 0.28, 0.003, 0, 0.11, 0.181);
  for (const sx of [-1, 1]) sph(g, M.brass, 0.011, sx * 0.03, 0.27, 0.188, [1, 1, 0.8], [10, 8]);
  cyl(g, M.stone, 0.022, 0.02, 0.05, 0.16, 0.7, 0.125, { bevel: 0.004, seg: 14 });
  torus(g, M.stone, 0.012, 0.0035, 0.183, 0.725, 0.125, { arc: Math.PI, rz: -Math.PI / 2 });
  blk(g, M.birch, 0.34, 0.16, 0.14, 0, 0.7, 0, { r: 0.02 });
  blk(g, M.steel, 0.14, 0.1, 0.006, -0.07, 0.73, 0.07, { r: 0.004, cast: false });
  cyl(g, on ? M.hot : M.brass, 0.03, 0.03, 0.014, 0.09, 0.78, 0.072, { rx: Math.PI / 2, bevel: 0.004 });
  cyl(g, M.steel, 0.004, 0.004, 0.2, 0.13, 0.86, -0.04, { bevel: 0.001, seg: 8 });
  return { group: g, parts: {} };
}

/** Kitchen switch plate, flush on the back wall. `wallDz` = wall face minus the object's staged z. */
export function wallSwitch(M: Mats, on: boolean, wallDz: number): Built {
  const g = group();
  const sw = new THREE.Group();
  sw.position.set(0, -0.06, wallDz);
  g.add(sw);
  blk(sw, M.plaster, 0.09, 0.13, 0.014, 0, -0.065, 0.007, { r: 0.006 });
  blk(sw, on ? M.brass : M.graphite, 0.022, 0.04, 0.012, 0, -0.02, 0.018, { r: 0.004 });
  return { group: g, parts: { plate: sw } };
}

export function plant(M: Mats): Built {
  const g = group();
  // stone saucer, terracotta pot with a rolled rim, dark soil
  cyl(g, M.stone, 0.13, 0.12, 0.018, 0, 0, 0, { bevel: 0.006 });
  cyl(g, M.terracotta, 0.12, 0.095, 0.2, 0, 0.018, 0, { bevel: 0.014 });
  torus(g, M.terracotta, 0.118, 0.012, 0, 0.205, 0, { rx: Math.PI / 2 });
  cyl(g, M.soil, 0.106, 0.106, 0.012, 0, 0.196, 0, { bevel: 0.004 });
  // leaves: one shaped blade instanced on three rising whorls (baked into the merged mesh: no extra draw call)
  // lively canopy: four whorls from broad drooping outer leaves to small upright young ones, each leaf its own
  // sage tone (strong per-leaf jitter); leaves never cast, so there is no leaf-shadow noise
  const whorls: [number, number, number, number][] = [
    [0.22, 8, 0.38, 0.21],
    [0.29, 7, 0.68, 0.18],
    [0.36, 6, 0.98, 0.15],
    [0.42, 4, 1.25, 0.11],
  ];
  let seed = 1;
  whorls.forEach(([y, n, tilt, len], wi) => {
    for (let k = 0; k < n; k += 1) {
      seed = (seed * 9301 + 49297) % 233280;
      const jit = seed / 233280;
      const yaw = (k / n) * Math.PI * 2 + wi * 0.6 + jit * 0.4;
      const stem = new THREE.Group();
      stem.position.set(0, y, 0);
      stem.rotation.set(0, yaw, 0);
      g.add(stem);
      const lf = new THREE.Mesh(leafGeo(len * (0.85 + jit * 0.3), len * 0.36), M.foliage);
      lf.rotation.set(-(Math.PI / 2 - tilt - (jit - 0.5) * 0.25), (jit - 0.5) * 0.5, 0);
      lf.userData.jitter = 0.3;
      // lively: outer blades a deeper green, young upright ones fresher and lighter (still in the muted sage family)
      const young = wi / 3;
      lf.userData.tint = [0.8 + young * 0.12 + jit * 0.04, 0.95 + young * 0.1, 0.74 + young * 0.06];
      lf.castShadow = false;
      lf.receiveShadow = true;
      stem.add(lf);
    }
  });
  cyl(g, M.foliage, 0.006, 0.008, 0.24, 0, 0.2, 0, { bevel: 0.002, seg: 8 });
  return { group: g, parts: {} };
}

export function table(M: Mats): Built {
  const g = group();
  legs4(g, M.steel, 0.78, 0.5, 0.69, 0.05, 0.014);
  blk(g, M.birch, 0.82, 0.03, 0.56, 0, 0.69, 0, { r: 0.01 });
  // table setting: a linen runner, two plates with cups, a small vase with a sprig
  blk(g, M.linen, 0.74, 0.004, 0.16, 0, 0.72, 0, { r: 0.0015 });
  for (const sz of [-1, 1]) {
    cyl(g, M.enamel, 0.085, 0.075, 0.012, -0.08, 0.72, sz * 0.17, { bevel: 0.004 });
    cyl(g, M.plaster, 0.05, 0.045, 0.008, -0.08, 0.732, sz * 0.17, { bevel: 0.003 });
    cyl(g, M.plaster, 0.028, 0.024, 0.06, 0.08, 0.72, sz * 0.2, { bevel: 0.005, seg: 16 });
    torus(g, M.plaster, 0.014, 0.004, 0.08 + 0.031, 0.75, sz * 0.2, { arc: Math.PI, rz: -Math.PI / 2 });
  }
  cyl(g, M.stone, 0.03, 0.026, 0.11, 0.25, 0.724, 0, { bevel: 0.008, seg: 16 });
  cyl(g, M.foliage, 0.003, 0.003, 0.14, 0.25, 0.83, 0, { bevel: 0.001, seg: 6 });
  for (const [ry, rz] of [[0, 0.5], [2.1, 0.6], [4.2, 0.45]] as const) {
    const lf = new THREE.Mesh(leafGeo(0.06, 0.02), M.foliage);
    lf.position.set(0.25, 0.9, 0);
    lf.rotation.set(0, ry, rz);
    lf.castShadow = true;
    g.add(lf);
  }
  chair(g, M, 0, -0.39, 0);
  chair(g, M, 0, 0.39, Math.PI);
  return { group: g, parts: {} };
}

/** Compact lounge chair; seat top ~0.40 so a seated hip (0.46) lands on it. */
export function lounge(M: Mats): Built {
  const g = group();
  blk(g, M.birch, 0.4, 0.06, 0.4, 0, 0.2, 0, { r: 0.012 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.walnut, 0.014, 0.012, 0.2, sx * 0.16, 0, sz * 0.16, { bevel: 0.004, seg: 12 });
  blk(g, M.linen, 0.38, 0.12, 0.36, 0, 0.26, 0.015, { r: 0.03 });
  blk(g, M.linen, 0.38, 0.4, 0.09, 0, 0.32, -0.155, { r: 0.03, rx: -0.12 });
  for (const sx of [-1, 1]) blk(g, M.birch, 0.03, 0.24, 0.38, sx * 0.185, 0.26, 0, { r: 0.012 });
  return { group: g, parts: {} };
}

/** Birch wardrobe; both doors are hinged parts. */
export function wardrobe(M: Mats): Built {
  const g = group();
  blk(g, M.birch, 0.56, 1.6, 0.4, 0, 0.04, 0, { r: 0.02 });
  blk(g, M.oak, 0.5, 0.04, 0.34, 0, 0, 0, { r: 0.008, cast: false });
  blk(g, M.linenDeep, 0.5, 1.4, 0.01, 0, 0.12, 0.19, { r: 0.004, cast: false });
  const left = part(g, -0.274, 0.09, 0.205);
  blk(left, M.birch, 0.27, 1.5, 0.02, 0.137, 0, 0, { r: 0.008 });
  cyl(left, M.brass, 0.007, 0.007, 0.14, 0.254, 0.76, 0.02, { bevel: 0.002, seg: 10 });
  const right = part(g, 0.274, 0.09, 0.205);
  blk(right, M.birch, 0.27, 1.5, 0.02, -0.137, 0, 0, { r: 0.008 });
  cyl(right, M.brass, 0.007, 0.007, 0.14, -0.254, 0.76, 0.02, { bevel: 0.002, seg: 10 });
  return { group: g, parts: { left, right } };
}

export function dogbed(M: Mats): Built {
  const g = group();
  blk(g, M.linenDeep, 0.55, 0.11, 0.4, 0, 0, 0, { r: 0.03 });
  blk(g, M.linen, 0.43, 0.06, 0.28, 0, 0.07, 0, { r: 0.03 });
  return { group: g, parts: {} };
}

/** Unknown catalog kinds: a plain birch crate, so new objects still read as part of the model. */
export function crate(M: Mats): Built {
  const g = group();
  blk(g, M.birch, 0.5, 0.5, 0.5, 0, 0, 0, { r: 0.02 });
  return { group: g, parts: {} };
}

/** Kitchen counter (SHELL.counter): birch carcass, four fronts (the outer two are hinged doors), stone top. */
export function counter(M: Mats): Built {
  const g = group();
  const c = SHELL.counter;
  blk(g, M.oak, c.w - 0.1, 0.07, c.d - 0.1, 0, 0, -0.02, { r: 0.01, cast: false });
  blk(g, M.birch, c.w - 0.04, 0.63, c.d - 0.04, 0, 0.07, -0.01, { r: 0.015 });
  const dw = (c.w - 0.08) / 4;
  const parts: Record<string, THREE.Object3D> = {};
  for (let i = 0; i < 4; i += 1) {
    const cx = -c.w / 2 + 0.04 + dw * (i + 0.5);
    const kx = cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.05);
    if (i === 0 || i === 3) {
      const hingeX = i === 0 ? cx - dw / 2 + 0.006 : cx + dw / 2 - 0.006;
      const door = part(g, hingeX, 0.095, c.d / 2 - 0.01);
      blk(door, M.birch, dw - 0.012, 0.58, 0.016, cx - hingeX, 0, 0, { r: 0.006 });
      cyl(door, M.brass, 0.006, 0.006, 0.08, kx - hingeX, 0.455, 0.015, { bevel: 0.002, seg: 8 });
      parts[i === 0 ? "left" : "right"] = door;
    } else {
      blk(g, M.birch, dw - 0.012, 0.58, 0.016, cx, 0.095, c.d / 2 - 0.01, { r: 0.006 });
      cyl(g, M.brass, 0.006, 0.006, 0.08, kx, 0.55, c.d / 2 + 0.005, { bevel: 0.002, seg: 8 });
    }
  }
  blk(g, M.stone, c.w, 0.04, c.d, 0, 0.7, 0, { r: 0.01 });
  return { group: g, parts };
}

/** The kitchen pendant: the honest fixture behind the kitchen switch. Linen shade, brass cap. */
export function pendant(M: Mats, on: boolean, roomH: number): Built {
  const g = group();
  cyl(g, M.steel, 0.004, 0.004, 0.62, 0, roomH - 0.62, 0, { bevel: 0.001, seg: 6 });
  cyl(g, M.brass, 0.022, 0.026, 0.035, 0, roomH - 0.52, 0, { bevel: 0.006, seg: 20 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), on ? M.shadeOn : M.shadeOff);
  dome.position.y = roomH - 0.66;
  dome.castShadow = !on;
  g.add(dome);
  sph(g, on ? M.shadeOn : M.plaster, 0.045, 0, roomH - 0.68, 0);
  return { group: g, parts: {} };
}

/** Plaster dog with a fur-toned body. Origin at the body centre. */
export function dog(M: Mats): Built {
  const g = group();
  cap(g, M.fur, 0.085, 0.2, 0, 0, 0, { rz: Math.PI / 2 });
  const head = part(g, 0.17, 0.02, 0);
  sph(head, M.fur, 0.085, 0, 0, 0);
  sph(head, M.linenDeep, 0.04, 0.07, -0.02, 0, [1.2, 0.8, 0.9]);
  for (const sz of [-1, 1]) sph(head, M.birch, 0.03, -0.02, 0.06, sz * 0.06, [0.7, 1.3, 0.5]);
  for (const sz of [-1, 1]) sph(head, M.graphite, 0.009, 0.065, 0.02, sz * 0.035);
  const tail = part(g, -0.17, 0.02, 0);
  cap(tail, M.fur, 0.02, 0.12, -0.03, 0.04, 0, { rz: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cap(g, M.fur, 0.022, 0.06, sx * 0.1, -0.09, sz * 0.05);
  return { group: g, parts: { head, tail } };
}

export const PIECE_COLORS = PAL;

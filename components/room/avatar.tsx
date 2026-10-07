"use client";

import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { Bone, Box3, BoxGeometry, BufferAttribute, type Camera, type Object3D, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SRGBColorSpace, Skeleton, SkinnedMesh, Uint16BufferAttribute, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, LatheGeometry, MeshPhysicalMaterial, MeshStandardMaterial, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3, type BufferGeometry, type Group, type Material } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLOORS, HOUSE, kettleSpot, stagePose } from "@/lib/room/layout";
import { motionPoint } from "@/lib/room/paths";
import type { PublicAgent } from "@/lib/room/types";
import { DeckContext } from "./interact";
import { useAtmosphere } from "./atmosphere";
import { MAQUETTE, PAL } from "./maquette/config";
const HIPS = 0.72;
const STEPS = 8;

function tread(z: number, glide: number) {
  const pairs = [
    [FLOORS[0], FLOORS[1]],
    [FLOORS[1], FLOORS[2]],
  ] as const;
  for (const [below, above] of pairs) {
    if (!below || !above || z <= below.z1 || z >= above.z0) continue;
    const along = (z - below.z1) / (above.z0 - below.z1);
    const step = Math.min(STEPS - 1, Math.max(0, Math.floor(along * STEPS)));
    return below.y + ((above.y - below.y) / STEPS) * (step + 1);
  }
  return glide;
}

/** Figures are built in prototype units (hip at the origin) and scaled so a standing hip sits at 0.72 m. */
const FIG = MAQUETTE.figureScale;
const THIGH = 0.3;
const SHIN = 0.24;
const FOOT = 0.055;
const HIP_PIVOT = -0.03;

/** A small, stable head tilt per agent: the charm of hand-placed model figures. */
function tiltOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return [0.1, -0.12, 0.08, -0.06, 0.04, -0.1][Math.abs(h) % 6];
}

// Sculpted architectural-model figure, about 6 heads tall (reads better than 7 at phone scale). Hip pivot at the origin,
// head top at ~0.76, soles at -0.6 (prototype units). Every part is merged per moving piece and carries its tone as
// vertex colours, so the plaster, trousers, shoes and eyes share ONE material and the shirt is ONE per-agent material.
// ~3.2k triangles per figure (measured with __glDump); no textures.
const FIGURE_GEO: {
  head?: BufferGeometry; eyes?: BufferGeometry; torso?: BufferGeometry; arm?: BufferGeometry; fore?: BufferGeometry;
  thigh?: BufferGeometry; shin?: BufferGeometry; foot?: BufferGeometry;
} = {};
// figure parts carry their tone as vertex colours, so plaster body, shaded legs and eyes share ONE material
function paint(g: BufferGeometry, hex: string) {
  const c = new Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let k = 0; k < n; k += 1) {
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
  }
  g.setAttribute("color", new BufferAttribute(col, 3));
  return g;
}
const clean = (g: BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== "position" && k !== "normal" && k !== "color") out.deleteAttribute(k);
  return out;
};
const merge = (parts: BufferGeometry[]) => mergeGeometries(parts.map(clean))!;
export const HEAD_Y = 0.635;

// ---------------------------------------------------------------- sculpted heads: face planes, baked socket AO, hair
export type HairStyle = "bare" | "cap" | "bun" | "crop" | "beanie";
const HAIR_BY_NAME: Record<string, HairStyle> = { basil: "cap", juniper: "bun", pip: "crop" };
export function hairOf(name: string): HairStyle {
  const k = name.toLowerCase();
  if (HAIR_BY_NAME[k]) return HAIR_BY_NAME[k];
  let h = 0;
  for (let i = 0; i < k.length; i += 1) h = (h * 31 + k.charCodeAt(i)) | 0;
  return (["cap", "bun", "crop", "beanie"] as HairStyle[])[Math.abs(h) % 4];
}
const HEADS = new Map<HairStyle, BufferGeometry>();
function headGeo(style: HairStyle) {
  const hit = HEADS.get(style);
  if (hit) return hit;
  const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  const plaster = PAL.figure;
  // face: egg skull, jaw, a soft brow ridge, a nose with a bridge that catches the key light, ears, neck
  const parts: BufferGeometry[] = [
    paint(new SphereGeometry(0.1, 24, 16).scale(0.9, 1.08, 1), plaster),
    paint(at(new SphereGeometry(0.06, 12, 6).scale(1, 0.85, 1), 0, -0.052, 0.014), plaster),
    paint(at(new SphereGeometry(0.066, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.3, 0.55), 0, 0.014, 0.062), plaster),
    paint(at(new SphereGeometry(0.016, 8, 6).scale(0.6, 1.3, 0.8).rotateX(-0.35), 0, -0.018, 0.093), plaster),
    paint(at(new CapsuleGeometry(0.007, 0.03, 2, 6).rotateX(0.4), 0, 0.002, 0.093), plaster),
    ...[-1, 1].map((sx) => paint(at(new SphereGeometry(0.022, 6, 4).scale(0.45, 1, 0.7), sx * 0.088, -0.005, -0.004), plaster)),
    paint(at(new CylinderGeometry(0.036, 0.042, 0.1, 10, 1, true), 0, -0.13, -0.008), "#E3DDD2"),
  ];
  // hair / headwear: one sculpted plaster form per agent, for silhouette variety (tones stay in the plaster family)
  const cap = (r: number, open: number, tilt: number, sx: number, sy: number, sz: number) =>
    new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI * open).rotateX(tilt).scale(sx, sy, sz);
  if (style === "cap") {
    parts.push(paint(at(cap(0.104, 0.42, -0.12, 0.94, 1.0, 1.04), 0, 0.016, -0.004), "#A59B8C"));
    parts.push(paint(at(new CylinderGeometry(0.08, 0.08, 0.013, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.8).rotateX(0.32), 0, 0.046, 0.056), "#988E80"));
    parts.push(paint(at(new SphereGeometry(0.012, 6, 4), 0, 0.124, 0), "#988E80"));
  } else if (style === "bun") {
    parts.push(paint(at(cap(0.106, 0.56, -0.62, 0.93, 1.05, 1.04), 0, 0.004, -0.008), "#CBBFAE"));
    parts.push(paint(at(new SphereGeometry(0.044, 12, 8), 0, 0.098, -0.07), "#C4B8A6"));
  } else if (style === "crop") {
    parts.push(paint(at(cap(0.105, 0.44, -0.36, 0.93, 1.04, 1.03), 0, 0.006, -0.006), "#B3A897"));
    parts.push(paint(at(new SphereGeometry(0.05, 14, 8).scale(1.3, 0.5, 0.8).rotateZ(-0.2), 0.02, 0.062, 0.04), "#B3A897"));
  } else if (style === "beanie") {
    parts.push(paint(at(cap(0.109, 0.46, -0.2, 0.94, 1.08, 1.04), 0, 0.012, -0.004), "#A3A89F"));
    parts.push(paint(at(new TorusGeometry(0.094, 0.01, 4, 20).rotateX(Math.PI / 2 - 0.2).scale(0.95, 1, 1.06), 0, 0.04, -0.012), "#979C93"));
  }
  const g = merge(parts);
  // baked AO: eye sockets catch shadow under the brow, a soft shade under the nose and under the jaw
  const pos = g.attributes.position;
  const col = g.attributes.color;
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k);
    const y = pos.getY(k);
    const z = pos.getZ(k);
    let ao = 1;
    for (const ex of [-0.034, 0.034]) {
      const d = Math.hypot((x - ex) / 1.2, y - 0.006, (z - 0.08) * 0.8);
      if (d < 0.042) ao *= 1 - 0.58 * (1 - d / 0.042);
    }
    const dn = Math.hypot(x, (y + 0.04) * 1.3, z - 0.088);
    if (dn < 0.026) ao *= 1 - 0.16 * (1 - dn / 0.026);
    if (y < -0.085 && z > -0.04) ao *= 0.9;
    col.setXYZ(k, col.getX(k) * ao, col.getY(k) * ao, col.getZ(k) * ao);
  }
  HEADS.set(style, g);
  return g;
}
/** Shirt colour: the agent's hue, clearly distinguishable but muted (sage / ochre / slate at phone scale). */
function shirtTone(hex: string) {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, SRGBColorSpace);
  // blues lean to slate (a touch greener, greyer) so they never read lavender
  // draft 5: a deeper, richer slate (s 0.22 -> 0.40, l 0.56 -> 0.42) so it holds its colour in daylight and against plaster
  if (hsl.h > 0.55 && hsl.h < 0.75) return new Color().setHSL(0.585 + (hsl.h - 0.585) * 0.3, 0.4, 0.42, SRGBColorSpace);
  return new Color().setHSL(hsl.h, Math.min(0.3, Math.max(0.18, hsl.s * 0.45)), 0.6, SRGBColorSpace);
}
/** The shirt is baked into the torso's vertex colours, so every figure (plaster, shirt, shoes) draws with ONE material. */
const TORSOS = new Map<string, BufferGeometry>();
function torsoFor(color: string) {
  let g = TORSOS.get(color);
  if (!g) {
    g = figureGeo().torso.clone();
    const tone = shirtTone(color);
    const col = g.attributes.color;
    for (let k = 0; k < col.count; k += 1) col.setXYZ(k, col.getX(k) * tone.r, col.getY(k) * tone.g, col.getZ(k) * tone.b);
    TORSOS.set(color, g);
  }
  return g;
}
/** Selection rings share one material per mode (they used to be one per avatar). */
const RING_MATS = new Map<boolean, MeshBasicMaterial>();
function ringMat(night: boolean) {
  let m = RING_MATS.get(night);
  if (!m) {
    m = new MeshBasicMaterial({ color: night ? "#F5F2EB" : "#2B2D31", transparent: true, opacity: 0.85, depthWrite: false });
    RING_MATS.set(night, m);
  }
  return m;
}
type Obstacle = { l: number; t: number; r: number; b: number; w: number };
/** Screen rects (client px) of each figure, written every frame by its own Avatar; read by the speech-note placer. */
const FIGURE_RECTS = new Map<string, { l: number; t: number; r: number; b: number }>();
const AVOID = { at: -1, rects: [] as Obstacle[] };
const _box = new Box3();
const _pt = new Vector3();
function projectBox(box: Box3, camera: Camera, bounds: DOMRect) {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    _pt.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    const x = bounds.left + (_pt.x * 0.5 + 0.5) * bounds.width;
    const y = bounds.top + (-_pt.y * 0.5 + 0.5) * bounds.height;
    l = Math.min(l, x);
    r = Math.max(r, x);
    t = Math.min(t, y);
    b = Math.max(b, y);
  }
  return { l, t, r, b };
}
function overlap(x: number, y: number, w: number, h: number, o: { l: number; t: number; r: number; b: number }) {
  const ox = Math.min(x + w, o.r) - Math.max(x, o.l);
  const oy = Math.min(y + h, o.b) - Math.max(y, o.t);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}
/** What a speech note must not cover: other tags, every figure, the TV and the top of each stair flight. */
function noteObstacles(host: HTMLElement, label: HTMLElement, selfId: string, scene: Object3D, camera: Camera, bounds: DOMRect): Obstacle[] {
  const out: Obstacle[] = [];
  for (const tag of host.querySelectorAll<HTMLElement>(".agent-tag")) {
    if (label.contains(tag)) continue;
    const t = tag.getBoundingClientRect();
    out.push({ l: t.left - 6, t: t.top - 6, r: t.right + 6, b: t.bottom + 6, w: 30 });
  }
  for (const [id, f] of FIGURE_RECTS) out.push({ ...f, w: id === selfId ? 6 : 12 });
  // scene obstacles are re-projected a few times a second (the camera only moves on fit changes or follow)
  const now = performance.now();
  if (now - AVOID.at > 250) {
    AVOID.at = now;
    AVOID.rects = [];
    const tv = scene.getObjectByName("obj:tv");
    if (tv) AVOID.rects.push({ ...projectBox(_box.setFromObject(tv), camera, bounds), w: 4 });
    scene.traverse((o) => {
      if (o.name !== "stair-flight" || !o.visible) return;
      _box.setFromObject(o);
      // the top ~0.9 m of the flight: where it meets the floor above
      _box.min.y = Math.max(_box.min.y, _box.max.y - 0.9);
      AVOID.rects.push({ ...projectBox(_box, camera, bounds), w: 4 });
    });
  }
  return out.concat(AVOID.rects);
}

type HostMeasure = { left: number; top: number; right: number; bottom: number; width: number; height: number; tape: number };
const hostMeasures = new WeakMap<HTMLElement, HostMeasure>();

/** One read per resize. The frame loop uses the cache and never writes, then reads. */
function watchHost(host: HTMLElement) {
  if (hostMeasures.has(host)) return;
  const read = () => {
    const box = host.getBoundingClientRect();
    const tape = host.ownerDocument.querySelector<HTMLElement>(".room-root .global-tape");
    hostMeasures.set(host, {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
      tape: tape && tape.offsetParent ? tape.getBoundingClientRect().bottom - box.top + 8 : 0,
    });
  };
  read();
  const observer = new ResizeObserver(read);
  observer.observe(host);
}
const PORTRAIT = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "agent";
const PORTRAIT_WHO = PORTRAIT ? (new URLSearchParams(window.location.search).get("who") ?? "").toLowerCase() : "";
const _lens = new Vector3();
const _feet = new Vector3();
const _band = new Vector3();
/** Where a figure waiting at the kettle is drawn (layout units): clear of the stair flight, at the worktop. */
// x: left of the stair flight on a portrait phone; z: far enough forward that the landing above never hides the head;
// yaw: turned to the room, the face-on view then has plain wall behind it (not the utensil rail)
const KETTLE_STAND = { x: kettleSpot.position.x - 0.22, z: 0.56, yaw: -0.3 };
export const SHOULDER = { x: 0.168, y: 0.455 };
const UPPER = 0.215;
const FORE = 0.19;
function figureGeo() {
  if (!FIGURE_GEO.head) {
    const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
    const plaster = PAL.figure;
    const shade = "#E3DDD2";
    FIGURE_GEO.head = headGeo("bare");
    FIGURE_GEO.eyes = paint(merge([at(new SphereGeometry(0.0095, 6, 4), -0.034, 0, 0), at(new SphereGeometry(0.0095, 6, 4), 0.034, 0, 0)]), "#958E85");
    // (legacy single head kept below for reference by headGeo)
    const skull = new SphereGeometry(0.1, 18, 12).scale(0.9, 1.08, 1);
    const jaw = at(new SphereGeometry(0.068, 12, 7).scale(1, 0.85, 1), 0, -0.05, 0.022);
    const brow = at(new SphereGeometry(0.07, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.32, 0.55), 0, 0.022, 0.058);
    const nose = at(new ConeGeometry(0.014, 0.042, 6).rotateX(Math.PI / 2 + 0.35), 0, -0.01, 0.1);
    const ears = [-1, 1].map((sx) => at(new SphereGeometry(0.022, 6, 4).scale(0.45, 1, 0.7), sx * 0.088, -0.005, -0.004));
    const neck = at(new CylinderGeometry(0.036, 0.042, 0.1, 10, 1, true), 0, -0.13, -0.008);
    void skull; void jaw; void brow; void nose; void ears; void neck;
    // torso: a lathed shirt (hips, waist, chest, shoulders) with a collar, a hem band, cap sleeves and two soft folds
    const prof = [
      [0.0, -0.035], [0.12, -0.03], [0.138, 0.0], [0.134, 0.07], [0.124, 0.14], [0.132, 0.22], [0.15, 0.32], [0.158, 0.4],
      [0.146, 0.45], [0.105, 0.49], [0.05, 0.505], [0.0, 0.508],
    ].map(([r, y]) => new Vector2(r, y));
    const body = new LatheGeometry(prof, 18).scale(1, 1, 0.66);
    const collar = at(new TorusGeometry(0.046, 0.011, 4, 14).rotateX(Math.PI / 2).scale(1, 1, 0.9), 0, 0.5, 0.004);
    const hem = at(new TorusGeometry(0.134, 0.007, 3, 18).rotateX(Math.PI / 2).scale(1, 1, 0.66), 0, 0.004, 0);
    const folds = [0.1, 0.165].map((y, i) => at(new TorusGeometry(0.127 + i * 0.002, 0.0045, 3, 12, Math.PI * 0.9).rotateX(Math.PI / 2).rotateY(Math.PI * 0.05 + i * 0.3).scale(1, 1, 0.68), 0, y, 0.003));
    const sleeves = [-1, 1].map((sx) => at(new SphereGeometry(0.046, 10, 6).scale(0.95, 0.85, 0.9), sx * (SHOULDER.x - 0.012), SHOULDER.y - 0.025, 0));
    const placket = at(new BoxGeometry(0.012, 0.09, 0.006), 0, 0.44, 0.1);
    FIGURE_GEO.torso = merge([
      paint(body, "#FFFFFF"), paint(collar, "#C9C2B8"), paint(hem, "#D2CCC2"), ...folds.map((f) => paint(f, "#E4DED6")),
      ...sleeves.map((g) => paint(g, "#F4F1EC")), paint(placket, "#D8D2C8"),
    ]);
    // arm: upper arm in plaster below the cap sleeve; forearm + simple hand (mitten with a thumb) from the elbow
    FIGURE_GEO.arm = paint(merge([at(new CapsuleGeometry(0.036, UPPER - 0.05, 3, 8), 0, -UPPER / 2, 0), at(new SphereGeometry(0.034, 8, 5), 0, -UPPER, 0)]), plaster);
    const fore = at(new CapsuleGeometry(0.031, FORE - 0.05, 3, 8), 0, -FORE / 2, 0);
    // draft 5 hands: a shaped palm, four slightly curled fingers of graded length and an opposed thumb (was a mitten)
    const palm = at(new SphereGeometry(0.03, 9, 6).scale(0.78, 0.95, 0.46), 0, -FORE - 0.022, 0.004);
    const fingers = [-0.0135, -0.0045, 0.0045, 0.0135].map((fx, i) => {
      const len = [0.02, 0.025, 0.024, 0.018][i];
      const f = new CapsuleGeometry(0.0058, len, 2, 6);
      f.translate(0, -len / 2 - 0.004, 0);
      f.rotateX(-0.32); // a relaxed curl towards the palm
      return at(f, fx, -FORE - 0.044, 0.006);
    });
    const knuckles = at(new CapsuleGeometry(0.008, 0.026, 2, 6).rotateZ(Math.PI / 2), 0, -FORE - 0.042, 0.005);
    const thumb = at(new CapsuleGeometry(0.0072, 0.024, 2, 6).rotateZ(0.62).rotateY(-0.5), 0.019, -FORE - 0.02, 0.014);
    FIGURE_GEO.fore = merge([paint(fore, plaster), paint(palm, plaster), paint(knuckles, plaster), ...fingers.map((f) => paint(f, plaster)), paint(thumb, plaster)]);
    // trousers: tapered thigh and shin with a turned-up hem; shoes with a darker sole and a toe cap
    FIGURE_GEO.thigh = paint(merge([new CylinderGeometry(0.064, 0.052, THIGH, 10, 1, true), at(new SphereGeometry(0.064, 10, 5), 0, THIGH / 2, 0)]), PAL.figureShade);
    const shin = new CylinderGeometry(0.05, 0.043, SHIN - 0.02, 10, 1, true);
    const knee = at(new SphereGeometry(0.052, 10, 5), 0, SHIN / 2 - 0.01, 0);
    const turn = at(new CylinderGeometry(0.047, 0.047, 0.022, 10, 1, true), 0, -SHIN / 2 + 0.012, 0);
    FIGURE_GEO.shin = merge([paint(shin, PAL.figureShade), paint(knee, PAL.figureShade), paint(turn, "#CFC7B9")]);
    const upper = at(new CapsuleGeometry(0.036, 0.1, 3, 8).rotateX(Math.PI / 2).scale(1, 0.85, 1), 0, 0.0, 0.0);
    const sole = at(new BoxGeometry(0.075, 0.014, 0.16), 0, -0.03, 0.002);
    const toe = at(new SphereGeometry(0.03, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.8, 1), 0, -0.022, 0.06);
    FIGURE_GEO.foot = merge([paint(upper, "#5E6066"), paint(toe, "#55575C"), paint(sole, "#B9AE9C")]);
  }
  return FIGURE_GEO as Required<typeof FIGURE_GEO>;
}

// shared figure materials: one accent per agent colour, everything else shared by all figures
const FIG_MATS = new Map<string, MeshStandardMaterial>();
function figMat(key: string, make: () => MeshStandardMaterial) {
  let m = FIG_MATS.get(key);
  if (!m) {
    m = make();
    FIG_MATS.set(key, m);
  }
  return m;
}
function figureMats(color: string) {
  return {
    // shirt: brushed cotton (sheen), its collar/hem/fold tones ride in vertex colours
    accent: figMat(`accent|${color}`, () => {
      const tone = shirtTone(color);
      return new MeshPhysicalMaterial({ color: tone, vertexColors: true, roughness: 0.84, sheen: 0.28, sheenRoughness: 0.7, sheenColor: tone.clone().lerp(new Color("#FFFFFF"), 0.35), dithering: true }) as unknown as MeshStandardMaterial;
    }),
    // plaster: a soft, slightly waxy cast (sheen stands in for subsurface) shared by every figure
    figure: figMat("figure", () => new MeshPhysicalMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.66, sheen: 0.35, sheenRoughness: 0.85, sheenColor: new Color("#FFF1E4"), dithering: true }) as unknown as MeshStandardMaterial),
    prop: figMat("prop", () => new MeshStandardMaterial({ color: PAL.linen, roughness: 0.9 })),
    snack: figMat("snack", () => new MeshStandardMaterial({ color: PAL.terracotta, roughness: 0.9 })),
  };
}
/** "Away" ghosting swaps in a translucent twin of the shared material, so it never leaks to other figures. */
const GHOSTS = new Map<Material, Material>();
function ghostOf(m: Material) {
  let g = GHOSTS.get(m);
  if (!g) {
    g = m.clone();
    g.transparent = true;
    g.opacity = 0.28;
    g.depthWrite = false;
    GHOSTS.set(m, g);
  }
  return g;
}

type FigureRig = {
  mesh: SkinnedMesh;
  torso: Bone;
  head: Bone;
  eye: Bone;
  leftArm: Bone;
  rightArm: Bone;
  foreL: Bone;
  foreR: Bone;
  legs: Bone[];
  knees: Bone[];
  shins: Bone[];
  feet: Bone[];
  snack: Mesh;
  book: Mesh;
};

/** One skinned mesh per figure. Vertex colours carry the shirt. Bones keep the walk, blink, and head turn. */
function buildRig(color: string, hair: HairStyle, tilt: number, material: Material, snackMat: Material, bookMat: Material): FigureRig {
  const fig = figureGeo();
  const bones: Bone[] = [];
  const make = (parent: Bone | null, x = 0, y = 0, z = 0) => {
    const next = new Bone();
    next.position.set(x, y, z);
    parent?.add(next);
    bones.push(next);
    return next;
  };
  const root = make(null);
  const torso = make(root);
  const head = make(torso, 0, HEAD_Y, 0.012);
  const tiltBone = make(head);
  tiltBone.rotation.z = tilt * 0.6;
  const eye = make(tiltBone, 0, 0.002, 0.0905);
  eye.scale.set(1, 0.9, 0.45);
  const leftArm = make(torso, -SHOULDER.x, SHOULDER.y - 0.022, 0);
  const foreL = make(leftArm, 0, -UPPER, 0);
  const rightArm = make(torso, SHOULDER.x, SHOULDER.y - 0.022, 0);
  const foreR = make(rightArm, 0, -UPPER, 0);
  const legs: Bone[] = [];
  const knees: Bone[] = [];
  const shins: Bone[] = [];
  const feet: Bone[] = [];
  for (const x of [-0.08, 0.08]) {
    const leg = make(root, x, HIP_PIVOT, 0);
    const knee = make(leg, 0, -THIGH, 0);
    const shin = make(knee);
    const foot = make(knee, 0, -SHIN, 0);
    legs.push(leg);
    knees.push(knee);
    shins.push(shin);
    feet.push(foot);
  }
  root.updateMatrixWorld(true);

  const pieces: BufferGeometry[] = [];
  const add = (geo: BufferGeometry, bone: Bone, x = 0, y = 0, z = 0) => {
    const baked = geo.clone();
    const local = new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(1, 1, 1));
    baked.applyMatrix4(new Matrix4().multiplyMatrices(bone.matrixWorld, local));
    const count = baked.attributes.position.count;
    const index = new Uint16Array(count * 4);
    const weight = new Float32Array(count * 4);
    const which = bones.indexOf(bone);
    for (let i = 0; i < count; i += 1) {
      index[i * 4] = which;
      weight[i * 4] = 1;
    }
    baked.setAttribute("skinIndex", new Uint16BufferAttribute(index, 4));
    baked.setAttribute("skinWeight", new BufferAttribute(weight, 4));
    pieces.push(baked);
  };
  add(torsoFor(color), torso);
  add(headGeo(hair), tiltBone);
  add(fig.eyes, eye);
  add(fig.arm, leftArm);
  add(fig.fore, foreL);
  add(fig.arm, rightArm);
  add(fig.fore, foreR);
  for (let i = 0; i < 2; i += 1) {
    add(fig.thigh, legs[i]!, 0, -THIGH / 2, 0);
    add(fig.shin, shins[i]!, 0, -SHIN / 2, 0);
    add(fig.foot, feet[i]!, 0, -0.012, 0.03);
  }
  const geometry = mergeGeometries(pieces);
  if (!geometry) throw new Error("figure merge produced no geometry");
  for (const piece of pieces) piece.dispose();
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = "figure";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  const snack = new Mesh(new SphereGeometry(0.04, 14, 10), snackMat);
  snack.position.set(0, -FORE - 0.05, 0.04);
  snack.visible = false;
  snack.castShadow = false;
  foreR.add(snack);
  const book = new Mesh(new BoxGeometry(0.14, 0.026, 0.1), bookMat);
  book.position.set(0, -FORE - 0.04, 0.06);
  book.rotation.set(0.4, 0.2, 0);
  book.visible = false;
  book.castShadow = false;
  foreR.add(book);
  return { mesh, torso, head, eye, leftArm, rightArm, foreL, foreR, legs, knees, shins, feet, snack, book };
}

/** One merged figure, for the draw-call gate. Not used by the room. */
export function figureRigForTest(color: string) {
  const mats = figureMats(color);
  return buildRig(color, "bare", 0.2, mats.figure, mats.snack, mats.prop);
}

const BLOBS = new Map<boolean, ShaderMaterial>();
function sharedBlob(night: boolean) {
  let m = BLOBS.get(night);
  if (!m) {
    m = blobMaterial(night);
    BLOBS.set(night, m);
  }
  return m;
}

function blobMaterial(night: boolean) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new Color(night ? "#0E1116" : "#3A4150") }, uOpacity: { value: night ? 0.34 : 0.36 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader:
      "uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.; float a = smoothstep(1.0, 0.0, d); a = a*a; gl_FragColor = vec4(uColor, a*uOpacity); }",
  });
}

function lerpAngle(a: number, b: number, t: number) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export const AgentAvatar = memo(function AgentAvatar({
  agent,
  skew,
  focused = false,
  onSelect,
}: {
  agent: PublicAgent;
  skew: number;
  focused?: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const { night } = useAtmosphere();
  const root = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const stack = useRef<HTMLDivElement>(null);
  const labelRoot = useRef<Root | null>(null);
  const labelPoint = useRef(new Vector3());
  const { camera, size, gl, scene } = useThree();
  const deck = useContext(DeckContext);
  const leftArm = useRef<Object3D>(null);
  const rightArm = useRef<Object3D>(null);
  const foreL = useRef<Object3D>(null);
  const foreR = useRef<Object3D>(null);
  const legs = useRef<(Object3D | null)[]>([]);
  const knees = useRef<(Object3D | null)[]>([]);
  const shins = useRef<(Object3D | null)[]>([]);
  const feetRef = useRef<(Object3D | null)[]>([]);
  const torso = useRef<Object3D>(null);
  const head = useRef<Object3D>(null);
  const eyeL = useRef<Object3D>(null);
  const eyeR = useRef<Object3D>(null);
  const propSnack = useRef<Mesh | null>(null);
  const propBook = useRef<Mesh | null>(null);
  const phase = useRef(0);
  const lastStage = useRef({ x: 0, z: 0 });
  const climb = useRef(stagePose(agent.position.x, agent.position.z).y);
  const smooth = useRef({
    x: agent.position.x,
    y: agent.anchor === "feet" ? agent.position.y + HIPS : agent.position.y,
    z: agent.position.z,
    yaw: agent.yaw,
  });
  const tilt = useMemo(() => tiltOf(agent.id), [agent.id]);

  // one muted accent per agent (torso), plaster for the rest. Per-agent materials so "away" ghosting stays local.
  const mats = useMemo(() => figureMats(agent.color), [agent.color]);
  const rig = useMemo(() => buildRig(agent.color, hairOf(agent.name), tilt, mats.figure, mats.snack, mats.prop), [agent.color, agent.name, tilt, mats]);
  useLayoutEffect(() => {
    torso.current = rig.torso;
    head.current = rig.head;
    eyeL.current = rig.eye;
    eyeR.current = rig.eye;
    leftArm.current = rig.leftArm;
    rightArm.current = rig.rightArm;
    foreL.current = rig.foreL;
    foreR.current = rig.foreR;
    legs.current = rig.legs;
    knees.current = rig.knees;
    shins.current = rig.shins;
    feetRef.current = rig.feet;
    propSnack.current = rig.snack;
    propBook.current = rig.book;
    return () => {
      rig.mesh.geometry.dispose();
      rig.snack.geometry.dispose();
      rig.book.geometry.dispose();
    };
  }, [rig]);
  useLayoutEffect(() => {
    if (propSnack.current) propSnack.current.visible = agent.holding?.kind === "snack";
    if (propBook.current) propBook.current.visible = agent.holding?.kind === "book";
  }, [rig, agent.holding]);
  useEffect(() => () => void FIGURE_RECTS.delete(agent.id), [agent.id]);
  const blob = useMemo(() => sharedBlob(night), [night]);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const now = Date.now() + skew;
    let x = agent.position.x;
    let z = agent.position.z;
    let yaw = agent.yaw;
    let feet = agent.anchor === "feet" && !agent.lie;
    // kettle stand: the shared approach spot sits behind the stair flight, so on a portrait phone the flight crossed
    // in front of whoever waited there. Draw them a step to the left, clear of the flight and of the landing above,
    // turned to face the room while the kettle boils (face readable on the phone, open floor for the hero camera).
    const waiting = !agent.motion && Math.hypot(x - kettleSpot.approach.x, z - kettleSpot.approach.z) < 0.12;
    if (waiting) {
      x = KETTLE_STAND.x;
      z = KETTLE_STAND.z;
      yaw = KETTLE_STAND.yaw;
    }
    if (agent.motion) {
      const at = motionPoint(agent.motion.path, agent.motion.from, agent.motion.to, agent.motion.startedAt, agent.motion.arriveAt, now);
      x = at.x;
      z = at.z;
      // Physicist 1c: on a stair flight plan z runs against stage z, so face the direction of travel.
      yaw = inStairGap(z) ? Math.PI - at.yaw : at.yaw;
      feet = true;
    }
    const y = feet ? HIPS : agent.position.y;
    const s = smooth.current;
    const follow = Math.min(1, delta * (agent.motion ? 7.5 : 11));
    s.x += (x - s.x) * follow;
    s.y += (y - s.y) * follow;
    s.z += (z - s.z) * follow;
    // Physicist 1f: turn at 2.5/s (a 90° turn reads in ~1.2 s instead of snapping).
    s.yaw = lerpAngle(s.yaw, yaw, Math.min(1, delta * 2.5));
    const walking = Boolean(agent.motion) || agent.pose === "walking";
    const talking = Boolean(agent.speech);
    const sitting = !feet && !agent.lie && (agent.pose === "sitting" || agent.pose === "reading" || agent.pose === "eating" || s.y < HIPS - 0.08);
    const staged = stagePose(s.x, s.z);
    // Physicist 1a(c): drive the gait from distance travelled (0.64 m per step) so feet don't skate.
    const travelled = Math.hypot(staged.x - lastStage.current.x, staged.z - lastStage.current.z);
    lastStage.current = { x: staged.x, z: staged.z };
    phase.current += walking ? Math.min(0.6, (travelled / 0.64) * Math.PI) : delta * (talking ? 5 : agent.emote === "dance" ? 8 : 1.6);
    const bob = walking ? Math.abs(Math.sin(phase.current)) * 0.03 : agent.emote === "dance" ? Math.abs(Math.sin(phase.current)) * 0.06 : 0;
    const jump = agent.emote === "jump" ? Math.abs(Math.sin(phase.current * 3)) * 0.24 : 0;
    const stepY = feet ? tread(s.z, staged.y) : staged.y;
    climb.current += (stepY - climb.current) * Math.min(1, delta * 9);
    const lift = climb.current;
    group.position.set(staged.x, s.y + lift + bob + jump, staged.z);
    group.rotation.y = s.yaw;
    if (shadow.current) {
      const fwd = sitting ? 0.06 : 0;
      shadow.current.position.set(staged.x + Math.sin(s.yaw) * fwd, lift + 0.006, staged.z + Math.cos(s.yaw) * fwd);
      shadow.current.visible = !agent.lie;
    }
    if (ring.current) {
      ring.current.position.set(staged.x, lift + 0.008, staged.z);
      ring.current.visible = focused && !agent.lie && !agent.away;
    }
    const label = stack.current;
    const host = gl.domElement.parentElement;
    if (label && host) {
      let visible = true;
      for (let p = group.parent; p; p = p.parent) if (!p.visible) visible = false;
      labelPoint.current.set(staged.x, s.y + lift + (agent.lie ? 0.42 : 0.97), staged.z);
      const projected = labelPoint.current.project(camera);
      const onScreen = visible && group.visible && projected.z >= -1 && projected.z <= 1;
      label.style.visibility = onScreen ? "visible" : "hidden";
      label.classList.toggle("is-seated", sitting);
      if (onScreen) {
        const px = (projected.x * 0.5 + 0.5) * size.width;
        const py = (-projected.y * 0.5 + 0.5) * size.height;
        watchHost(host);
        const measured = hostMeasures.get(host);
        const sw = Number(label.dataset.sw) || 148;
        const sh = Number(label.dataset.sh) || 44;
        const bounds = {
          left: measured?.left ?? 0,
          top: measured?.top ?? 0,
          right: measured?.right ?? size.width,
          bottom: measured?.bottom ?? size.height,
          width: measured?.width ?? size.width,
          height: measured?.height ?? size.height,
        };
        const narrow = bounds.width < 800;
        // this figure's screen rect (head anchor down to the feet), for the speech-note placer
        _feet.set(group.position.x, lift, group.position.z).project(camera);
        const feetY = bounds.top + (-_feet.y * 0.5 + 0.5) * size.height;
        const headY = bounds.top + py;
        const half = Math.max(10, (feetY - headY) * 0.24);
        if (agent.lie || agent.away) FIGURE_RECTS.delete(agent.id);
        else FIGURE_RECTS.set(agent.id, { l: bounds.left + px - half, t: headY, r: bounds.left + px + half, b: feetY });
        const margin = 8;
        // tags and notes stay at least 8 px under the ticker bar in every fit (portrait, landscape, desktop)
        const top = Math.max(narrow ? 46 : 12, measured?.tape ?? 0);
        const bottom = narrow ? deck.bottom : 16;
        const left = bounds.left + px - sw / 2;
        const right = left + sw;
        const tagTop = bounds.top + py - sh;
        const tagBottom = bounds.top + py;
        let dx = 0;
        let dy = 0;
        if (left < bounds.left + margin) dx = bounds.left + margin - left;
        if (right > bounds.right - margin) dx = bounds.right - margin - right;
        if (tagTop < bounds.top + top) dy = bounds.top + top - tagTop;
        if (tagBottom > bounds.bottom - bottom) dy = bounds.bottom - bottom - tagBottom;
        label.style.left = `${px}px`;
        label.style.top = `${py}px`;
        label.style.transform = dx || dy ? `translate(calc(-50% + ${dx}px), calc(-100% + ${dy}px))` : "translate(-50%, -100%)";
        // speech note (draft 5): score a few placements and take the clearest. Order of preference: beside the
        // head on the open side, the other side, a little lower, hanging upwards, above the tag, then pinned to the
        // screen margin. Each candidate is clamped inside the free area and charged for what it would cover: other
        // name tags, any figure (the speaker's too), the TV and the top of each stair flight.
        const bubble = label.querySelector<HTMLElement>(".agent-bubble");
        if (bubble) {
          const tagRect = { left: left + dx, right: right + dx, top: tagTop + dy, bottom: tagBottom + dy };
          const cap = Math.min(bounds.width * (narrow ? 0.6 : 0.34), 300);
          bubble.style.position = "absolute";
          bubble.style.top = "0px";
          bubble.style.bottom = "auto";
          bubble.style.left = "0px";
          bubble.style.right = "auto";
          bubble.style.maxWidth = `${Math.round(cap)}px`;
          bubble.style.width = "max-content";
          bubble.style.transform = "";
          const b0 = bubble.getBoundingClientRect();
          const bw = b0.width;
          const bh = b0.height;
          const obstacles = noteObstacles(host, label, agent.id, scene, camera, bounds as DOMRect);
          const L = tagRect.left;
          const R = tagRect.right;
          const T = tagRect.top;
          const B = tagRect.bottom;
          const gap = 10;
          const openRight = bounds.right - R > L - bounds.left;
          const sideA = openRight ? R + gap : L - gap - bw;
          const sideB = openRight ? L - gap - bw : R + gap;
          const cands: [number, number][] = [
            [sideA, T], [sideB, T], [sideA, B + 8], [sideB, B + 8], [sideA, B - bh], [sideB, B - bh],
            [(L + R) / 2 - bw / 2, T - 8 - bh],
            [bounds.left + margin, T], [bounds.right - margin - bw, T], [bounds.left + margin, B + 8], [bounds.right - margin - bw, B + 8],
            [bounds.left + margin, T - 8 - bh], [bounds.right - margin - bw, T - 8 - bh],
          ];
          const minX = bounds.left + margin;
          const maxX = bounds.right - margin - bw;
          let minY = bounds.top + top;
          let maxY = bounds.bottom - bottom - bh;
          // v19: a note stays inside its speaker's own floor band (ceiling to floor on screen), so on a phone
          // Basil's note can't float over the bed in the room above.
          let floorIdx = 0;
          for (let f = 0; f < FLOORS.length; f += 1) if (lift + 0.2 >= FLOORS[f]!.y) floorIdx = f;
          const floorY = FLOORS[floorIdx]!.y;
          _band.set(group.position.x, floorY + HOUSE.roomH, group.position.z).project(camera);
          const ceilY = bounds.top + (-_band.y * 0.5 + 0.5) * size.height;
          _band.set(group.position.x, floorY, group.position.z).project(camera);
          const groundY = bounds.top + (-_band.y * 0.5 + 0.5) * size.height;
          if (groundY - ceilY >= bh + 4) {
            minY = Math.max(minY, ceilY + 2);
            maxY = Math.min(maxY, groundY - bh - 2);
            if (maxY < minY) maxY = minY;
          }
          let best = { x: cands[0][0], y: cands[0][1], score: Infinity };
          cands.forEach(([cx, cy], k) => {
            const x = Math.max(minX, Math.min(maxX, cx));
            const y = Math.max(minY, Math.min(maxY, cy));
            let score = k * 40 + Math.hypot(x + bw / 2 - (L + R) / 2, y - T) * 0.6;
            // never on the speaker's own tag
            score += overlap(x, y, bw, bh, { l: L - 4, t: T - 4, r: R + 4, b: B + 4 }) * 50;
            for (const o of obstacles) score += overlap(x, y, bw, bh, o) * o.w;
            if (score < best.score) best = { x, y, score };
          });
          bubble.style.transform = `translate(${Math.round(best.x - b0.left)}px, ${Math.round(best.y - b0.top)}px)`;
          // tags always above notes: the speaking figure's stack drops one layer
          label.style.zIndex = "11";
        } else {
          label.style.zIndex = "12";
        }
      }
    }
    const swing = Math.sin(phase.current);
    // natural poses with an elbow: hands rest on the thighs on the sofa, reach forward to type or to the kettle
    const typing = sitting && agent.objectId === "computer";
    const atCounter = !sitting && !walking && !waiting && (/^(kettle|stove|sink|counter)/.test(agent.objectId ?? "") || /kettle|stove|sink|counter|cooking/.test(agent.status ?? ""));
    if (leftArm.current) {
      leftArm.current.rotation.x = walking ? swing * 0.5 : agent.pose === "reading" ? -0.7 : typing ? -0.42 : atCounter ? -0.38 : sitting ? -0.16 : 0.04;
      leftArm.current.rotation.z = sitting ? -0.06 : -0.1;
    }
    if (foreL.current) foreL.current.rotation.x = walking ? -0.25 - Math.max(0, swing) * 0.35 : agent.pose === "reading" ? -1.0 : typing ? -1.1 : atCounter ? -1.15 : sitting ? -0.78 : -0.16;
    if (foreR.current) {
      const waving = agent.emote === "wave" || agent.emote === "cheer";
      foreR.current.rotation.x = waving ? -0.5 : walking ? -0.25 - Math.max(0, -swing) * 0.35 : agent.pose === "eating" || agent.pose === "reading" ? -1.1 : typing ? -1.1 : atCounter ? -1.2 : talking ? -0.7 : sitting ? -0.78 : -0.16;
    }
    if (rightArm.current) {
      const waving = agent.emote === "wave" || agent.emote === "cheer";
      if (waving) {
        rightArm.current.rotation.x = -2.35;
        rightArm.current.rotation.z = 0.3 + Math.sin(phase.current * 2) * 0.25;
      } else if (agent.pose === "eating" || agent.pose === "reading") {
        rightArm.current.rotation.x = -1.15;
        rightArm.current.rotation.z = 0.2;
      } else if (talking && !walking && !typing && !atCounter) {
        rightArm.current.rotation.x = -0.45 + Math.sin(phase.current * 1.5) * 0.1;
        rightArm.current.rotation.z = 0.22;
      } else {
        rightArm.current.rotation.x = walking ? -swing * 0.5 : typing ? -0.42 : atCounter ? -0.4 : sitting ? -0.16 : 0.04;
        rightArm.current.rotation.z = sitting ? 0.06 : 0.1;
      }
    }
    if (torso.current) {
      // subtle idle breathing: the chest rises and widens a touch
      const b = agent.lie ? 0 : Math.sin(phase.current * 1.3) * (walking ? 0.005 : 0.011);
      torso.current.scale.set(1 + b * 0.5, 1 + b, 1 + b * 0.7);
      torso.current.rotation.x = agent.emote === "bow" ? 0.55 : agent.pose === "looking" ? 0.18 : 0;
    }
    if (head.current) {
      head.current.rotation.y = walking || talking ? Math.sin(phase.current * 0.6) * 0.08 : Math.sin(phase.current * 0.35) * 0.22;
      // portrait subject (?view=agent&who=me): the head turns to the lens (clamped to a natural neck turn)
      if (PORTRAIT_WHO && PORTRAIT_WHO === agent.name.toLowerCase()) {
        _lens.copy(camera.position);
        group.worldToLocal(_lens);
        head.current.rotation.y = Math.max(-0.9, Math.min(0.9, Math.atan2(_lens.x, _lens.z)));
      }
      head.current.rotation.x = talking ? -0.08 + Math.sin(phase.current * 5) * 0.06 : agent.pose === "reading" ? 0.25 : 0.06;
    }
    // the face-on portrait (?view=agent) holds the eyes open, so a still never catches a blink
    const blink = agent.pose === "sleeping" ? 0.16 : !PORTRAIT && phase.current % 4.6 > 4.42 ? 0.12 : 1;
    if (eyeL.current) eyeL.current.scale.y = 0.9 * blink;
    if (eyeR.current) eyeR.current.scale.y = 0.9 * blink;
    // legs: one thigh pivot at the hip, a knee, and a shin that stretches on low seats so feet reach the floor
    const hipP = s.y / FIG;
    const reach = Math.min(0.42, Math.max(0.12, hipP + HIP_PIVOT - FOOT));
    const step = walking ? Math.sin(phase.current) * 0.5 : 0;
    for (let i = 0; i < 2; i += 1) {
      const thigh = legs.current[i];
      const knee = knees.current[i];
      const shin = shins.current[i];
      const foot = feetRef.current[i];
      if (!thigh || !knee || !shin || !foot) continue;
      const side = i === 0 ? 1 : -1;
      if (sitting) {
        thigh.rotation.x = -Math.PI / 2 + 0.08;
        knee.rotation.x = Math.PI / 2 - 0.08;
        shin.scale.y = reach / SHIN;
        foot.position.y = -reach;
      } else {
        thigh.rotation.x = side * step;
        knee.rotation.x = walking ? Math.max(0, -side * step) * 0.6 : 0;
        shin.scale.y = 1;
        foot.position.y = -SHIN;
      }
    }
  }, -1);

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const el = document.createElement("div");
    el.className = "agent-stack";
    el.dataset.hudAnchor = agent.id;
    el.style.cssText = "position:absolute;left:0;top:0;z-index:12;pointer-events:none;transform:translate(-50%,-100%)";
    host.appendChild(el);
    stack.current = el;
    const root = createRoot(el);
    labelRoot.current = root;
    const measure = new ResizeObserver(() => {
      el.dataset.sw = String(Math.round(el.offsetWidth));
      el.dataset.sh = String(Math.round(el.offsetHeight));
    });
    measure.observe(el);
    return () => {
      measure.disconnect();
      stack.current = null;
      labelRoot.current = null;
      root.unmount();
      el.remove();
    };
  }, [gl, agent.id]);

  const ghosted = useRef(false);
  useFrame(() => {
    const group = root.current;
    if (!group || (!agent.away && !ghosted.current)) return;
    ghosted.current = agent.away;
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      const material = mesh.material as Material | Material[] | undefined;
      if (!material || Array.isArray(material)) return;
      if (agent.away && !mesh.userData.baseMaterial) {
        mesh.userData.baseMaterial = material;
        mesh.material = ghostOf(material);
      } else if (!agent.away && mesh.userData.baseMaterial) {
        mesh.material = mesh.userData.baseMaterial as Material;
        delete mesh.userData.baseMaterial;
      }
    });
  });

  useLayoutEffect(() => {
    if (stack.current) stack.current.classList.toggle("is-away", agent.away);
    labelRoot.current?.render(
      <>
        {agent.speech ? (
          <div className="agent-bubble">
            <span className="agent-bubble-name">{agent.name}</span>
            <span className="agent-bubble-text">{agent.speech.text}</span>
          </div>
        ) : null}
        {agent.pose === "sleeping" && <div className="agent-zzz">Z Z Z</div>}
      </>,
    );
  });

  return (
    <>
      <mesh name="avatar-blob" ref={shadow} frustumCulled={false} rotation={[-Math.PI / 2, 0, 0]} position={[agent.position.x, 0.006, agent.position.z]} material={blob} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[0.8 * FIG * 1.12, 0.8 * FIG * 1.12]} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[agent.position.x, 0.008, agent.position.z]} renderOrder={3} raycast={() => null} material={ringMat(night)}>
        <ringGeometry args={[0.3, 0.325, 48]} />
      </mesh>
      <group
        ref={root}
        name={`avatar:${agent.id}`}
        userData={{ skipContact: true }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(agent.id);
        }}
      >
        <group scale={FIG} rotation={[agent.lie ? -Math.PI / 2 : 0, 0, 0]}>
          <primitive object={rig.mesh} />
        </group>
      </group>
    </>
  );
});

/** True while a plan z sits between two floor bands (on a stair flight). */
function inStairGap(z: number) {
  for (let i = 0; i < FLOORS.length - 1; i += 1) {
    if (z > FLOORS[i]!.z1 && z < FLOORS[i + 1]!.z0) return true;
  }
  return false;
}

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PAL } from "./config";
import { mutedLinear } from "./color";

/**
 * Maquette kit: one flat PBR material set (no bitmap maps of any kind), bevelled geometry helpers that place
 * boxes by their BOTTOM so nothing floats or sinks, and a static merge that turns a built group into one mesh
 * per material (draw calls on phones).
 */

export type Mats = ReturnType<typeof createMats>;

function std(color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, dithering: true, ...extra });
}

function linen(color: string, side: THREE.Side = THREE.FrontSide) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.98, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color("#ffffff"), dithering: true, side });
}

function createMats(night: boolean) {
  return {
    plaster: std(PAL.plaster, 0.92),
    screed: std(PAL.screed, 0.88),
    birch: std(PAL.birch, 0.8),
    oak: std(PAL.oak, 0.8),
    walnut: std(PAL.walnut, 0.75),
    steel: std(PAL.steel, 0.42, 0.85, { envMapIntensity: night ? 0.25 : 0.6 }),
    brass: std(PAL.brass, 0.38, 0.9, { envMapIntensity: night ? 0.3 : 0.45 }),
    stair: std(PAL.stair, 0.85),
    rail: std(PAL.rail, 0.45, 0.35, { envMapIntensity: night ? 0.2 : 0.35 }),
    terracotta: std(PAL.terracotta, 0.95),
    linen: linen(PAL.linen),
    linenDeep: linen(PAL.linenDeep),
    stone: std("#EEEAE3", 0.82),
    enamel: std("#EFECE6", 0.82),
    foliage: std(PAL.foliage, 0.9),
    graphite: std("#33363B", 0.8),
    /** hairline grooves: plank seams, panel joints, slab laminations (a shade under the screed, never black) */
    seam: std("#A39684", 0.95),
    sinkRim: std("#C9CBCD", 0.42),
    sinkBasin: std("#9A9EA3", 0.5),
    water: new THREE.MeshStandardMaterial({ color: "#CFD8DE", roughness: 0.2, transparent: true, opacity: 0.7, depthWrite: false }),
    steam: new THREE.MeshBasicMaterial({ color: "#F7F5F0", transparent: true, opacity: 0.22, depthWrite: false }),
    fur: std("#DCCDB4", 0.9),
    soil: std("#6F6052", 0.98),
    // window glass: thin, clear and faintly reflective (the studio PMREM gives it a soft sheet of light)
    glass: new THREE.MeshPhysicalMaterial({
      color: night ? "#3A4558" : "#E8EEF4",
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: night ? 0.6 : 1.5,
      transparent: true,
      opacity: night ? 0.68 : 0.4,
      emissive: night ? "#1E2633" : "#DCE5F0",
      emissiveIntensity: night ? 0.4 : 0.12,
      depthWrite: false,
    }),
    screenOn: new THREE.MeshStandardMaterial({ color: "#E6ECF1", roughness: 0.3, emissive: "#DDE6EE", emissiveIntensity: night ? 0.55 : 0.5 }),
    screenOff: std("#2F3338", 0.35, 0.2, { envMapIntensity: 0.4 }),
    screenLine: new THREE.MeshBasicMaterial({ color: "#8C939B" }),
    shadeOn: new THREE.MeshStandardMaterial({ color: "#F4E7D6", roughness: 0.95, emissive: "#FFD9AE", emissiveIntensity: 0.8, side: THREE.DoubleSide }),
    shadeOff: linen(PAL.linen, THREE.DoubleSide),
    hot: new THREE.MeshStandardMaterial({ color: PAL.terracotta, roughness: 0.6, emissive: "#C2603F", emissiveIntensity: 0.6 }),
  };
}

/**
 * Material families. Every flat, opaque surface material belongs to one of three shared "family" materials
 * (matte, fabric, metal) that read their colour from vertex colours. mergeStatic bakes each part's colour into the
 * merged geometry (with a +-2-3% lightness jitter per part), so a whole piece or storey is ONE draw call per family
 * and the scene stays at a handful of shared materials. Unmerged parts keep their individual material.
 */
export type Family = "matte" | "fabric" | "metal";
const FAMILY: Record<string, Family> = {
  plaster: "matte",
  screed: "matte",
  birch: "matte",
  oak: "matte",
  walnut: "matte",
  stair: "matte",
  terracotta: "matte",
  stone: "matte",
  enamel: "matte",
  foliage: "matte",
  graphite: "matte",
  seam: "matte",
  fur: "matte",
  soil: "matte",
  sinkRim: "metal",
  sinkBasin: "metal",
  linen: "fabric",
  linenDeep: "fabric",
  steel: "metal",
  brass: "metal",
  rail: "metal",
};

const familyCache = new Map<string, THREE.Material>();
/**
 * ONE shared "maquette" surface material for every merged static part. Colour comes from vertex colours (tone
 * jitter and baked AO included) and a per-vertex `aSurf` attribute carries roughness / metalness / sheen, so
 * plaster, oak, linen (sheen) and brass (metal, env-lit) all live in a single draw call per piece or storey.
 * The `Family` tag on source materials is kept for bookkeeping only.
 */
export function familyMaterial(_f: Family, night: boolean) {
  const key = `maquette|${night}`;
  let m = familyCache.get(key);
  if (!m) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.86,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color("#ffffff"),
      envMapIntensity: night ? 0.12 : 0.2,
      dithering: true,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aSurf;\nvarying vec3 vSurf;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurf = aSurf;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSurf;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;")
        .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n#ifdef USE_SHEEN\nmaterial.sheenColor *= vSurf.z;\n#endif");
    };
    mat.customProgramCacheKey = () => "maquette-surf";
    mat.userData.familyMaterial = "maquette";
    mat.userData.night = night;
    if (envTexture) mat.envMap = envTexture;
    m = mat;
    familyCache.set(key, m);
  }
  return m;
}

const cache = new Map<boolean, Mats>();
let envTexture: THREE.Texture | null = null;

/** Shared materials for day or night. Every piece in the house uses these, so merged meshes stay few. */
export function mats(night: boolean): Mats {
  let set = cache.get(night);
  if (!set) {
    set = createMats(night);
    for (const [name, mat] of Object.entries(set)) {
      const f = FAMILY[name];
      if (f) {
        (mat as THREE.Material).userData.family = f;
        (mat as THREE.Material).userData.night = night;
      }
    }
    if (envTexture) applyEnv(set, envTexture);
    cache.set(night, set);
  }
  return set;
}

function applyEnv(set: Mats, tex: THREE.Texture) {
  for (const m of [set.steel, set.brass, set.rail, set.screenOff]) {
    m.envMap = tex;
    m.needsUpdate = true;
  }
}

export function currentEnv() {
  return envTexture;
}

/** A PMREM RoomEnvironment for the metals only (steel, brass, rail): a light-probe, not a surface texture. */
export function setEnvTexture(tex: THREE.Texture) {
  envTexture = tex;
  for (const set of cache.values()) applyEnv(set, tex);
  for (const m of familyCache.values()) {
    (m as THREE.MeshStandardMaterial).envMap = tex;
    m.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- geometry (every edge bevelled, cached)
const GC = new Map<string, THREE.BufferGeometry>();

export function rboxGeo(w: number, h: number, d: number, r?: number) {
  const rr = r ?? Math.min(0.03, Math.min(w, h, d) * 0.18);
  const key = `b|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rr.toFixed(4)}`;
  let g = GC.get(key);
  if (!g) {
    // LOD: two bevel segments only on big boxes; small parts get a single-segment bevel (108 vs 300 triangles)
    const segs = Math.max(w, h, d) > 0.45 && rr > 0.012 ? 2 : 1;
    g = new RoundedBoxGeometry(w, h, d, segs, Math.max(0.004, Math.min(rr, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005)));
    g.userData.cached = true;
    GC.set(key, g);
  }
  return g;
}

export type BlkOpts = { r?: number; rx?: number; ry?: number; rz?: number; cast?: boolean; noContact?: boolean };

/** Box placed by its BOTTOM centre. */
export function blk(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, o: BlkOpts = {}) {
  const m = new THREE.Mesh(rboxGeo(w, h, d, o.r), mat);
  m.position.set(x, y + h / 2, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  if (o.noContact) m.userData.noContact = true;
  parent.add(m);
  return m;
}

/** Plain (unbevelled) box placed by its bottom centre: for hairline grooves and seams only, 12 triangles. */
export function bar(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const key = `bar|${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`;
  let g = GC.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    g.userData.cached = true;
    GC.set(key, g);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h / 2, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.noContact = true;
  parent.add(m);
  return m;
}

/** Lathe "rounded cylinder" with chamfered rims, base at y = 0. */
export function rcylGeo(rTop: number, rBot: number, h: number, bevel = 0.01, segIn?: number) {
  const rMax = Math.max(rTop, rBot);
  // LOD: radial segments and bevel steps scale with the radius
  const seg = Math.min(segIn ?? 32, rMax > 0.1 ? 28 : rMax > 0.04 ? 18 : rMax > 0.015 ? 12 : 8);
  const key = `c|${rTop}|${rBot}|${h}|${bevel}|${seg}`;
  let g = GC.get(key);
  if (g) return g;
  const b = Math.max(0.002, Math.min(bevel, h / 3, rTop / 2, rBot / 2));
  const steps = b > 0.008 ? 3 : b > 0.004 ? 2 : 1;
  const pts = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= steps; i += 1) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rBot - b + b * Math.cos(a), b + b * Math.sin(a)));
  }
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop - b + b * Math.cos(a), h - b + b * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(0, h));
  g = new THREE.LatheGeometry(pts, seg);
  g.userData.cached = true;
  GC.set(key, g);
  return g;
}

export type CylOpts = { bevel?: number; seg?: number; rx?: number; rz?: number; cast?: boolean };
export function cyl(parent: THREE.Object3D, mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, o: CylOpts = {}) {
  const m = new THREE.Mesh(rcylGeo(rTop, rBot, h, o.bevel ?? 0.01, o.seg ?? 32), mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function sphereGeo(r: number, ws = 32, hs = 22) {
  const key = `s|${r}|${ws}|${hs}`;
  let g = GC.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, ws, hs);
    g.userData.cached = true;
    GC.set(key, g);
  }
  return g;
}

export function sph(parent: THREE.Object3D, mat: THREE.Material, r: number, x: number, y: number, z: number, s: [number, number, number] = [1, 1, 1], segIn?: [number, number]) {
  const rr = r * Math.max(...s);
  const lod: [number, number] = rr > 0.1 ? [24, 16] : rr > 0.04 ? [16, 12] : [10, 8];
  const seg: [number, number] = segIn ? [Math.min(segIn[0], lod[0]), Math.min(segIn[1], lod[1])] : lod;
  const m = new THREE.Mesh(sphereGeo(r, seg[0], seg[1]), mat);
  m.position.set(x, y, z);
  m.scale.set(...s);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function capsuleGeo(r: number, len: number) {
  const key = `k|${r}|${len}`;
  let g = GC.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, r > 0.02 ? 6 : 3, r > 0.02 ? 16 : 8);
    g.userData.cached = true;
    GC.set(key, g);
  }
  return g;
}

export function cap(parent: THREE.Object3D, mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number } = {}) {
  const m = new THREE.Mesh(capsuleGeo(r, len), mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function torus(parent: THREE.Object3D, mat: THREE.Material, r: number, tube: number, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; arc?: number } = {}) {
  const key = `t|${r}|${tube}|${o.arc ?? 6.2832}`;
  let g = GC.get(key);
  if (!g) {
    const arc = o.arc ?? Math.PI * 2;
    g = new THREE.TorusGeometry(r, tube, tube > 0.008 ? 8 : 6, Math.max(8, Math.round((r > 0.1 ? 32 : 18) * (arc / (Math.PI * 2)))), arc);
    g.userData.cached = true;
    GC.set(key, g);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A plant leaf: lens outline, gently cupped, thickened to two faces (so it reads from both sides). Cached. */
export function leafGeo(len = 0.16, wid = 0.055) {
  const key = `leaf|${len}|${wid}`;
  let g = GC.get(key);
  if (!g) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.quadraticCurveTo(wid, len * 0.35, 0, len);
    sh.quadraticCurveTo(-wid, len * 0.35, 0, 0);
    const front = new THREE.ShapeGeometry(sh, 6);
    const pos = front.attributes.position;
    for (let k = 0; k < pos.count; k += 1) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      // cup across the blade and arch along it
      pos.setZ(k, (x * x) / wid * 0.9 - Math.sin((y / len) * Math.PI) * len * 0.12);
    }
    front.computeVertexNormals();
    const back = front.clone();
    back.scale(1, 1, 1).translate(0, 0, -0.002);
    const idx = back.index!;
    for (let k = 0; k < idx.count; k += 3) {
      const a = idx.getX(k);
      idx.setX(k, idx.getX(k + 2));
      idx.setX(k + 2, a);
    }
    const bn = back.attributes.normal;
    for (let k = 0; k < bn.count; k += 1) bn.setXYZ(k, -bn.getX(k), -bn.getY(k), -bn.getZ(k));
    g = mergeGeometries([front, back])!;
    g.userData.cached = true;
    GC.set(key, g);
  }
  return g;
}

/** Pleated curtain panel: a wavy cross-section extruded to height h, base at y = 0, centred on x. Cached. */
export function pleatGeo(w: number, h: number, depth = 0.03, folds = 5) {
  const key = `pleat|${w}|${h}|${depth}|${folds}`;
  let g = GC.get(key);
  if (!g) {
    const sh = new THREE.Shape();
    const n = folds * 8;
    const amp = depth * 0.42;
    const t = 0.008;
    const zf = (x: number) => Math.sin(((x + w / 2) / w) * folds * Math.PI * 2) * amp;
    sh.moveTo(-w / 2, zf(-w / 2) + t / 2);
    for (let i = 1; i <= n; i += 1) {
      const x = -w / 2 + (i / n) * w;
      sh.lineTo(x, zf(x) + t / 2);
    }
    for (let i = n; i >= 0; i -= 1) {
      const x = -w / 2 + (i / n) * w;
      sh.lineTo(x, zf(x) - t / 2);
    }
    sh.closePath();
    g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 });
    // shape is in x/y with y as depth; extrusion along +z -> rotate so it hangs along +y with folds in z
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    g.userData.cached = true;
    GC.set(key, g);
  }
  return g;
}

/** Give an unmerged geometry the family attributes (colour + aSurf) so it can use the shared maquette material. */
export function familyPaint(g: THREE.BufferGeometry, src: THREE.Material & { color?: THREE.Color; roughness?: number; metalness?: number; sheen?: number }) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const surf = new Float32Array(n * 3);
  const c = src.color ?? new THREE.Color(1, 1, 1);
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const h = Math.max(1e-4, bb.max.y - bb.min.y);
  for (let k = 0; k < n; k += 1) {
    // inner folds a touch darker toward the hem and in the troughs (baked AO)
    const t = (pos.getY(k) - bb.min.y) / h;
    const ao = 1 - 0.12 * (1 - t) * (1 - t) - (pos.getZ(k) < 0 ? 0.06 : 0);
    col[k * 3] = c.r * ao;
    col[k * 3 + 1] = c.g * ao;
    col[k * 3 + 2] = c.b * ao;
    surf[k * 3] = src.roughness ?? 0.9;
    surf[k * 3 + 1] = src.metalness ?? 0;
    surf[k * 3 + 2] = src.sheen ? Math.min(1, src.sheen * 1.6) : 0;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSurf", new THREE.BufferAttribute(surf, 3));
  return g;
}

/** Extruded, bevelled slab from a 2D shape (walls with real openings). */
export function extrude(shape: THREE.Shape, depth: number, mat: THREE.Material, bevel = 0.012) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, bevel);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function rectShape(x0: number, y0: number, x1: number, y1: number, b = 0.012) {
  const s = new THREE.Shape();
  s.moveTo(x0 + b, y0 + b);
  s.lineTo(x1 - b, y0 + b);
  s.lineTo(x1 - b, y1 - b);
  s.lineTo(x0 + b, y1 - b);
  s.closePath();
  return s;
}

export function rectHole(x0: number, y0: number, x1: number, y1: number, b = 0.012) {
  const h = new THREE.Path();
  h.moveTo(x0 - b, y0 - b);
  h.lineTo(x0 - b, y1 + b);
  h.lineTo(x1 + b, y1 + b);
  h.lineTo(x1 + b, y0 - b);
  h.closePath();
  return h;
}

export function plane(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.userData.noContact = true;
  parent.add(m);
  return m;
}

/** Parts smaller than this (largest side, metres) never cast into the shadow map. */
const TINY = 0.16;
/** Layer seen only by the shadow camera (shadow proxies). */
export const SHADOW_LAYER = 5;

// ---------------------------------------------------------------- static merge
/**
 * One mesh per (material, cast, receive) for everything static in `group`. Uvs are dropped (nothing is textured).
 * Meshes flagged `userData.keep`, shader materials, instanced meshes and hidden sub-groups are left alone.
 */
export function mergeStatic(group: THREE.Object3D, opts: { floorY?: number; noCast?: boolean } = { floorY: 0 }) {
  type Bucket = { mat: THREE.Material; family: boolean; cast: boolean; recv: boolean; noContact: boolean; geos: THREE.BufferGeometry[]; shadow: THREE.BufferGeometry[]; partial: boolean };
  // position-only shadow geometry from proxies of already-merged children (a batch of pieces)
  const inShadow: THREE.BufferGeometry[] = [];
  let proxyMat: THREE.Material | null = null;
  const buckets = new Map<string, Bucket>();
  const kill: THREE.Mesh[] = [];
  const keepGroups: THREE.Object3D[] = [];
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const wp = new THREE.Vector3();
  group.traverse((obj) => {
    const o = obj as THREE.Mesh;
    if (obj !== group && !o.isMesh && obj.userData.keep && obj.children.length) {
      let nested = false;
      for (let p = obj.parent; p && p !== group; p = p.parent) if (p.userData.keep) nested = true;
      if (!nested && obj.visible) keepGroups.push(obj);
    }
    if (o.isMesh && o.userData.shadowProxy) {
      for (let p = o.parent; p && p !== group; p = p.parent) if (!p.visible || p.userData.keep) return;
      if (opts.noCast) {
        kill.push(o);
        return;
      }
      const pg = o.geometry.clone();
      rel.multiplyMatrices(inv, o.matrixWorld);
      pg.applyMatrix4(rel);
      inShadow.push(pg);
      proxyMat ??= o.material as THREE.Material;
      kill.push(o);
      return;
    }
    if (!o.isMesh || (o as unknown as THREE.InstancedMesh).isInstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    if ((o.material as THREE.Material & { isShaderMaterial?: boolean }).isShaderMaterial || (o.material as THREE.Material).transparent) return;
    for (let p = o.parent; p && p !== group; p = p.parent) if (!p.visible || p.userData.keep) return;
    const mat = o.material as THREE.Material & { color?: THREE.Color; roughness?: number; metalness?: number; sheen?: number };
    const fam = (mat.userData.family as Family | undefined) ?? (mat.userData.familyMaterial ? ("matte" as Family) : undefined);
    const noContact = Boolean(o.userData.noContact);
    const key = fam ? `F|${mat.userData.night}|${noContact}` : `${mat.uuid}|${o.castShadow}|${o.receiveShadow}|${noContact}`;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal" && n !== "color" && n !== "aSurf") g.deleteAttribute(n);
    rel.multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(rel);
    if (!fam && g.attributes.color && !mat.userData.familyMaterial) g.deleteAttribute("color");
    if (fam && mat.color && !mat.userData.familyMaterial) {
      // per-part tone variation from a hash of the part's position (stable across rebuilds); boards ask for more
      o.getWorldPosition(wp);
      const h = Math.sin(wp.x * 127.1 + wp.y * 311.7 + wp.z * 74.7) * 43758.5453;
      const amp = (o.userData.jitter as number | undefined) ?? (mat.userData.noJitter ? 0 : 0.1);
      const j = 1 + ((h - Math.floor(h)) - 0.5) * amp;
      const n = g.attributes.position.count;
      const pos = g.attributes.position;
      // baked AO: (1) a soft darkening toward the foot of every part (crevices where parts meet: book on shelf,
      // cushion on seat, flute on plinth), (2) contact darkening where furniture meets the floor
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const ph = bb.max.y - bb.min.y;
      const partAO = ph > 0.012 && ph < 1.4 && !noContact ? (o.userData.ao as number | undefined) ?? 0.26 : 0;
      const floorAO = opts.floorY != null && ph > 0.015 && ph < 1.4 && bb.min.y < opts.floorY + 0.1 && bb.min.y > opts.floorY - 0.012 && bb.max.y > opts.floorY + 0.03 && !noContact;
      const col = new Float32Array(n * 3);
      const surf = new Float32Array(n * 3);
      // optional per-part tint (plant leaves: deep older blades, fresher young ones)
      const tint = (o.userData.tint as [number, number, number] | undefined) ?? [1, 1, 1];
      const r = mat.color.r * j * tint[0];
      const gg = mat.color.g * j * tint[1];
      const bl = mat.color.b * j * tint[2];
      const ro = mat.roughness ?? 0.85;
      const me = mat.metalness ?? 0;
      const sh = mat.sheen ? Math.min(1, mat.sheen * 1.6) : 0;
      for (let k = 0; k < n; k += 1) {
        const y = pos.getY(k);
        let ao = 1;
        if (partAO) {
          const t = (y - bb.min.y) / ph;
          ao *= 1 - partAO * (1 - t) * (1 - t);
        }
        if (floorAO) {
          const d = Math.max(0, y - (opts.floorY as number)) / 0.1;
          ao *= 0.45 + 0.55 * Math.min(1, d * d * (3 - 2 * Math.min(1, d)));
        }
        // warm bounce: tall plaster/wall parts pick up the oak floor's colour in their lowest 0.6 m
        let wr = 1;
        let wg = 1;
        let wb = 1;
        if (ph >= 1.4 && opts.floorY != null) {
          const w = Math.max(0, 1 - Math.max(0, y - (opts.floorY as number)) / 0.6);
          const ww = w * w;
          wr = 1 + 0.035 * ww;
          wg = 1 + 0.004 * ww;
          wb = 1 - 0.05 * ww;
        }
        col[k * 3] = r * ao * wr;
        col[k * 3 + 1] = gg * ao * wg;
        col[k * 3 + 2] = bl * ao * wb;
        surf[k * 3] = ro;
        surf[k * 3 + 1] = me;
        surf[k * 3 + 2] = sh;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aSurf", new THREE.BufferAttribute(surf, 3));
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        mat: fam ? familyMaterial(fam, Boolean(mat.userData.night)) : mat,
        family: Boolean(fam),
        // small brass/steel parts add a shadow-pass draw call for a sliver of shadow: they only receive
        cast: o.castShadow,
        recv: o.receiveShadow,
        noContact,
        geos: [],
        shadow: [],
        partial: false,
      };
      buckets.set(key, bucket);
    }
    // shadow budget: tiny props (mugs, books lying flat, remotes, knobs, handles, small decor) and parts flagged
    // `noCast` draw in the main pass but are left out of the shadow map; see the shadow proxy below
    const casts = o.castShadow && !opts.noCast;
    if (casts) bucket.cast = true;
    if (o.receiveShadow) bucket.recv = true;
    bucket.geos.push(g);
    // parts flagged cast:false still went into the shadow map whenever they shared a casting batch (the stair treads,
    // for one), so they keep doing so: the proxy only drops tiny parts and explicit `userData.noCast` ones
    let shadowed = Boolean(o.userData.proxied); // an already-merged child: its own proxy (collected above) covers it
    if (!shadowed && !opts.noCast && !o.userData.noCast) {
      g.computeBoundingBox();
      const sz = g.boundingBox!.getSize(wp);
      if (Math.max(sz.x, sz.y, sz.z) >= TINY) {
        const pg = new THREE.BufferGeometry();
        pg.setAttribute("position", g.attributes.position);
        bucket.shadow.push(pg);
        shadowed = true;
      }
    }
    if (!shadowed) bucket.partial = true;
    kill.push(o);
  });
  for (const o of kill) {
    o.parent?.remove(o);
    if (!o.geometry.userData.cached) o.geometry.dispose();
  }
  // one shadow proxy per piece as soon as any casting part is left out (or a merged child brought its own proxy)
  const useProxy = inShadow.length > 0 || [...buckets.values()].some((b) => b.cast && b.partial);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast && !useProxy;
    m.receiveShadow = b.recv;
    m.userData.merged = true;
    if (b.noContact) m.userData.noContact = true;
    group.add(m);
    // shadow proxy: when some parts are left out of the shadow map, the casting parts get their own position-only
    // mesh on layer SHADOW_LAYER. Only the shadow camera sees that layer, so the main pass keeps ONE draw call per
    // piece while the shadow pass draws fewer triangles. Raycasts and the contact-shadow bakes ignore it too.
    if (b.cast && useProxy) {
      m.userData.proxied = true;
      inShadow.push(...b.shadow);
      proxyMat ??= b.mat;
    }
  }
  if (inShadow.length) {
    const pm = mergeGeometries(inShadow);
    if (pm && proxyMat) {
      const proxy = new THREE.Mesh(pm, proxyMat);
      proxy.name = "shadow-proxy";
      proxy.castShadow = true;
      proxy.receiveShadow = false;
      proxy.layers.set(SHADOW_LAYER);
      proxy.userData.shadowProxy = true;
      proxy.userData.noContact = true;
      proxy.raycast = () => null;
      group.add(proxy);
    }
  }
  // moving parts (doors, the sliding book, flights) merge their own children in their local frame
  for (const k of keepGroups) {
    k.userData.keep = false;
    mergeStatic(k, { noCast: Boolean(k.userData.noCast) || opts.noCast });
    k.userData.keep = true;
  }
  return group;
}

/** Free merged / one-off geometry under `group` (cached primitives and shared materials stay alive). */
export function disposeBuilt(group: THREE.Object3D) {
  group.traverse((obj) => {
    const o = obj as THREE.Mesh;
    if (o.isMesh && !o.geometry.userData.cached) o.geometry.dispose();
  });
}

// ---------------------------------------------------------------- colour
/** Registered agent colour -> one muted accent (OKLCH chroma <= 0.055, L 0.58-0.70), as a three.js colour. */
export function mutedAccent(hex: string) {
  const [r, g, b] = mutedLinear(hex);
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}

export { mutedHex } from "./color";

// ---------------------------------------------------------------- projective transform for HTML on 3D quads
/** 4 point pairs -> 3x3 projective matrix (h33 = 1), returned as the 8 free coefficients. */
export function homography(src: [number, number][], dst: [number, number][]) {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  for (let c = 0; c < 8; c += 1) {
    let p = c;
    for (let r = c + 1; r < 8; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r += 1) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k += 1) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

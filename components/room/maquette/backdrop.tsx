"use client";
/**
 * ROUND 3 DESIGN PROPOSAL (weather-scene-v2): a layered, calm diorama backdrop in the maquette's matte plaster/oak language.
 * near: soft plaster terrain mounds, a low hedge border, stepping stones to the plinth, shrubs and grasses
 * mid: clustered trees of varied size, two low gabled neighbour masses, a lamp post and a bench
 * far: (weather-scene Skyline) a 3-row skyline in value steps with atmospheric fade
 * Hierarchy: every backdrop material fades toward the field and is slightly desaturated with distance from the house,
 * and the corridor straight behind the house is kept empty. Nothing here feeds the camera fit.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const G_Y = -0.366 - 0.26; // = weather-scene GROUND_Y
export const FIELD = new THREE.Color(208 / 255, 205 / 255, 198 / 255); // output-space field color
const noRay = () => null;
const skip = { noContact: true, skipContact: true };

export type Mode = "rain" | "clear";

/**
 * a matte maquette material that is pulled toward the field (in output space, after tone mapping) by distance from the
 * house, plus a small desaturation: the background is always lower in contrast than the building.
 */
export function bgMat(color: string, mode: Mode, o: { near?: number; far?: number; min?: number; max?: number; desat?: number; rough?: number; extra?: THREE.MeshPhysicalMaterialParameters } = {}) {
  const near = o.near ?? 3.5;
  const far = o.far ?? 13;
  const min = (o.min ?? 0.18) + (mode === "rain" ? 0.05 : 0);
  const max = (o.max ?? 0.55) + (mode === "rain" ? 0.12 : 0);
  const desat = o.desat ?? 0.18;
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: o.rough ?? 0.93, metalness: 0, envMapIntensity: 0.2, dithering: true, ...(o.extra ?? {}) });
  m.userData.wantsEnv = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uField = { value: FIELD };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBgW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBgW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBgW; uniform vec3 uField;")
      .replace(
        "#include <dithering_fragment>",
        `{ float dd = length(vBgW.xz - vec2(0.0, 1.0));
           float f = mix(${min.toFixed(3)}, ${max.toFixed(3)}, smoothstep(${near.toFixed(2)}, ${far.toFixed(2)}, dd));
           float l = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
           vec3 c = mix(gl_FragColor.rgb, vec3(l), ${desat.toFixed(3)});
           gl_FragColor.rgb = mix(c, uField, f); }
         #include <dithering_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `bg-${near}-${far}-${min}-${max}-${desat}`;
  return m;
}

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** a soft clustered canopy: 3-5 merged spheres with normals bent toward the cluster centre */
export function crownGeo(seed = 1, lobes = 4) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const base: [number, number, number, number][] = [
    [0, 0.02, 0, 0.46],
    [0.3, -0.04, 0.08, 0.34],
    [-0.29, 0.0, -0.05, 0.35],
    [0.05, 0.3, -0.02, 0.36],
    [-0.04, -0.02, 0.27, 0.31],
  ];
  for (let i = 0; i < lobes; i += 1) {
    const [x, y, z, rad] = base[i];
    // 16×10 keeps the instanced crowns inside the phone triangle budget. The silhouette stays a cluster of lobes.
    const g = new THREE.SphereGeometry(rad * (0.9 + r() * 0.2), 16, 10);
    g.translate(x * (0.9 + r() * 0.25), y, z * (0.9 + r() * 0.25));
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const c = new THREE.Vector3(0, 0.1, 0.04);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).sub(c).normalize();
    n.fromBufferAttribute(nor, i).lerp(v, 0.5).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** soft radial contact darkening on the ground */
export function contactMat(k: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `varying vec2 vP; void main(){ float d = length(vP); gl_FragColor = vec4(0.30,0.29,0.27, ${k.toFixed(3)}*(0.6*exp(-d*d*9.0) + 0.4*(1.0 - smoothstep(0.0, 1.0, d)))); }`,
  });
}

type TreeSpec = { x: number; z: number; s: number; seed: number; lobes?: number };

function BgTree({ t, mode, mats }: { t: TreeSpec; mode: Mode; mats: { canopy: THREE.Material; oak: THREE.Material; disc: THREE.Material } }) {
  const crown = useMemo(() => crownGeo(t.seed, t.lobes ?? 4), [t.seed, t.lobes]);
  const ao = useMemo(() => contactMat(mode === "clear" ? 0.16 : 0.22), [mode]);
  const h = 0.85 * t.s;
  return (
    <group position={[t.x, G_Y, t.z]} userData={skip}>
      <mesh material={mats.disc} position={[0, 0.012 * t.s, 0]} castShadow receiveShadow raycast={noRay}>
        <cylinderGeometry args={[0.17 * t.s, 0.18 * t.s, 0.024 * t.s, 32]} />
      </mesh>
      <mesh material={mats.oak} position={[0, h / 2, 0]} castShadow receiveShadow raycast={noRay}>
        <cylinderGeometry args={[0.018 * t.s, 0.026 * t.s, h, 12]} />
      </mesh>
      <mesh geometry={crown} material={mats.canopy} position={[0, h + 0.36 * t.s, 0]} scale={t.s} castShadow receiveShadow raycast={noRay} />
      <mesh material={ao} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} renderOrder={1} raycast={noRay}>
        <planeGeometry args={[1.3 * t.s, 1.3 * t.s]} />
      </mesh>
    </group>
  );
}

/** desktop + phone layouts: the corridor straight behind the house (|x| < ~3.4 for z < 0) is kept empty */
const TREES_D: TreeSpec[] = [
  { x: -7.7, z: -1.5, s: 0.95, seed: 3, lobes: 5 },
  { x: -9.2, z: -4.6, s: 1.3, seed: 5, lobes: 5 },
  { x: -8.6, z: -2.4, s: 0.8, seed: 9 },
  { x: -6.6, z: 1.1, s: 0.62, seed: 13 },
  { x: 5.6, z: -4.6, s: 1.2, seed: 17, lobes: 5 },
  { x: 7.4, z: -2.8, s: 0.85, seed: 21 },
  { x: 8.6, z: -6.0, s: 1.4, seed: 23, lobes: 5 },
  { x: 4.9, z: 1.9, s: 0.55, seed: 27, lobes: 3 },
];
const TREES_P: TreeSpec[] = [
  { x: 0.05, z: -8.4, s: 1.3, seed: 17, lobes: 5 },
  { x: -0.3, z: -6.6, s: 0.85, seed: 21 },
];

function Neighbour({ x, z, w, d, h, ry, mats }: { x: number; z: number; w: number; d: number; h: number; ry: number; mats: { wall: THREE.Material; roof: THREE.Material } }) {
  const body = useMemo(() => new RoundedBoxGeometry(w, h, d, 2, 0.04), [w, h, d]);
  const roof = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.08, 0);
    s.lineTo(w / 2 + 0.08, 0);
    s.lineTo(0, w * 0.42);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d + 0.16, bevelEnabled: false });
    g.translate(0, 0, -(d + 0.16) / 2);
    return g;
  }, [w, d]);
  return (
    <group position={[x, G_Y, z]} rotation={[0, ry, 0]} userData={skip}>
      <mesh geometry={body} material={mats.wall} position={[0, h / 2, 0]} castShadow receiveShadow raycast={noRay} />
      <mesh geometry={roof} material={mats.roof} position={[0, h, 0]} castShadow receiveShadow raycast={noRay} />
    </group>
  );
}

function Lamp({ x, z, mats }: { x: number; z: number; mats: { oak: THREE.Material; globe: THREE.Material; disc: THREE.Material } }) {
  return (
    <group position={[x, G_Y, z]} userData={skip}>
      <mesh material={mats.disc} position={[0, 0.02, 0]} castShadow receiveShadow raycast={noRay}>
        <cylinderGeometry args={[0.09, 0.1, 0.04, 24]} />
      </mesh>
      <mesh material={mats.oak} position={[0, 0.85, 0]} castShadow raycast={noRay}>
        <cylinderGeometry args={[0.018, 0.024, 1.7, 10]} />
      </mesh>
      <mesh material={mats.globe} position={[0, 1.78, 0]} castShadow raycast={noRay}>
        <sphereGeometry args={[0.1, 24, 16]} />
      </mesh>
    </group>
  );
}

function Bench({ x, z, ry, mats }: { x: number; z: number; ry: number; mats: { oak: THREE.Material; disc: THREE.Material } }) {
  const seat = useMemo(() => new RoundedBoxGeometry(0.9, 0.05, 0.3, 1, 0.012), []);
  const back = useMemo(() => new RoundedBoxGeometry(0.9, 0.18, 0.04, 1, 0.01), []);
  const leg = useMemo(() => new RoundedBoxGeometry(0.06, 0.26, 0.26, 1, 0.01), []);
  return (
    <group position={[x, G_Y, z]} rotation={[0, ry, 0]} userData={skip}>
      <mesh geometry={seat} material={mats.oak} position={[0, 0.28, 0]} castShadow receiveShadow raycast={noRay} />
      <mesh geometry={back} material={mats.oak} position={[0, 0.44, -0.14]} castShadow raycast={noRay} />
      <mesh geometry={leg} material={mats.disc} position={[-0.36, 0.13, 0]} castShadow raycast={noRay} />
      <mesh geometry={leg} material={mats.disc} position={[0.36, 0.13, 0]} castShadow raycast={noRay} />
    </group>
  );
}

/** instanced near-ground details: stepping stones, shrubs, grass tufts, hedge segments */
function Instanced({ geo, mat, items, cast = true }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: [number, number, number, number, number, number?][]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach(([x, y, z, sx, sy, ry = 0], i) => {
      q.setFromEuler(new THREE.Euler(0, ry, 0));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sx));
      m.setMatrixAt(i, m4);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={cast} receiveShadow raycast={noRay} userData={skip} />;
}

export function Backdrop({ mode, phone }: { mode: Mode; phone: boolean }) {
  const rain = mode === "rain";
  const M = useMemo(() => {
    const wet = rain ? { roughness: 0.7 } : {};
    return {
      canopy: bgMat("#ECE7DE", mode, { rough: 0.96, min: 0.24, max: 0.6 }),
      oak: bgMat("#B39A79", mode, { rough: 0.8, desat: 0.25 }),
      disc: bgMat("#F2EEE7", mode),
      terrain: bgMat(rain ? "#D3CFC7" : "#DCD8CF", mode, { min: 0.45, max: 0.8, desat: 0.1, extra: wet }),
      hedge: bgMat("#D8D9CB", mode, { desat: 0.3, rough: 0.97, min: 0.12, max: 0.5 }),
      shrub: bgMat("#DEDFD2", mode, { desat: 0.3, rough: 0.97, min: 0.18, max: 0.55 }),
      grass: bgMat("#D4C7AA", mode, { desat: 0.3, min: 0.1, max: 0.5 }),
      stone: bgMat(rain ? "#D9D5CD" : "#EEEAE2", mode, { min: 0.08, max: 0.4, extra: rain ? { roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.2 } : {} }),
      wall: bgMat("#EFEBE4", mode, { min: 0.3, max: 0.62 }),
      roof: bgMat("#D9CDBB", mode, { min: 0.3, max: 0.62, desat: 0.3 }),
      globe: bgMat("#FBF8F2", mode, { min: 0.1, max: 0.35, extra: { emissive: new THREE.Color("#FFF1DA"), emissiveIntensity: rain ? 0.35 : 0.1 } }),
    };
  }, [mode, rain]);
  const geos = useMemo(() => {
    const stone = new THREE.CylinderGeometry(1, 1, 1, 28);
    const shrub = crownGeo(31, 3);
    const grass = mergeGeometries(
      [-0.05, 0, 0.05, 0.02].map((dx, i) => {
        const c = new THREE.ConeGeometry(0.012, 0.22 + i * 0.03, 5);
        c.rotateZ((dx || 0.03) * 2.2);
        c.translate(dx, (0.22 + i * 0.03) / 2, i === 3 ? 0.04 : 0);
        return c;
      }),
    );
    const hedge = new RoundedBoxGeometry(1, 1, 1, 3, 0.18);
    const mound = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    return { stone, shrub, grass, hedge, mound };
  }, []);
  const lay = useMemo(() => {
    const r = rng(41);
    // terrain mounds: very low, broad, at the sides (none straight behind the house)
    const mounds: [number, number, number, number, number, number?][] = phone
      ? [[-5.4, G_Y - 0.02, -1.2, 2.0, 0.09], [4.0, G_Y - 0.02, 0.6, 1.4, 0.07]]
      : [[-7.2, G_Y - 0.02, -3.8, 3.4, 0.11], [-6.0, G_Y - 0.02, 2.2, 2.4, 0.07], [7.4, G_Y - 0.02, -3.6, 3.2, 0.1], [6.2, G_Y - 0.02, 2.4, 2.2, 0.07]];
    // stepping stones from the plinth's left-front corner out toward the viewer-left
    const stones: [number, number, number, number, number, number?][] = [];
    const path = phone ? [[-3.55, 1.9], [-3.95, 2.5], [-4.2, 3.2]] : [[-3.7, 2.4], [-4.3, 2.95], [-4.75, 3.6], [-5.3, 4.2], [-5.7, 4.95], [-6.2, 5.6]];
    path.forEach(([x, z]) => stones.push([x, G_Y + 0.012, z, 0.17 + r() * 0.05, 0.024, r() * 3]));
    // hedge border: low rounded segments along the left-front and right-front, broken for the path
    const hedges: [number, number, number, number, number, number?][] = [];
    const hedgeLine = (x0: number, z0: number, x1: number, z1: number, n: number) => {
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        const len = Math.hypot(x1 - x0, z1 - z0) / n - 0.06;
        void len;
        hedges.push([x, G_Y + 0.1, z, 0.34, 0.3, i * 1.7]);
      }
    };
    if (phone) hedgeLine(3.35, -1.2, 3.35, 1.2, 6);
    else {
      hedgeLine(-9.5, 1.0, -5.3, 2.6, 12);
      hedgeLine(4.4, 3.4, 8.6, 1.0, 12);
    }
    const shrubs: [number, number, number, number, number, number?][] = [];
    const grass: [number, number, number, number, number, number?][] = [];
    const sprinkle = (cx: number, cz: number, rad: number, ns: number, ng: number) => {
      for (let i = 0; i < ns; i += 1) {
        const a = r() * 6.28;
        const d = rad * Math.sqrt(r());
        const s = 0.22 + r() * 0.22;
        shrubs.push([cx + Math.cos(a) * d, G_Y + s * 0.3, cz + Math.sin(a) * d, s, s * 0.85, r() * 6]);
      }
      for (let i = 0; i < ng; i += 1) {
        const a = r() * 6.28;
        const d = rad * 1.2 * Math.sqrt(r());
        const s = 0.8 + r() * 0.6;
        grass.push([cx + Math.cos(a) * d, G_Y, cz + Math.sin(a) * d, s, s, r() * 6]);
      }
    };
    if (phone) {
      sprinkle(3.7, 0.6, 0.5, 3, 7);
      sprinkle(-3.9, 1.3, 0.45, 2, 6);
      sprinkle(3.9, -4.6, 0.6, 2, 5);
      sprinkle(-4.4, -2.0, 0.5, 2, 5);
    } else {
      sprinkle(-4.4, 1.6, 0.6, 3, 9);
      sprinkle(-7.4, 3.6, 0.9, 4, 10);
      sprinkle(4.2, 2.6, 0.7, 3, 9);
      sprinkle(6.9, -0.6, 0.8, 3, 8);
      sprinkle(-6.4, -1.4, 0.7, 2, 6);
    }
    return { mounds, stones, hedges, shrubs, grass };
  }, [phone]);
  // hedges need length on x and fixed depth on z: build them as individual meshes (few)
  return (
    <group name="backdrop" userData={skip}>
      <Instanced geo={geos.mound} mat={M.terrain} items={lay.mounds.map(([x, y, z, s, h]) => [x, y, z, s, h] as [number, number, number, number, number])} cast={false} />
      <Instanced geo={geos.stone} mat={M.stone} items={lay.stones} />
      <Instanced geo={geos.shrub} mat={M.shrub} items={lay.shrubs} />
      <Instanced geo={geos.grass} mat={M.grass} items={lay.grass} cast={false} />
      <Instanced geo={geos.shrub} mat={M.hedge} items={lay.hedges} />
      {(phone ? TREES_P : TREES_D).map((t, i) => (
        <BgTree key={i} t={t} mode={mode} mats={M} />
      ))}
      {!phone && (
        <>
          <Neighbour x={-11.2} z={-3.0} w={2.2} d={1.8} h={1.25} ry={0.25} mats={M} />
          <Neighbour x={9.8} z={-5.2} w={2.0} d={1.7} h={1.1} ry={-0.3} mats={M} />
          <Lamp x={-4.6} z={2.1} mats={M} />
          <Bench x={5.2} z={0.6} ry={-0.5} mats={M} />
        </>
      )}
      {phone && <Lamp x={3.55} z={-2.0} mats={M} />}
      {rain && <WetGround phone={phone} />}
    </group>
  );
}

/** rain: a broad darker wet film on the ground + glossy puddles (studio-probe reflections) with splash rings */
function WetGround({ phone }: { phone: boolean }) {
  const film = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "varying vec2 vP; void main(){ float d = length(vP); gl_FragColor = vec4(0.36,0.37,0.38, 0.11*(1.0 - smoothstep(3.0, 10.0, d))); }",
      }),
    [],
  );
  const puddle = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: "#B9B8B3", roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25, transparent: true, opacity: 0.8, dithering: true });
    m.userData.wantsEnv = true;
    return m;
  }, []);
  const puddles: [number, number, number, number][] = phone
    ? [[3.75, 1.05, 0.38, 0.22], [-3.75, 2.75, 0.3, 0.17], [4.0, -2.6, 0.42, 0.24]]
    : [[-4.0, 3.3, 0.55, 0.3], [-6.4, 2.9, 0.75, 0.38], [4.4, 1.2, 0.6, 0.32], [6.6, 1.9, 0.5, 0.26], [-5.3, -0.4, 0.5, 0.26]];
  return (
    <group userData={skip}>
      <mesh material={film} rotation={[-Math.PI / 2, 0, 0]} position={[0.1, G_Y + 0.0015, 0.6]} renderOrder={1} raycast={noRay} userData={skip}>
        <circleGeometry args={[10.5, 64]} />
      </mesh>
      {puddles.map(([x, z, a, b], i) => (
        <mesh key={i} material={puddle} rotation={[-Math.PI / 2, 0, i * 0.7]} position={[x, G_Y + 0.004, z]} scale={[a, b, 1]} renderOrder={2} receiveShadow raycast={noRay} userData={skip}>
          <circleGeometry args={[1, 40]} />
        </mesh>
      ))}
      <Rings spots={puddles.flatMap(([x, z, a, b], i) => [[x + a * 0.3, z - b * 0.2, 0.16], [x - a * 0.35, z + b * 0.25, 0.12], ...(i % 2 ? [] : [[x, z, 0.2]])] as [number, number, number][])} y={G_Y + 0.006} />
    </group>
  );
}

/** splash rings: two concentric rings + a bright centre bead, dark enough to read on pale plaster */
export function Rings({ spots, y }: { spots: [number, number, number][]; y: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uT: { value: 0 } },
        vertexShader: `attribute float aPh; varying vec2 vUv; varying float vPh; void main(){ vUv = uv; vPh = aPh; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uT; varying vec2 vUv; varying float vPh;
          void main(){ float k = fract(uT*0.6 + vPh); float r = length(vUv*2.0-1.0);
            float R1 = 0.2 + 0.75*k; float R2 = R1*0.55;
            float ring = (1.0 - smoothstep(0.0, 0.07, abs(r - R1))) + 0.6*(1.0 - smoothstep(0.0, 0.06, abs(r - R2)));
            float fade = 0.35 + 0.65*(1.0 - k);
            float bead = (1.0 - smoothstep(0.0, 0.12, r)) * (1.0 - smoothstep(0.0, 0.25, k));
            vec3 col = mix(vec3(0.42,0.45,0.49), vec3(1.0), bead);
            gl_FragColor = vec4(col, min(1.0, ring*fade*0.8 + bead*0.9)); }`,
      }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const ph = new Float32Array(spots.length);
    const r = rng(77);
    spots.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * 2, s * 2, s * 2));
      m.setMatrixAt(i, m4);
      ph[i] = r();
    });
    m.geometry.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 1));
    m.instanceMatrix.needsUpdate = true;
  }, [spots, y]);
  useFrame(({ clock }) => {
    mat.uniforms.uT.value = clock.elapsedTime;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, spots.length]} frustumCulled={false} renderOrder={3} raycast={noRay} userData={skip}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

/**
 * screen-space sky: drawn at the far plane after opaque geometry, so it only tints pixels where nothing else is (the
 * open field above the ground). clear = a touch of warm light near the top; rain = a soft cool mist band low down.
 * plus a very subtle corner falloff on that same open field (never over the building).
 */
export function SkyWash({ mode }: { mode: Mode }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        vertexShader: "varying vec2 vS; void main(){ vS = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }",
        fragmentShader:
          mode === "clear"
            ? `varying vec2 vS; void main(){ float t = smoothstep(0.15, 1.0, vS.y); vec2 q = vS*vec2(0.8,1.0); float vig = smoothstep(0.85, 1.6, length(q));
                 vec4 warm = vec4(0.985, 0.90, 0.78, 0.30*t*t); vec4 dk = vec4(0.62,0.60,0.56, 0.10*vig);
                 gl_FragColor = vec4(mix(warm.rgb, dk.rgb, dk.a/(warm.a+dk.a+1e-4)), warm.a + dk.a); }`
            : `varying vec2 vS; void main(){ float band = exp(-pow((vS.y + 0.05)/0.42, 2.0)); vec2 q = vS*vec2(0.8,1.0); float vig = smoothstep(0.85, 1.6, length(q));
                 vec4 mist = vec4(0.90,0.91,0.92, 0.22*band); vec4 dk = vec4(0.58,0.59,0.60, 0.12*vig);
                 gl_FragColor = vec4(mix(mist.rgb, dk.rgb, dk.a/(mist.a+dk.a+1e-4)), mist.a + dk.a); }`,
      }),
    [mode],
  );
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-6} raycast={noRay} userData={skip}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

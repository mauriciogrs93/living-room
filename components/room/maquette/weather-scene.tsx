"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import * as THREE from "three";
import { GEO } from "./config";
import { FRONT } from "./shell";
import { currentEnv } from "./kit";
import { Backdrop, Rings, SkyWash, bgMat, contactMat, crownGeo, G_Y } from "./backdrop";

export type WeatherScene = "rain" | "clear";

let houseRain = false;
const skyListeners = new Set<() => void>();

/** The house sky (same /api/sky report the HUD already shows). Clear until that report says rain. */
export function noteHouseSky(rain: boolean) {
  if (houseRain === rain) return;
  houseRain = rain;
  skyListeners.forEach((fn) => fn());
}

export function subscribeHouseSky(fn: () => void) {
  skyListeners.add(fn);
  return () => {
    skyListeners.delete(fn);
  };
}

export function weatherScene(): WeatherScene | null {
  return houseRain ? "rain" : "clear";
}

export const GROUND_Y = -0.366 - 0.26;
export const PAPER = "#E2DDD4";
/** Skyline foot, just above the field so the rows sit on the horizon beside the house. */
export const SKY_BASE = 0.15;

const noRay = () => null;
const skip = { noContact: true, skipContact: true };

type PlinthBox = { x0: number; x1: number; z0: number; z1: number; top: number; h: number; w: number; d: number; cx: number; cz: number };

export function plinthFor(_phone: boolean): PlinthBox {
  const { wallOutX, wallOutZ, edgeR } = GEO;
  const w = edgeR - wallOutX + 0.5;
  const d = FRONT - wallOutZ + 0.5;
  const h = 0.2;
  const cx = (edgeR + wallOutX) / 2;
  const cz = (FRONT + wallOutZ) / 2;
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, top: -0.06, h, w, d, cx, cz };
}

function Plinth({ rain, clear, phone }: { rain: boolean; clear: boolean; phone: boolean }) {
  const P = plinthFor(phone);
  const { w, d, cx, cz } = P;
  const baseAo = useMemo(() => contactMat(clear ? 0.18 : 0.26), [clear]);
  return (
    <group userData={skip}>
      <mesh material={baseAo} rotation={[-Math.PI / 2, 0, 0]} position={[cx + (clear ? 0.08 : 0), P.top - P.h + 0.002, cz - (clear ? 0.32 : 0)]} renderOrder={0} raycast={noRay} userData={skip}>
        <planeGeometry args={[w + 1.4, d + 1.4]} />
      </mesh>
      {rain && (
        <Rings
          y={P.top + 0.004}
          spots={(phone
            ? [[P.x0 + 0.3, P.z1 - 0.12], [P.x0 + 0.45, P.z0 + 1.2], [P.x1 - 0.3, P.z1 - 0.12], [P.x1 - 0.35, P.z0 + 0.9], [P.x0 + 0.35, P.z0 + 2.6]]
            : [[P.x0 + 0.3, P.z1 - 0.3], [P.x0 + 1.2, P.z1 - 0.22], [P.x0 + 2.6, P.z1 - 0.3], [P.x1 - 0.5, P.z1 - 0.25], [P.x1 - 1.8, P.z1 - 0.3], [P.x1 - 0.32, P.z0 + 1.0], [P.x1 - 0.3, P.z0 + 2.4], [P.x0 + 0.35, P.z0 + 1.6], [P.x0 + 0.3, P.z0 + 3.0]]
          ).map(([x, z], i) => [x, z, phone ? 0.11 : 0.15 + (i % 3) * 0.03] as [number, number, number])}
        />
      )}
    </group>
  );
}

function ShadowGround({ clear }: { clear?: boolean }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: clear ? "#3A342C" : "#2E3338",
      transparent: true,
      opacity: clear ? 0.28 : 0.2,
      depthWrite: false,
      toneMapped: false,
      fog: true,
    });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGp;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGp = position.xy;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vGp;")
        .replace("#include <fog_fragment>", "#include <fog_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(6.5, 11.0, length(vGp));");
    };
    return m;
  }, [clear]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, GROUND_Y + 0.001, 0.4]} material={mat} receiveShadow renderOrder={1} raycast={noRay} userData={skip}>
      <circleGeometry args={[11.5, 96]} />
    </mesh>
  );
}

/** low crisp skyline: flat-roofed plaster massing with a few window slits, ~8% off the field, fading only at the foot */
function Skyline({ mist = 0 }: { mist?: number }) {
  const { geo, mat } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const add = (g: THREE.BufferGeometry, slit: number, rowK: number) => {
      const ng = g.index ? g.toNonIndexed() : g;
      ng.setAttribute("aLayer", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(slit), 1));
      ng.setAttribute("aRow", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(rowK), 1));
      parts.push(ng);
    };
    const ROWS: [number, number, number, number][] = [
      // z, base drop, height scale, row value (1 = full contrast)
      [-40, 0, 1.0, 1.0],
      [-54, 1.2, 1.25, 0.62],
      [-70, 2.6, 1.5, 0.36],
    ];
    for (const [z, drop, hs, rowK] of ROWS) {
    let x = -78;
    while (x < 78) {
      const w = 2.5 + rnd() * 5;
      // the left group sits nearer the camera's sightline and reads taller: cap it
      const h = (2.0 + rnd() * 1.6) * hs * (x < -10 ? 0.72 : 1);
      const d = 3 + rnd() * 3;
      const zz = z - rnd() * 6;
      const b = new THREE.BoxGeometry(w, h, d);
      b.translate(x + w / 2, SKY_BASE - drop + h / 2, zz);
      add(b, 0, rowK);
      // a few window slits on the camera-facing fronts (thin dark recess strips)
      if (rnd() > 0.35) {
        const rows = 1 + Math.floor(rnd() * 2);
        for (let r = 0; r < rows; r += 1) {
          const sl = new THREE.BoxGeometry(w * (0.45 + rnd() * 0.3), 0.12, 0.05);
          sl.translate(x + w / 2, SKY_BASE - drop + h - 0.6 - r * 0.6, zz + d / 2 + 0.02);
          add(sl, 1, rowK);
        }
      }
      x += w + 0.6 + rnd() * 3.2;
    }
    }
    const merged = mergeGeos(parts);
    // unlit, not tone-mapped: lit faces +8% over the field, shaded faces -6%, slits -11%; fades only at the foot
    const m = new THREE.ShaderMaterial({
      uniforms: { uPaper: { value: new THREE.Color(PAPER) }, uBase: { value: SKY_BASE }, uMist: { value: mist }, uSun: { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() } },
      vertexShader: `attribute float aLayer; attribute float aRow; varying float vRow; varying float vSlit; varying float vWy; varying vec3 vN;
        void main(){ vSlit = aLayer; vRow = aRow; vN = normalize(normal); vec4 w = modelMatrix*vec4(position,1.0); vWy = w.y; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uPaper; uniform float uBase; uniform float uMist; uniform vec3 uSun; varying float vRow; varying float vSlit; varying float vWy; varying vec3 vN;
        void main(){ vec3 n = normalize(vN); float l = dot(n, uSun);
          float k = n.y > 0.5 ? 1.10 : (l > 0.2 ? 1.08 : 0.92);
          k = mix(k, 0.86, vSlit);
          float foot = smoothstep(-3.0, -1.6, vWy - uBase); // atmospheric fade only at the foot
          float rk = vRow * (1.0 - uMist * (1.15 - vRow));
          gl_FragColor = linearToOutputTexel(vec4(uPaper * mix(1.0, k, foot * rk), 1.0)); }`,
    });
    return { geo: merged, mat: m };
  }, [mist]);
  return <mesh geometry={geo} material={mat} renderOrder={-2} raycast={noRay} userData={skip} />;
}

function mergeGeos(list: THREE.BufferGeometry[]) {
  const n = list.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const lay = new Float32Array(n);
  const row = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    lay.set(g.attributes.aLayer.array as Float32Array, o);
    row.set(g.attributes.aRow.array as Float32Array, o);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("aLayer", new THREE.BufferAttribute(lay, 1));
  out.setAttribute("aRow", new THREE.BufferAttribute(row, 1));
  return out;
}

function Tree({ x, z, s, mode }: { x: number; z: number; s: number; mode: WeatherScene }) {
  const crown = useMemo(() => crownGeo(Math.round(Math.abs(x * 10 + z) + 3), s > 0.7 ? 5 : 4), [x, z, s]);
  const mats = useMemo(
    () => ({
      canopy: bgMat("#ECE7DE", mode, { rough: 0.96, min: 0.24, max: 0.6 }),
      oak: bgMat("#B39A79", mode, { rough: 0.8, desat: 0.25 }),
    }),
    [mode],
  );
  const h = 0.9 * s;
  return (
    <group position={[x, G_Y, z]} userData={skip}>
      <mesh material={mats.oak} position={[0, h / 2, 0]} castShadow receiveShadow raycast={noRay} userData={skip}>
        <cylinderGeometry args={[0.02 * s, 0.03 * s, h, 8]} />
      </mesh>
      <mesh geometry={crown} material={mats.canopy} position={[0, h + 0.34 * s, 0]} scale={s} castShadow receiveShadow raycast={noRay} userData={skip} />
    </group>
  );
}

/** One instanced sheet of drops. The shader scrolls them, so the shadow map stays put. */
function Rain({ phone }: { phone: boolean }) {
  const n = phone ? 64 : 110;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uT: { value: 0 } },
        vertexShader: `attribute float aPh; uniform float uT;
          void main(){
            vec3 p = position;
            float fall = fract(uT * 0.28 + aPh);
            p.y = mix(0.15, 7.2, 1.0 - fall);
            gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `void main(){ gl_FragColor = vec4(0.62, 0.66, 0.70, 0.28); }`,
      }),
    [],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m4 = new THREE.Matrix4();
    const ph = new Float32Array(n);
    let seed = 19;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i += 1) {
      const x = (rnd() - 0.5) * (phone ? 9 : 16);
      const z = (rnd() - 0.5) * (phone ? 8 : 14);
      m4.makeTranslation(x, G_Y, z);
      mesh.setMatrixAt(i, m4);
      ph[i] = rnd();
    }
    mesh.geometry.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 1));
    mesh.instanceMatrix.needsUpdate = true;
  }, [n, phone]);
  useFrame(({ clock }) => {
    mat.uniforms.uT.value = clock.elapsedTime;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, n]} frustumCulled={false} renderOrder={4} raycast={noRay} userData={skip}>
      <boxGeometry args={[0.012, 0.16, 0.012]} />
    </instancedMesh>
  );
}

const PHONE_TREE: [number, number] = [-4.9, -1.0];

function SceneBody({ mode, phone }: { mode: WeatherScene; phone: boolean }) {
  const root = useRef<THREE.Group>(null);
  const envApplied = useRef(false);
  useLayoutEffect(() => {
    envApplied.current = false;
  }, [mode]);
  useFrame(() => {
    if (envApplied.current) return;
    const env = currentEnv();
    const group = root.current;
    if (!env || !group) return;
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of list) {
        if (!material?.userData?.wantsEnv) continue;
        (material as THREE.MeshStandardMaterial).envMap = env;
        material.needsUpdate = true;
      }
    });
    envApplied.current = true;
  });
  const ts = phone ? 1 : 0.85; // desktop trees ~15% smaller
  return (
    <group ref={root} name="weather-scene" userData={skip}>
      <SkyWash mode={mode} />
      {!phone && <Skyline mist={mode === "rain" ? 0.55 : 0} />}
      <Backdrop mode={mode} phone={phone} />
      {mode === "clear" && <ShadowGround clear />}
      <Plinth rain={mode === "rain"} clear={mode === "clear"} phone={phone} />
      {phone ? <Tree x={PHONE_TREE[0]} z={PHONE_TREE[1]} s={0.74} mode={mode} /> : <Tree x={-4.3} z={0.9} s={1.0 * ts} mode={mode} />}
      {!phone && <Tree x={3.35} z={-1.75} s={0.8 * ts} mode={mode} />}
      {mode === "rain" && <Rain phone={phone} />}
    </group>
  );
}

/** Diorama behind the house. It is not part of the camera fit. */
export function HouseWeather({ phone }: { phone: boolean }) {
  const mode = useSyncExternalStore(subscribeHouseSky, () => weatherScene() ?? "clear", () => "clear" as const);
  return <SceneBody mode={mode} phone={phone} />;
}

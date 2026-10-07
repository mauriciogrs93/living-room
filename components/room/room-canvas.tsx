"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { LiveSnapshot } from "@/components/use-room";
import { useAtmosphere } from "./atmosphere";
import { AgentAvatar } from "./avatar";
import { NameTagLayer } from "./name-tag-layer";
import { Furniture, HouseDog, HouseMaterials, RoomShell, SceneLiveProvider } from "./furniture";
import { STATIC_KINDS, StaticFurniture } from "./furniture-pieces";
import { DoorMesh, type DoorMeshProps } from "./maquette/door-mesh";
import { MinimalHud, floorOfY, minimalHud } from "./maquette/minimal-hud";
import { HouseFallback, RoomStageBoundary } from "./house-fallback";
import { ComputerOverlay, ComputerProvider } from "./computer-desk";
import { lineupCount as lineupAsked } from "@/lib/room/lineup";
import { FLOORS, HOUSE, stagePose } from "@/lib/room/layout";
import { HudAnchors } from "@/components/hud/anchors-bridge";
import { DeckContext, FidgetNote, FidgetProvider } from "./interact";
import { tightDevice } from "./furniture-kit";
import { SHADOW_LAYER } from "./maquette/kit";
import { GEO, MAQUETTE } from "./maquette/config";
import { FRONT } from "./maquette/shell";

/**
 * The house as a photographed architectural model: FOV 28 perspective from ~34 deg yaw / 30 deg pitch, framed into
 * the screen area the HUD leaves free, warm key + cool fill, soft PCF shadows and baked contact shadows.
 */

type FloorName = "kitchen" | "living" | "bedroom";
const FLOOR_INDEX: Record<FloorName, number> = { kitchen: 0, living: 1, bedroom: 2 };

function floorParam(): FloorName | null {
  if (typeof window === "undefined") return null;
  const floor = new URLSearchParams(window.location.search).get("floor");
  return floor === "kitchen" || floor === "living" || floor === "bedroom" ? floor : null;
}

/** Short landscape phones: the FIG. 1 caption moves to a left column, vertically centred, beside the house. */
const LANDSCAPE_CSS = `@media (orientation: landscape) and (max-height: 500px) {
  .room-root .sheet-caption { top: 50% !important; bottom: auto !important; transform: translateY(-50%); max-width: 190px; }
}`;

/** Design-only figure line-up (?debug=1&lineup=1|4|10). Production builds cannot turn it on. */
let LINEUP_BOX: THREE.Box3 | null = null;
function lineupCount() {
  if (typeof window === "undefined") return 0;
  return lineupAsked(window.location.search);
}
function lineupFlag() {
  return lineupCount() > 0;
}
function lineupAgents(agents: LiveSnapshot["agents"]): LiveSnapshot["agents"] {
  const count = lineupCount();
  const f = FLOORS[0];
  // clear kitchen floor between the counter run (z -0.72) and the table/chair (z >= 0.55), left of the stair foot
  const z = 0.12;
  const xs = [-0.2, 0.35, 0.86];
  const yaws = [0.1, -0.06, 0.24];
  const box = new THREE.Box3();
  const out = agents.slice(0, count).map((a, i) => {
    const x = count === 3 ? xs[i]! : -1.15 + (i * 2.3) / Math.max(1, count - 1);
    const yaw = count === 3 ? yaws[i]! : 0.08;
    const w = stagePose(x, z);
    void f;
    box.expandByPoint(new THREE.Vector3(w.x - 0.3, w.y, w.z - 0.25));
    box.expandByPoint(new THREE.Vector3(w.x + 0.3, w.y + 1.72, w.z + 0.25));
    return { ...a, position: { x, y: f.y, z }, yaw, anchor: "feet" as const, pose: "idle" as const, status: "", motion: null, speech: null, lie: false, away: false, emote: null, objectId: null, holding: null } as (typeof agents)[number];
  });
  LINEUP_BOX = box;
  return out;
}

function viewBox(floor: FloorName | null) {
  if (LINEUP_BOX) return LINEUP_BOX.clone();
  if (floor) {
    const y = FLOORS[FLOOR_INDEX[floor]].y;
    return new THREE.Box3(new THREE.Vector3(GEO.wallOutX - 0.1, y - 0.32, GEO.wallOutZ - 0.1), new THREE.Vector3(GEO.edgeR + 0.1, y + HOUSE.roomH, FRONT + 0.1));
  }
  return new THREE.Box3(new THREE.Vector3(GEO.wallOutX - 0.1, -0.36, GEO.wallOutZ - 0.1), new THREE.Vector3(GEO.edgeR + 0.1, FLOORS[2].y + HOUSE.roomH, FRONT + 0.1));
}

/** Safe-area insets (notch, home indicator) in CSS px, read from env() through a probe element. */
let safeProbe: HTMLDivElement | null = null;
function safeInsets() {
  if (!safeProbe) {
    safeProbe = document.createElement("div");
    safeProbe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(safeProbe);
  }
  const cs = getComputedStyle(safeProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}

/**
 * The rectangle of the canvas the HUD leaves free (CSS px), measured from the live DOM every refit: the TONIGHT strip
 * (or the open Tonight sheet), the "N HERE" button, the room card, plus safe-area insets. Works for any viewport.
 */
function freeRect(W: number, H: number) {
  if (typeof document !== "undefined" && document.documentElement.dataset.hudFrame === "1") {
    return { x: 4, y: 4, w: Math.max(160, W - 8), h: Math.max(160, H - 8) };
  }
  const phone = W < 800;
  const safe = safeInsets();
  const rect = (sel: string) => {
    const r = document.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    return r && r.height > 0 && r.width > 0 ? r : null;
  };
  const card = rect(".mini-sheet") ?? rect(".hud-card");
  const tonight = rect(".global-tape-card");
  const tape = rect(".global-tape-line");
  const fab = rect(".mini-pill") ?? rect(".hud-fab");
  // headroom above the model for name tags / a speech note, so the house never jumps when someone talks
  const tagRoom = phone ? (H < 700 ? 26 : 34) : 28;
  const tapeBottom = Math.max(tape ? tape.bottom : phone ? 31 : 30, safe.t);
  if (phone) {
    const top = (tonight ? Math.round(tonight.bottom) + 10 : Math.round(tapeBottom)) + tagRoom;
    const fabTop = fab ? Math.round(fab.top) : H - 58 - safe.b;
    let bottom = Math.max(H - fabTop + 8, 24 + safe.b);
    if (card) bottom = Math.max(bottom, H - Math.round(card.top) + 12);
    const side = 8;
    const x = side + safe.l;
    return { x, y: top, w: W - x - side - safe.r, h: Math.max(160, H - top - bottom) };
  }
  const right = (card ? Math.max(32, W - Math.round(card.left) + 24) : 32) + safe.r;
  let left = (tonight && tonight.bottom > H * 0.5 ? Math.round(tonight.right) + 24 : 32) + safe.l;
  // short landscape: the drawing caption sits in its own left column (see LANDSCAPE_CSS) and the house takes the rest
  const caption = H < 500 ? rect(".sheet-caption") : null;
  if (caption) left = Math.max(left, Math.round(caption.right) + 16);
  // short landscape phones: the "N HERE" button sits bottom-right; keep the model clear of it and of the strip
  const top = Math.round(tapeBottom) + (H < 500 ? 8 : tagRoom);
  const bottom = H < 500 ? Math.max(10, safe.b + 8) : Math.max(20, safe.b + 12);
  return { x: left, y: top, w: W - left - right, h: H - top - bottom };
}

/** Real silhouette points of the full model (plinth, wall tops, slab edges): a tighter fit than the bounding box. */
function hullPoints(): THREE.Vector3[] {
  const { wallOutX, wallInX, wallOutZ, wallInZ, edgeR, cut } = GEO;
  const topY = FLOORS[2].y + HOUSE.roomH;
  const pts: THREE.Vector3[] = [];
  for (const x of [wallOutX - 0.25, edgeR + 0.25]) for (const z of [wallOutZ - 0.25, FRONT + 0.25]) for (const y of [-0.36, -0.06]) pts.push(new THREE.Vector3(x, y, z));
  pts.push(new THREE.Vector3(wallOutX, topY, wallOutZ), new THREE.Vector3(edgeR, topY, wallOutZ), new THREE.Vector3(edgeR, topY, wallInZ));
  pts.push(new THREE.Vector3(wallOutX, topY, FRONT), new THREE.Vector3(wallInX, topY, FRONT));
  for (const f of FLOORS) pts.push(new THREE.Vector3(cut, f.y, FRONT), new THREE.Vector3(edgeR, f.y, wallInZ + 0.42));
  // the top flight's handrail and a standing figure's head on the top floor
  pts.push(new THREE.Vector3(1.9, FLOORS[2].y + 1.0, FRONT), new THREE.Vector3(cut, FLOORS[2].y + 1.3, FRONT));
  return pts;
}

const _dir = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * Draft 7 camera options (?cam=a|b|c|d|e). v20 default = e. The single-floor tap-in camera keeps the old angle (fitCamera).
 * fov: lens (smaller = longer lens, flatter perspective); yaw/pitch in degrees; level: keep verticals straight
 * (two-point perspective: the camera looks level and the frame is lens-shifted); fill: share of the free area
 * the house may use (smaller = more air around it); ground: soft ground plane under the plinth.
 */
type CamPreset = { fov: number; yawD: number; yawP: number; pitch: number; level: boolean; fill: number; ground: boolean };
const CAMS: Record<string, CamPreset> = {
  a: { fov: 15, yawD: 27, yawP: 25, pitch: 20, level: false, fill: 0.94, ground: false },
  b: { fov: 18, yawD: 11, yawP: 9, pitch: 14, level: false, fill: 0.95, ground: false },
  c: { fov: 24, yawD: 30, yawP: 28, pitch: 9, level: true, fill: 0.93, ground: false },
  d: { fov: 16, yawD: 24, yawP: 22, pitch: 16, level: true, fill: 0.8, ground: true },
  // e = recommended hybrid: C's eye-level plumb camera standing on D's ground plane, a touch more air than C
  e: { fov: 22, yawD: 29, yawP: 27, pitch: 11, level: true, fill: 0.89, ground: true },
};
/** v20: angle E is the default whole-house view. ?cam=a|b|c|d|e still picks a preset; ?cam=v19 shows the old near-isometric view. */
export const DEFAULT_CAM = "e";
export function camPreset(): CamPreset | null {
  const key = typeof window === "undefined" ? DEFAULT_CAM : (new URLSearchParams(window.location.search).get("cam") ?? DEFAULT_CAM);
  if (key === "v19") return null;
  return CAMS[key] ?? CAMS[DEFAULT_CAM];
}

function fitCamera(camera: THREE.PerspectiveCamera, W: number, H: number, floor: FloorName | null) {
  const phone = W < 800;
  const cam = floor ? null : camPreset();
  const yaw = THREE.MathUtils.degToRad(cam ? (phone ? cam.yawP : cam.yawD) : phone ? MAQUETTE.yawPhone : MAQUETTE.yawDesktop);
  // short landscape phones: a slightly lower eye flattens the plinth's depth so the tall house can use the full height
  const short = W > H && H < 500;
  const pitch = THREE.MathUtils.degToRad((cam ? cam.pitch : MAQUETTE.pitch) - (short ? 7 : 0));
  const aimLevel = (at: THREE.Vector3) => (cam?.level ? camera.lookAt(at.x, camera.position.y, at.z) : camera.lookAt(at));
  const box = viewBox(floor);
  box.getCenter(_c);
  const r = freeRect(W, H);
  camera.fov = cam ? cam.fov : MAQUETTE.fov;
  camera.near = 0.5;
  camera.far = 120;
  camera.up.set(0, 1, 0);
  camera.aspect = r.w / r.h;
  _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const pts: THREE.Vector3[] = floor ? [] : hullPoints();
  if (floor) for (let i = 0; i < 8; i += 1) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  let dist = 30;
  const shift = new THREE.Vector2();
  for (let it = 0; it < 8; it += 1) {
    camera.position.copy(_c).addScaledVector(_dir, dist);
    aimLevel(_c);
    camera.clearViewOffset();
    camera.aspect = r.w / r.h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let mnx = 9;
    let mxx = -9;
    let mny = 9;
    let mxy = -9;
    for (const p of pts) {
      _q.copy(p).project(camera);
      mnx = Math.min(mnx, _q.x);
      mxx = Math.max(mxx, _q.x);
      mny = Math.min(mny, _q.y);
      mxy = Math.max(mxy, _q.y);
    }
    // portrait phone, one floor framed: zoom in for real; the room may crop ~13% each side (the outer wall faces and
    // the stair shaft), so the floor fills the width instead of sitting small in a width-bound frame
    const cropX = floor && W < 800 && !LINEUP_BOX ? 0.62 : 1;
    const need = Math.max(((mxx - mnx) / 2) * cropX, (mxy - mny) / 2);
    shift.set((mxx + mnx) / 2, (mxy + mny) / 2);
    dist *= need / (floor ? 0.995 : cam ? cam.fill : 0.988);
  }
  camera.position.copy(_c).addScaledVector(_dir, dist);
  aimLevel(_c);
  camera.updateMatrixWorld();
  const ox = -r.x + (shift.x * r.w) / 2;
  let oy = -r.y - (shift.y * r.h) / 2;
  camera.setViewOffset(r.w, r.h, ox, oy, W, H);
  camera.updateProjectionMatrix();
  // phones, one floor framed (tap a room / follow someone): the floors below stay in view, so centre the visible stack
  // (framed floor + everything under it) in the free area instead of leaving the space above the floor empty
  // portrait phone, one floor: pin that floor's wall tops just under the top bar; the floors below fill the rest
  if (floor && W < 800 && !LINEUP_BOX) {
    const tops = pts.map((p) => {
      _q.copy(p).project(camera);
      return ((1 - _q.y) / 2) * H;
    });
    const d = r.y + 6 - Math.min(...tops);
    if (Math.abs(d) > 1) {
      oy -= d;
      camera.setViewOffset(r.w, r.h, ox, oy, W, H);
      camera.updateProjectionMatrix();
    }
    // the ground floor has nothing under it: centre it (walls + plinth) in the free area instead of leaving the
    // bottom half of the screen empty
    if (box.min.y < 0.5) {
      const ground = [...pts];
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) ground.push(new THREE.Vector3(x, -0.36, z));
      const ys = ground.map((p) => {
        _q.copy(p).project(camera);
        return ((1 - _q.y) / 2) * H;
      });
      const c = r.y + r.h / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
      if (c > 1) {
        oy -= c;
        camera.setViewOffset(r.w, r.h, ox, oy, W, H);
        camera.updateProjectionMatrix();
      }
    }
  }
  if (floor && W < 800 && false) {
    const stack = [...pts];
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) stack.push(new THREE.Vector3(x, -0.36, z));
    const ys = stack.map((p) => {
      _q.copy(p).project(camera);
      return ((1 - _q.y) / 2) * H;
    });
    const top = Math.min(...ys);
    const bot = Math.max(...ys);
    const d = Math.max(r.y + r.h / 2 - (top + bot) / 2, r.y - top);
    if (Math.abs(d) > 1) {
      oy -= d;
      camera.setViewOffset(r.w, r.h, ox, oy, W, H);
      camera.updateProjectionMatrix();
    }
  }
  // phones, full view: the model is usually width-bound, so balance the leftover height: slide it down until the gap
  // under the plinth matches the gap above the walls, as long as no plinth point lands on the "N HERE" button
  if (!floor && W < 800 && document.documentElement.dataset.hudFrame !== "1") {
    const visible = (sel: string) => {
      const b = document.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
      return b && b.height > 0 && b.width > 0 ? b : null;
    };
    const fab = visible(".mini-pill") ?? visible(".hud-fab");
    const sheet = visible(".mini-sheet") ?? visible(".hud-card");
    const tape = document.querySelector<HTMLElement>(".global-tape-line")?.getBoundingClientRect();
    const safe = safeInsets();
    const px = pts.map((p) => {
      _q.copy(p).project(camera);
      return { x: ((_q.x + 1) / 2) * W, y: ((1 - _q.y) / 2) * H };
    });
    const top = Math.min(...px.map((p) => p.y));
    const bot = Math.max(...px.map((p) => p.y));
    const gapTop = top - Math.max(tape ? tape.bottom : 31, safe.t);
    // an open sheet/card is a hard floor: the model never slides under it
    const floorY = sheet ? Math.min(H - safe.b - 12, sheet.top - 12) : H - safe.b - 12;
    let room = floorY - bot;
    if (fab && fab.height > 0) for (const p of px) if (p.x > fab.left - 10 && p.x < fab.right + 10) room = Math.min(room, fab.top - 10 - p.y);
    const gapBottom = floorY - bot;
    const s = Math.max(0, Math.min(room, (gapBottom - gapTop) / 2));
    if (s > 1) {
      oy -= s;
      camera.setViewOffset(r.w, r.h, ox, oy, W, H);
      camera.updateProjectionMatrix();
    }
  }
  return dist;
}

function LabelSpacing() {
  const gl = useThree((state) => state.gl);
  const deck = useContext(DeckContext);
  const tick = useRef(0);
  useFrame(() => {
    tick.current += 1;
    if (tick.current % 3 !== 0) return;
    const host = gl.domElement.parentElement;
    if (!host) return;
    const nodes = [...host.querySelectorAll<HTMLElement>(".agent-stack")].filter((el) => el.style.visibility !== "hidden");
    if (!nodes.length) return;
    const bounds = host.getBoundingClientRect();
    const narrow = bounds.width < 800;
    const bottomLimit = bounds.bottom - (narrow ? Math.max(deck.bottom, 72) : 18);
    const topLimit = bounds.top + (narrow ? 46 : 8);
    const items = nodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, left: rect.left, top: rect.top, w: rect.width, h: rect.height, dx: 0, dy: 0 };
      })
      .sort((a, b) => a.top - b.top);
    const gap = 6;
    for (let i = 1; i < items.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const above = items[j];
        const below = items[i];
        const ax1 = above.left + above.dx;
        const ay2 = above.top + above.dy + above.h;
        const bx1 = below.left + below.dx;
        const by1 = below.top + below.dy;
        const overlapX = Math.min(ax1 + above.w, bx1 + below.w) - Math.max(ax1, bx1);
        if (overlapX > 4 && by1 < ay2 + gap) {
          const shift = overlapX + 12;
          const roomRight = bounds.right - 8 - (below.left + below.dx + below.w);
          if (roomRight >= shift) below.dx += shift;
          else above.dx -= shift;
        }
      }
    }
    for (const item of items) {
      const left = item.left + item.dx;
      const top = item.top + item.dy;
      if (left < bounds.left + 8) item.dx += bounds.left + 8 - left;
      const right = item.left + item.dx + item.w;
      if (right > bounds.right - 8) item.dx -= right - (bounds.right - 8);
      if (top < topLimit) item.dy += topLimit - top;
      const bottom = item.top + item.dy + item.h;
      if (bottom > bottomLimit) item.dy -= bottom - bottomLimit;
    }
    for (const item of items) {
      if (item.dx === 0 && item.dy === 0) continue;
      const top = Number.parseFloat(item.el.style.top) || 0;
      const left = Number.parseFloat(item.el.style.left) || 0;
      item.el.style.top = `${top + item.dy}px`;
      item.el.style.left = `${left + item.dx}px`;
    }
  });
  return null;
}

function pixelBudget() {
  const tight = tightDevice();
  const phone = window.innerWidth < 800;
  return {
    // v19: phones are capped at 2x (3x shaded 2.25x the pixels); AdaptiveDpr walks it down when the frame rate drops
    dpr: Math.min(window.devicePixelRatio || 1, tight ? 1.5 : phone ? 2 : 2),
    // the shadow map is static (rendered only when something moves), so phones can afford a sharper, softer map
    shadow: tight ? 1536 : 2048,
  };
}

/**
 * Adaptive pixel ratio: every 2 s of rendered frames, drop 0.5x (to a floor of 1) when the average frame rate falls
 * under 40 fps, and step back up by 0.25x after a sustained 58+ fps. Off under ?debug=1 so the render harness
 * (software GL, ~3 fps) keeps the fixed cap it measures.
 */
function AdaptiveDpr({ max }: { max: number }) {
  const setDpr = useThree((state) => state.setDpr);
  const acc = useRef({ t: 0, n: 0, dpr: max, good: 0 });
  useFrame((_, delta) => {
    if (debugFlag()) return;
    const a = acc.current;
    a.t += delta;
    a.n += 1;
    if (a.t < 2) return;
    const fps = a.n / a.t;
    a.t = 0;
    a.n = 0;
    if (fps < 40 && a.dpr > 1) {
      a.dpr = Math.max(1, a.dpr - 0.5);
      a.good = 0;
      setDpr(a.dpr);
    } else if (fps > 58 && a.dpr < max) {
      a.good += 1;
      if (a.good >= 3) {
        a.dpr = Math.min(max, a.dpr + 0.25);
        a.good = 0;
        setDpr(a.dpr);
      }
    }
  });
  return null;
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) || canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Perf probe for the design budget (draw calls, triangles, materials). Exposes window.__glStats; read-only, no UI.
 * gl.info is read in useFrame, i.e. the numbers of the previous rendered frame (shadow passes included).
 */
/** Design preview of the v16 door without door data: ?debug=1&door=locked|knocking|open. */
function doorPreview(): DoorMeshProps | null {
  if (!debugFlag()) return null;
  const d = new URLSearchParams(window.location.search).get("door");
  if (d === "locked") return { locked: true, knocking: false, open: false };
  if (d === "knocking") return { locked: true, knocking: true, open: false };
  if (d === "open") return { locked: false, knocking: false, open: true };
  return null;
}

/** Strip the HUD-only knock count before handing the door to the mesh. */
function doorMeshProps(door: DoorMeshProps & { knocks?: number }): DoorMeshProps {
  return { locked: door.locked, knocking: door.knocking, open: door.open, onTap: door.onTap };
}

/** Perf hooks (window.__glStats / __glDump) only with ?debug=1. */
function debugFlag() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
}

/**
 * Static shadow map: the sun never moves and figures don't cast (they keep their blob shadows), so the shadow map is
 * rendered once and only re-rendered when a caster's transform, geometry or visibility changes (a door swings, a
 * piece is rebuilt, a floor lifts off) or day/night flips. Idle frames skip the whole shadow pass.
 */
function ShadowCache({ night }: { night: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const last = useRef("");
  const refreshes = useRef(0);
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useEffect(() => {
    last.current = "";
  }, [night]);
  useFrame(() => {
    let a = 0;
    let b = 0;
    let n = 0;
    scene.traverseVisible((o) => {
      const caster = (o as THREE.Mesh).isMesh && o.castShadow;
      const light = (o as THREE.DirectionalLight).isDirectionalLight && o.castShadow;
      if (!caster && !light) return;
      const e = o.matrixWorld.elements;
      n += 1;
      a += (e[0] + e[5] * 3 + e[10] * 5 + e[4] * 7 + e[8] * 11 + e[12] * 13 + e[13] * 17 + e[14] * 19) * ((n % 7) + 1);
      b += caster ? (o as THREE.Mesh).geometry.id * n : o.id;
    });
    const sig = `${n}|${a.toFixed(4)}|${b}`;
    if (sig !== last.current) {
      last.current = sig;
      gl.shadowMap.needsUpdate = true;
      refreshes.current += 1;
      (window as unknown as { __shadowRefreshes?: number }).__shadowRefreshes = refreshes.current;
    }
  });
  return null;
}

function GlStats() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const n = useRef(0);
  useEffect(() => {
    (window as unknown as { __forceShadow?: () => void }).__forceShadow = () => {
      gl.shadowMap.needsUpdate = true;
    };
    (window as unknown as { __glDump?: () => unknown }).__glDump = () => {
      const rows: Array<Record<string, unknown>> = [];
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const chain: string[] = [];
        let p: THREE.Object3D | null = m;
        while (p && chain.length < 14) { chain.push(p.name || p.type); p = p.parent; }
        const g = m.geometry;
        const tris = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        rows.push({ path: chain.join("<"), cast: m.castShadow, inst: (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 0, tris: Math.round(tris), mat: mat.type + ":" + (mat.name || mat.uuid.slice(0, 4)) });
      });
      return rows;
    };
    return () => {
      delete (window as unknown as { __forceShadow?: () => void }).__forceShadow;
    };
  }, [scene, gl]);
  useFrame(() => {
    n.current += 1;
    const w = window as unknown as { __glStats?: Record<string, number> };
    const info = gl.info;
    const prev = w.__glStats ?? {};
    let materials = prev.materials ?? 0;
    let meshes = prev.meshes ?? 0;
    if (n.current % 10 === 0 || n.current === 1) {
      const set = new Set<string>();
      let count = 0;
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        count += 1;
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => set.add(mat.uuid));
      });
      materials = set.size;
      meshes = count;
    }
    w.__glStats = {
      calls: info.render.calls,
      shadowRefreshes: (window as unknown as { __shadowRefreshes?: number }).__shadowRefreshes ?? -1,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      materials,
      meshes,
      frame: n.current,
    };
  });
  return null;
}

function GlWatch({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    onLostRef.current = onLost;
  }, [onLost]);
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    const lost = (event: Event) => {
      event.preventDefault();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onLostRef.current(), 700);
    };
    const restored = () => window.clearTimeout(timer);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl]);
  return null;
}

/**
 * Draft 6 light grade: one palette per time of day (morning, midday, golden hour, evening, night), dimmed and
 * cooled by the weather. Lower exposure and fill than draft 5 so the key light and its shadows do the modelling,
 * plus a toned paper behind the house so the white shell no longer melts into the page.
 */
export type Grade = { exposure: number; sun: string; sunI: number; sky: string; ground: string; hemiI: number; fill: string; fillI: number; paper: string | null; fog: string | null; shadowR: number; drift: number };
export function lightGrade(hour: number, sky: string, night: boolean): Grade {
  let g: Grade;
  if (night) g = { exposure: 0.9, sun: "#AFC0DD", sunI: 0.45 / Math.PI, sky: "#6F7F9C", ground: "#5A4A3C", hemiI: 0.36, fill: "#6A7A96", fillI: 0.09, paper: "#D0CDC6", fog: null, shadowR: 6, drift: 0 };
  else if (hour < 10) g = { exposure: 0.86, sun: "#FFE3C4", sunI: 1.5, sky: "#D3DEEE", ground: "#B9AE9F", hemiI: 0.25, fill: "#D6E0F0", fillI: 0.16, paper: "#E3E2DE", fog: null, shadowR: 4.5, drift: 0 };
  else if (hour < 16) g = { exposure: 0.84, sun: "#FFEEDA", sunI: 1.8, sky: "#D9E2F0", ground: "#BFB3A2", hemiI: 0.24, fill: "#DCE4F2", fillI: 0.15, paper: "#E2DDD4", fog: null, shadowR: 4, drift: 0 };
  else if (hour < 19) g = { exposure: 0.86, sun: "#FFB676", sunI: 1.6, sky: "#E2CDB8", ground: "#A98F75", hemiI: 0.2, fill: "#C9B9C9", fillI: 0.12, paper: "#E4D7C6", fog: null, shadowR: 4.5, drift: 0 };
  else g = { exposure: 0.9, sun: "#B9A6C8", sunI: 0.75, sky: "#7F8AAB", ground: "#5E5047", hemiI: 0.34, fill: "#8E9AB8", fillI: 0.12, paper: "#CFCFD3", fog: null, shadowR: 5.5, drift: 0 };
  if (night) return g;
  const cool = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  if (sky === "clouds") g = { ...g, sun: cool(g.sun, "#E9ECEF", 0.6), sunI: g.sunI * 0.5, hemiI: g.hemiI * 1.35, sky: cool(g.sky, "#D9DCDF", 0.6), shadowR: 9, drift: 0.28, paper: g.paper && cool(g.paper, "#D9D9D7", 0.5), exposure: g.exposure - 0.02 };
  if (sky === "rain") g = { ...g, sun: cool(g.sun, "#C9D3E0", 0.75), sunI: g.sunI * 0.32, hemiI: g.hemiI * 1.3, sky: cool(g.sky, "#AEB8C6", 0.7), ground: cool(g.ground, "#8E8E8C", 0.5), fill: "#B8C4D4", shadowR: 11, drift: 0.12, paper: g.paper && cool(g.paper, "#C9CDD2", 0.75), exposure: g.exposure - 0.04 };
  if (sky === "fog") g = { ...g, sun: cool(g.sun, "#F0F0EE", 0.7), sunI: g.sunI * 0.35, hemiI: g.hemiI * 1.55, sky: "#E6E6E3", shadowR: 12, paper: g.paper && cool(g.paper, "#DEDDDA", 0.8), fog: g.paper && cool(g.paper, "#E4E3E0", 0.85) };
  if (sky === "snow") g = { ...g, sun: cool(g.sun, "#EEF2F7", 0.7), sunI: g.sunI * 0.45, hemiI: g.hemiI * 1.45, sky: "#E8EDF3", shadowR: 10, paper: g.paper && cool(g.paper, "#E6E9ED", 0.7) };
  if (!night && g.paper) g = { ...g, paper: "#D0CDC6" };
  return g;
}

/**
 * Draft 7 option D: a soft ground the plinth stands on, fading into the paper (one draw call, unlit MeshBasicMaterial; no sun-shadow receive, the contact shadow grounds it).
 * Keep receiveShadow OFF: with it on, the stair throws a striped, detached shadow across the ground (Designer, v20).
 */
function GroundPlane({ grade }: { grade: Grade }) {
  const mat = useMemo(() => {
    // v20 (Designer BLOCK fix): unlit, so the amber golden-hour key can't paint an orange disc. toneMapped off so the
    // ground is the page paper itself (the clear colour is not tone-mapped either), just 5% darker, at every hour/weather.
    const m = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, toneMapped: false });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGp;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGp = position.xy;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vGp;")
        .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(2.4, 8.0, length(vGp));");
    };
    return m;
  }, []);
  useEffect(() => {
    mat.color.set(grade.paper ?? "#2B2D31").offsetHSL(0, -0.02, grade.paper ? -0.05 : 0.03);
  }, [mat, grade.paper]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, -0.362, 0.6]} material={mat} renderOrder={-1} raycast={() => null} userData={{ noContact: true, skipContact: true }}>
      <circleGeometry args={[11, 48]} />
    </mesh>
  );
}

/** Compile house shaders while the main thread is idle, so the first name-tag tap does not pay that cost. */
function WarmHouse() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let idle = 0;
    let timer = 0;
    const run = () => {
      gl.compile(scene, camera);
    };
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 800 });
    else timer = window.setTimeout(run, 400);
    return () => {
      if (idle) window.cancelIdleCallback(idle);
      if (timer) window.clearTimeout(timer);
    };
  }, [gl, scene, camera]);
  return null;
}

function Picture({ grade }: { grade: Grade }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = grade.exposure;
    if (grade.paper) gl.setClearColor(new THREE.Color(grade.paper), 1);
    else gl.setClearColor(0x000000, 0);
    // fog: a depth haze from the front of the house to the back wall (no draw calls)
    if (grade.fog) {
      const d = camera.position.distanceTo(new THREE.Vector3(0, 3.6, 0.9));
      scene.fog = new THREE.Fog(new THREE.Color(grade.fog), d - 2, d + 22);
    } else scene.fog = null;
  }, [gl, scene, camera, grade]);
  return null;
}

/** Warm low key ~39 deg left of the camera axis, cool shadowless fill from the camera side, sky/ground hemisphere. */
function LightRig({ night, phone, mapSize, grade }: { night: boolean; phone: boolean; mapSize: number; grade: Grade }) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((state) => state.scene);
  const target = useMemo(() => new THREE.Object3D(), []);
  const cp = camPreset();
  const camYaw = cp ? (phone ? cp.yawP : cp.yawD) : phone ? MAQUETTE.yawPhone : MAQUETTE.yawDesktop;
  const az = THREE.MathUtils.degToRad(MAQUETTE.sunLeadDeg - camYaw);
  const el = THREE.MathUtils.degToRad(MAQUETTE.sunElevationDeg);
  target.position.set(0, 3.6, 0.9);
  const pos: [number, number, number] = [
    target.position.x - Math.sin(az) * Math.cos(el) * 20,
    target.position.y + Math.sin(el) * 20,
    target.position.z + Math.cos(az) * Math.cos(el) * 20,
  ];
  useLayoutEffect(() => {
    scene.add(target);
    if (sun.current) sun.current.target = target;
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);
  useLayoutEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.shadow.radius = grade.shadowR;
    light.shadow.blurSamples = 16;
    light.shadow.needsUpdate = true;
  }, [night, grade.shadowR]);
  // passing clouds: the key light breathes slowly (a cloud crossing the sun); intensity only, so no shadow redraw
  useFrame(({ clock }) => {
    const light = sun.current;
    if (!light || !grade.drift) return;
    const t = clock.elapsedTime;
    const c = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3);
    light.intensity = grade.sunI * Math.PI * (1 - grade.drift * c);
  });
  // the shadow camera also sees the shadow proxies (casting parts only; tiny props stay out of the map)
  useEffect(() => {
    sun.current?.shadow.camera.layers.enable(SHADOW_LAYER);
  });
  const L = Math.PI; // spec intensities are legacy units (three r155+ dropped the implicit x PI)
  return (
    <>
      <directionalLight
        ref={sun}
        position={pos}
        color={grade.sun}
        intensity={grade.sunI * L}
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-near={5}
        shadow-camera-far={40}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <hemisphereLight ref={hemi} args={[grade.sky, grade.ground, grade.hemiI * L]} />
      <directionalLight position={[12, 7, 18]} color={grade.fill} intensity={grade.fillI * L} />
    </>
  );
}

/** ?view=agent[&who=name]: a face-on hero close-up of one agent, from the clearest side (raycast against the house). */
function heroTarget() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  return q.get("view") === "agent" ? (q.get("who") ?? "").toLowerCase() : null;
}
const _ray = new THREE.Raycaster();
const _hd = new THREE.Vector3();
function HeroCamera({ who, agents }: { who: string; agents: LiveSnapshot["agents"] }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const pick = useRef<{ angle: number; at: number }>({ angle: 0, at: -1 });
  const head = useMemo(() => new THREE.Vector3(), []);
  const eye = useMemo(() => new THREE.Vector3(), []);
  const n = useRef(0);
  const key = useRef<THREE.DirectionalLight>(null);
  const sunlit = useRef(false);
  const gl = useThree((state) => state.gl);
  const yawS = useRef<number | null>(null);
  useFrame(() => {
    const agent = agents.find((a) => a.name.toLowerCase() === who || a.id.toLowerCase() === who) ?? agents[0];
    if (!agent) return;
    const group = scene.getObjectByName(`avatar:${agent.id}`);
    if (!group) return;
    (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;
    // figure: hip at the group origin; head centre ~0.635 * figureScale above it
    head.set(group.position.x, group.position.y + 0.635 * MAQUETTE.figureScale, group.position.z);
    // face-on: aim along the BODY's facing (draft 5: in a portrait the subject's head turns to the lens, see
    // avatar.tsx PORTRAIT_WHO), smoothed
    const h = group.getObjectByName("head");
    let target = group.rotation.y;
    if (h) {
      h.getWorldPosition(head);
      group.getWorldDirection(_hd);
      target = Math.atan2(_hd.x, _hd.z);
    }
    if (yawS.current === null) yawS.current = target;
    yawS.current += Math.atan2(Math.sin(target - yawS.current), Math.cos(target - yawS.current)) * 0.05;
    const yaw = yawS.current;
    const dist = 1.85;
    n.current += 1;
    if (pick.current.at < 0 || n.current % 45 === 0) {
      const blockers: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        let p: THREE.Object3D | null = m;
        while (p) {
          if (p.name.startsWith("avatar")) return;
          p = p.parent;
        }
        const mat = m.material as THREE.Material;
        if (mat && (mat as THREE.Material).transparent) return;
        blockers.push(m);
      });
      // the view must be clear for the face AND the chest/hands (a monitor below the eye line blocks the frame too)
      const clear = (angle: number) =>
        [0, -0.2, -0.38].every((dy) => {
          const from = head.clone().add(new THREE.Vector3(0, dy, 0));
          const to = new THREE.Vector3(head.x + Math.sin(yaw + angle) * dist, head.y + 0.1, head.z + Math.cos(yaw + angle) * dist);
          const dir = to.clone().sub(from);
          const len = dir.length();
          _ray.set(from.addScaledVector(dir.normalize(), 0.12), dir);
          _ray.far = len - 0.12;
          return !_ray.intersectObjects(blockers, false).length;
        });
      for (const angle of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1.0, -1.0, 1.3, -1.3]) {
        if (clear(angle)) {
          pick.current = { angle, at: n.current };
          break;
        }
      }
      if (pick.current.at < 0) pick.current = { angle: 0, at: n.current };
      // draft 5: is the subject standing in direct sun? (a ray from the chest towards the sun clears the house)
      let sun: THREE.DirectionalLight | null = null;
      scene.traverse((o) => {
        if ((o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) sun = o as THREE.DirectionalLight;
      });
      if (sun) {
        const from = head.clone().add(new THREE.Vector3(0, -0.2, 0));
        const dir = (sun as THREE.DirectionalLight).position.clone().sub((sun as THREE.DirectionalLight).target.position).normalize();
        _ray.set(from.addScaledVector(dir, 0.12), dir);
        _ray.far = 30;
        sunlit.current = !_ray.intersectObjects(blockers, false).length;
      }
    }
    const a = yaw + pick.current.angle;
    eye.set(head.x + Math.sin(a) * dist, head.y + 0.1, head.z + Math.cos(a) * dist);
    // head-and-shoulders portrait: a tighter lens keeps desk clutter, lamps and screens out of the frame edges
    camera.fov = 18;
    // cutaway: anything between the lens and ~0.32 m in front of the face is clipped, so posts and stair stringers never block
    // ...but never into the head and shoulders in frame (hands reaching towards the lens sit below this tight crop;
    // clipping at the box of the whole figure left desk pens half-cut in front of the chest)
    camera.near = Math.max(0.05, dist - 0.3);
    camera.clearViewOffset();
    camera.aspect = size.width / size.height;
    camera.position.copy(eye);
    camera.lookAt(head.x, head.y - 0.11, head.z);
    camera.updateProjectionMatrix();
    // portrait key: a soft, warm, shadowless light from upper camera-left, so brow, sockets and nose read on the face
    const l = key.current;
    if (l) {
      // a sunlit subject already has a strong key: the portrait light drops to a fill so the face and the shirt
      // colour don't wash out under ACES (Juniper by the kettle stands in the window light)
      l.intensity = sunlit.current ? 0.35 : 1.5;
      gl.toneMappingExposure = sunlit.current ? 0.86 : 1.0;
      const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      l.position.copy(eye).addScaledVector(side, -0.9).add(new THREE.Vector3(0, 0.75, 0));
      l.target.position.copy(head);
      l.target.updateMatrixWorld();
    }
  });
  return <directionalLight ref={key} intensity={1.5} color="#FFF3E2" />;
}
const HERO_CSS = ".room-root .agent-stack, .room-root .global-tape, .room-root .hud-fab, .room-root .sheet-caption, .room-root .hud-card { display: none !important; }";

function FixedCamera({ floor }: { floor: FloorName | null }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;
    let timers: number[] = [];
    const fit = () => {
      const dist = fitCamera(camera, size.width, size.height, floor);
      document.documentElement.dataset.floorFrame = floor ?? "all";
      document.documentElement.dataset.roomZoom = dist.toFixed(1);
      invalidate();
    };
    const refit = () => {
      timers.forEach((t) => window.clearTimeout(t));
      fit();
      // cards animate in: measure again once they have settled
      timers = [90, 260, 520].map((ms) => window.setTimeout(fit, ms));
    };
    refit();
    const frameOn = document.documentElement.dataset.hudFrame === "1";
    if (frameOn) window.addEventListener("hud-stage", refit);
    else {
      window.addEventListener("maquette-layout", refit);
      window.addEventListener("hashchange", refit);
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("maquette-layout", refit);
      window.removeEventListener("hashchange", refit);
      window.removeEventListener("hud-stage", refit);
    };
  }, [camera, size.width, size.height, floor, invalidate]);
  return null;
}

// ---------------------------------------------------------------- baked contact shadows
const contactMat = new THREE.ShaderMaterial({
  uniforms: { uFloor: { value: 0 }, uFar: { value: 0.5 } },
  side: THREE.DoubleSide,
  vertexShader: "varying float vH; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vH = wp.y; gl_Position = projectionMatrix*viewMatrix*wp; }",
  fragmentShader: "uniform float uFloor; uniform float uFar; varying float vH; void main(){ float t = clamp((vH-uFloor)/uFar,0.,1.); float a = pow(1.-t, 2.4); gl_FragColor = vec4(1.,1.,1.,a); }",
});

type BakeOpts = { far?: number; res?: number; blur?: number; opacity?: number; tint?: string };

function bakeContact(gl: THREE.WebGLRenderer, scene: THREE.Scene, y: number, x0: number, x1: number, z0: number, z1: number, o: BakeOpts = {}) {
  const { far = 0.45, res = 512, blur = 3, opacity = 0.5, tint = "#2B3140" } = o;
  const w = x1 - x0;
  const d = z1 - z0;
  const rw = res;
  const rh = Math.round((res * d) / w);
  const rtA = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType });
  const rtB = rtA.clone();
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, far);
  cam.position.set((x0 + x1) / 2, y + 0.002, (z0 + z1) / 2);
  cam.rotation.set(Math.PI / 2, 0, 0);
  cam.updateMatrixWorld();
  contactMat.uniforms.uFloor.value = y;
  contactMat.uniforms.uFar.value = far;
  const prevTarget = gl.getRenderTarget();
  const prevAlpha = gl.getClearAlpha();
  const prevColor = new THREE.Color();
  gl.getClearColor(prevColor);
  const prevShadow = gl.shadowMap.autoUpdate;
  gl.shadowMap.autoUpdate = false;
  scene.overrideMaterial = contactMat;
  gl.setRenderTarget(rtA);
  gl.setClearColor(0xffffff, 0);
  gl.clear();
  gl.render(scene, cam);
  scene.overrideMaterial = null;
  const hq = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader));
  const vq = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader));
  const hm = hq.material as THREE.ShaderMaterial;
  const vm = vq.material as THREE.ShaderMaterial;
  for (let k = 0; k < 2; k += 1) {
    hm.uniforms.tDiffuse.value = rtA.texture;
    hm.uniforms.h.value = (blur / rw) * (k ? 0.6 : 1);
    gl.setRenderTarget(rtB);
    hq.render(gl);
    vm.uniforms.tDiffuse.value = rtB.texture;
    vm.uniforms.v.value = (blur / rh) * (k ? 0.6 : 1);
    gl.setRenderTarget(rtA);
    vq.render(gl);
  }
  hm.dispose();
  vm.dispose();
  hq.dispose();
  vq.dispose();
  rtB.dispose();
  gl.setRenderTarget(prevTarget);
  gl.setClearColor(prevColor, prevAlpha);
  gl.shadowMap.autoUpdate = prevShadow;
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - uv.getY(i));
  const mat = new THREE.MeshBasicMaterial({ map: rtA.texture, color: tint, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set((x0 + x1) / 2, y + 0.003, (z0 + z1) / 2);
  plane.renderOrder = 1;
  plane.userData.isContact = true;
  plane.name = "contact-shadow";
  plane.userData.noContact = true;
  plane.userData.target = rtA;
  plane.raycast = () => {};
  return plane;
}

/** Bake soft contact shadows under every piece (one map per floor + one under the plinth). Re-bakes when furniture moves. */
function ContactShadows({ bakeKey, night, lift }: { bakeKey: string; night: boolean; lift: number | null }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const planes = useRef<THREE.Mesh[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hidden: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        const skip = obj.userData.skipContact || obj.userData.noContact || obj.userData.isContact || (mesh.isMesh && (mesh.material as THREE.Material)?.transparent);
        if (skip && obj.visible) {
          hidden.push(obj);
          obj.visible = false;
        }
      });
      const fresh = [
        bakeContact(gl, scene, FLOORS[0].y, GEO.wallInX, GEO.edgeR, GEO.wallInZ, FRONT, { opacity: night ? 0.64 : 0.86, blur: 2.4 }),
        bakeContact(gl, scene, FLOORS[1].y, GEO.wallInX, GEO.cut, GEO.wallInZ, FRONT, { opacity: night ? 0.64 : 0.86, blur: 2.4 }),
        bakeContact(gl, scene, FLOORS[2].y, GEO.wallInX, GEO.cut, GEO.wallInZ, FRONT, { opacity: night ? 0.64 : 0.86, blur: 2.4 }),
        bakeContact(gl, scene, -0.26, GEO.wallOutX - 1.2, GEO.edgeR + 1.2, GEO.wallOutZ - 1.2, FRONT + 1.2, {
          far: 0.5,
          res: 256,
          blur: 6,
          opacity: night ? 0.6 : 0.35,
          tint: night ? "#06080B" : "#5A5F68",
        }),
      ];
      hidden.forEach((obj) => {
        obj.visible = true;
      });
      for (const old of planes.current) {
        scene.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
        (old.userData.target as THREE.WebGLRenderTarget).dispose();
      }
      fresh.forEach((p, i) => {
        p.userData.floor = i < 3 ? i : -1;
        p.visible = i === 3 || lift == null || i <= lift;
        scene.add(p);
      });
      planes.current = fresh;
      performance.mark("house-contact");
    }, 320);
    return () => window.clearTimeout(timer);
  }, [gl, scene, bakeKey, night, lift]);
  useEffect(
    () => () => {
      for (const old of planes.current) {
        scene.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
        (old.userData.target as THREE.WebGLRenderTarget).dispose();
      }
      planes.current = [];
    },
    [scene],
  );
  return null;
}

export function RoomCanvas({
  snapshot,
  selectedId,
  onSelectAgent,
  deck = "peek",
  onUnavailable,
  onOpenBooks,
  onTapRadio,
  onTapDog,
  door = null,
}: {
  /** v16 front door: pass the door state to draw it (off when null/undefined). Engineer adds one prop at the call site. */
  door?: (DoorMeshProps & { knocks?: number }) | null;
  snapshot: LiveSnapshot;
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  deck?: "min" | "peek" | "open";
  onUnavailable?: () => void;
  onOpenBooks?: () => void;
  onTapRadio?: () => void;
  onTapDog?: () => void;
}) {
  const { night, hour, sky } = useAtmosphere();
  const grade = useMemo(() => lightGrade(hour, sky, night), [hour, sky, night]);
  const skew = snapshot.serverTime - snapshot.receivedAt;
  const lit = (id: string) => snapshot.objects.some((object) => object.id === id && object.state.on === true);
  const kettle = snapshot.objects.some((object) => object.id === "kettle" && object.state.heating === true);
  const live = useMemo(
    () => ({
      kettle,
      lights: { lamp: lit("lamp"), living: lit("living-light"), kitchen: lit("kitchen-light") },
      drawings: snapshot.drawings ?? [],
      station: snapshot.radio?.name ?? "",
      onOpenBooks: onOpenBooks ?? (() => {}),
      onTapRadio: onTapRadio ?? (() => {}),
      onTapDog: onTapDog ?? (() => {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kettle, snapshot.objects, snapshot.drawings, snapshot.radio?.name, onOpenBooks, onTapRadio, onTapDog],
  );
  const bottom = deck === "min" ? 28 : 118;
  const [down, setDown] = useState(() => !webglAvailable());
  const budget = useMemo(() => pixelBudget(), []);
  const [lineup] = useState(lineupFlag);
  const [hero] = useState(heroTarget);
  const [floor, setFloor] = useState<FloorName | null>(() => (lineupFlag() ? "kitchen" : floorParam()));
  const mini = useMemo(minimalHud, []);
  const lift = floor ? FLOOR_INDEX[floor] : null;
  const phone = typeof window !== "undefined" && window.innerWidth < 800;
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  useEffect(() => {
    if (down) onUnavailableRef.current?.();
  }, [down]);

  const bakeKey = snapshot.objects
    .map((o) => `${o.id}:${o.position.x.toFixed(2)},${o.position.z.toFixed(2)},${o.rotation.toFixed(2)}`)
    .join("|") + `|d${(snapshot.drawings ?? []).length}`;
  const above = (z: number, y = 0) => lift != null && stagePose(0, z).y + y > FLOORS[lift].y + 1.2;

  if (down) return <HouseFallback agents={snapshot.agents} />;

  return (
    <div
      className="room-stage relative h-full w-full"
      onPointerDown={(event) => {
        if (event.target instanceof HTMLCanvasElement) onSelectAgent(null);
      }}
    >
      <FidgetProvider>
        <ComputerProvider>
          <DeckContext.Provider value={{ bottom }}>
            <RoomStageBoundary fallback={<HouseFallback agents={snapshot.agents} />}>
              <Canvas
                shadows="percentage"
                dpr={budget.dpr}
                camera={{ fov: MAQUETTE.fov, position: [8, 9, 14], near: 0.5, far: 120 }}
                onCreated={() => performance.mark("house-webgl")}
                gl={{
                  antialias: true,
                  alpha: true,
                  powerPreference: "high-performance",
                  failIfMajorPerformanceCaveat: false,
                  toneMapping: THREE.ACESFilmicToneMapping,
                }}
                onPointerMissed={() => {
                  onSelectAgent(null);
                  if (mini) setFloor(null);
                }}
              >
                <WarmHouse />
                <Picture grade={grade} />
                <LightRig night={night} phone={phone} mapSize={budget.shadow} grade={grade} />
                <HouseMaterials night={night}>
                  <SceneLiveProvider value={live}>
                    <group
                      onClick={
                        mini
                          ? (event) => {
                              // minimal-HUD mockup: tap a room to bring that floor up to the frame
                              if (event.delta > 8) return;
                              event.stopPropagation();
                              setFloor(floorOfY(event.point.y + 0.05));
                            }
                          : undefined
                      }
                    >
                    <RoomShell lift={lift} />
                    {snapshot.objects
                      .filter((object) => !above(object.position.z, object.position.y) && !STATIC_KINDS.has(object.kind))
                      .map((object) => (
                        <Furniture key={object.id} object={object} />
                      ))}
                    <StaticFurniture objects={snapshot.objects.filter((object) => STATIC_KINDS.has(object.kind) && !above(object.position.z, object.position.y))} />
                    {(door ?? doorPreview()) && <DoorMesh {...doorMeshProps((door ?? doorPreview())!)} />}
                    {snapshot.dog && !above(snapshot.dog.z) && <HouseDog dog={snapshot.dog} agents={snapshot.agents} skew={skew} />}
                    </group>
                  </SceneLiveProvider>
                </HouseMaterials>
                {(lineup ? lineupAgents(snapshot.agents) : snapshot.agents)
                  .filter((agent) => !above(agent.position.z))
                  .map((agent) => (
                    <AgentAvatar key={agent.id} agent={agent} skew={skew} focused={agent.id === selectedId} onSelect={onSelectAgent} />
                  ))}
                <NameTagLayer
                  agents={(lineup ? lineupAgents(snapshot.agents) : snapshot.agents).filter((agent) => !above(agent.position.z))}
                  onSelect={onSelectAgent}
                />
                <ContactShadows bakeKey={bakeKey} night={night} lift={lift} />
                {camPreset()?.ground && <GroundPlane grade={grade} />}
                <LabelSpacing />
                <HudAnchors snapshot={snapshot} />
                {hero != null ? <HeroCamera who={hero} agents={snapshot.agents} /> : <FixedCamera floor={floor} />}
                <GlWatch onLost={() => setDown(true)} />
                <ShadowCache night={night} />
                <AdaptiveDpr max={budget.dpr} />
                {debugFlag() && <GlStats />}
              </Canvas>
            </RoomStageBoundary>
            <FidgetNote />
            <ComputerOverlay />
            <style>{LANDSCAPE_CSS}</style>
            {hero != null && <style>{HERO_CSS}</style>}
            {mini && (
              <MinimalHud
                agents={snapshot.agents}
                selectedId={selectedId}
                onSelectAgent={onSelectAgent}
                floor={floor}
                setFloor={setFloor}
                radio={{ on: snapshot.radio?.on ?? false, name: snapshot.radio?.name ?? "" }}
                onTapRadio={onTapRadio}
                door={{ locked: (door ?? doorPreview())?.locked ?? true, knocks: door?.knocks ?? ((door ?? doorPreview())?.knocking ? 2 : 0) }}
              />
            )}
          </DeckContext.Provider>
        </ComputerProvider>
      </FidgetProvider>
    </div>
  );
}

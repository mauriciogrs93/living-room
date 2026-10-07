"use client";

import * as THREE from "three";
import { FLOORS, HOUSE } from "@/lib/room/layout";
import { GEO, MAQUETTE } from "./maquette/config";
import { FRONT } from "./maquette/shell";

type FloorName = "kitchen" | "living" | "bedroom";
const FLOOR_INDEX: Record<FloorName, number> = { kitchen: 0, living: 1, bedroom: 2 };

/** Design line-up box, shared with the canvas so a lineup fit and the early zoom agree. */
let LINEUP_BOX: THREE.Box3 | null = null;
export function noteLineupBox(box: THREE.Box3 | null) {
  LINEUP_BOX = box;
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

type ScreenRect = { x: number; y: number; w: number; h: number };
type ScreenBox = { l: number; t: number; r: number; b: number; w: number; h: number };

function shownChrome(sel: string) {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return null;
  const el = document.querySelector<HTMLElement>(sel);
  if (!el || typeof el.getBoundingClientRect !== "function") return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  try {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return null;
  } catch {
    return rect;
  }
  return rect;
}

/**
 * The gap between the top cards and the bottom cards, in CSS px.
 * Falls back to the full-bleed frame when the DOM has not painted yet.
 */
export function hudSafeRect(W: number, H: number): ScreenRect {
  const gap = 6;
  const phone = W < 720;
  const tape = shownChrome(".hudf-tape");
  const title = shownChrome(".hudf-top");
  const here = shownChrome(".hudf-here");
  const bot = shownChrome(".hudf-bot");
  const pill = shownChrome(".hudf-pill");
  const measured = Boolean(tape || title || here || bot || pill);
  let top = phone ? 102 : 36;
  let bottom = phone ? H - 176 : H - 68;
  let left = 8;
  let right = W - 8;
  if (measured) {
    top = gap;
    bottom = H - gap;
    if (tape) top = Math.max(top, tape.bottom + gap);
    if (title && title.width > W * 0.55) top = Math.max(top, title.bottom + gap);
    const floors: number[] = [];
    if (bot) floors.push(bot.top);
    if (pill && pill.top > H * 0.5) floors.push(pill.top);
    if (here && here.top > H * 0.45) floors.push(here.top);
    if (floors.length) bottom = Math.min(bottom, Math.min(...floors) - gap);
    if (here && here.right < W * 0.45 && here.top < bottom && here.bottom > top) left = Math.max(left, here.right + gap);
  }
  const w = Math.max(120, right - left);
  const h = Math.max(160, bottom - top);
  return { x: left, y: top, w, h };
}

/** Screen box of the apartment silhouette. */
export function projectedHull(camera: THREE.PerspectiveCamera, W: number, H: number): ScreenBox {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const point of hullPoints()) {
    _q.copy(point).project(camera);
    const x = (_q.x * 0.5 + 0.5) * W;
    const y = (-_q.y * 0.5 + 0.5) * H;
    l = Math.min(l, x);
    r = Math.max(r, x);
    t = Math.min(t, y);
    b = Math.max(b, y);
  }
  return { l, t, r, b, w: r - l, h: b - t };
}

/** ?closeup= is a finite lens in [1, 2]. Anything else is ignored. */
export function closeUpZoomQuery(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("closeup");
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(2, Math.max(1, value));
}

/** Button close-up. ?closeup= still replaces it, and the lens never leaves [1, 2]. */
const CLOSE_LENS = 1.5;

/**
 * Close-up keeps yaw, pitch, and fov, and raises the lens well past the default fit.
 * +offsetX moves the picture left and +offsetY moves it up, one css px per unit.
 * Phone: the top floor sits just under the title card and the outer walls pass the screen edges.
 * Desktop: the larger house stays centered between the top card and the bottom bars.
 */
function applyCloseUp(camera: THREE.PerspectiveCamera, W: number, H: number) {
  const view = camera.view;
  if (!view) return;
  const asked = closeUpZoomQuery();
  let zoom = asked ?? CLOSE_LENS;
  if (!Number.isFinite(zoom)) zoom = CLOSE_LENS;
  zoom = Math.min(2, Math.max(1, zoom));
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  const box = projectedHull(camera, W, H);
  if (box.w < 8 || box.h < 8) return;
  const safe = hudSafeRect(W, H);
  const phone = W < 720;
  const cx = (box.l + box.r) / 2;
  const dX = cx - W / 2;
  const dY = phone ? box.t - (safe.y + 4) : (box.t + box.b) / 2 - (safe.y + safe.h / 2);
  view.offsetX += dX;
  view.offsetY += dY;
  camera.updateProjectionMatrix();
}

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

export function fitCamera(camera: THREE.PerspectiveCamera, W: number, H: number, floor: FloorName | null) {
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
  camera.zoom = 1;
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
  // Close-up is a second view of the same fit. The fit distance stays put; the lens moves in.
  if (!floor && camera.view && closeUpOn()) applyCloseUp(camera, W, H);
  if (typeof document !== "undefined" && document.documentElement.dataset.hudFrame === "1") {
    document.documentElement.dataset.roomLens = camera.zoom.toFixed(2);
  }
  return dist;
}

const closeUpListeners = new Set<() => void>();

/** Second view. Stored on the document so the button and the camera share one flag. */
export function closeUpOn() {
  return typeof document !== "undefined" && document.documentElement.dataset.viewClose === "1";
}

export function setCloseUp(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.viewClose = on ? "1" : "0";
  if (typeof window !== "undefined") window.dispatchEvent(new Event("hud-closeup"));
  closeUpListeners.forEach((fn) => fn());
}

export function subscribeCloseUp(fn: () => void) {
  closeUpListeners.add(fn);
  if (typeof window !== "undefined") window.addEventListener("hud-closeup", fn);
  return () => {
    closeUpListeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("hud-closeup", fn);
  };
}

const scratchCam = new THREE.PerspectiveCamera(MAQUETTE.fov, 1, 0.5, 120);

/** Write roomZoom from the window, before the canvas exists. The framed camera uses the same fit. */
export function publishFrameZoom() {
  if (typeof document === "undefined" || document.documentElement.dataset.hudFrame !== "1") return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width < 2 || height < 2) return;
  const dist = fitCamera(scratchCam, width, height, null);
  document.documentElement.dataset.floorFrame = "all";
  document.documentElement.dataset.roomZoom = dist.toFixed(1);
}

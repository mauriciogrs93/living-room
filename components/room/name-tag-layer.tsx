"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Vector3, type Camera, type Object3D } from "three";
import type { PublicAgent } from "@/lib/room/types";
import { stagePose } from "@/lib/room/layout";
import { TAG_H, fitTagBoxes, placeTags, stackListBox, stackRowCopy, type MeasuredTag, type StackBand, type TagOut, type TagPoint, type TagRect } from "@/lib/room/name-tags";
import { mutedHex } from "./maquette/color";

const MAX = 32;
const POINTS: TagPoint[] = [];
const OUTS: TagOut[] = [];
const ORDER = new Uint16Array(MAX);
const BLOCKS: TagRect[] = [];
const SIG = new Int32Array(MAX * 3 + 8);
for (let i = 0; i < MAX; i += 1) {
  POINTS.push({ id: "", x: 0, y: 0, depth: 0, name: "", idle: false, color: "" });
  OUTS.push({ id: "", x: 0, y: 0, text: "", label: "", more: 0, color: "", who: "", ids: "", dots: "", away: "" });
}
for (let i = 0; i < 24; i += 1) BLOCKS.push({ l: 0, t: 0, r: 0, b: 0 });
const STAIRS: TagRect[] = [];
const FIT: TagRect[] = [];
for (let i = 0; i < 8; i += 1) STAIRS.push({ l: 0, t: 0, r: 0, b: 0 });
for (let i = 0; i < 32; i += 1) FIT.push({ l: 0, t: 0, r: 0, b: 0 });

let seenZoom = 0;
let seenOffsetX = 0;
let seenOffsetY = 0;

const head = new Vector3();
const stairBox = new Box3();
const stairPoint = new Vector3();
const VIEW: TagRect = { l: 8, t: 8, r: 0, b: 0 };
const WIDTHS = new Float32Array(MAX);
const HEIGHTS = new Float32Array(MAX);
const MEASURED: MeasuredTag[] = [];
for (let i = 0; i < MAX; i += 1) MEASURED.push({ x: 0, y: 0, w: TAG_H, h: TAG_H, ax: 0, ay: 0 });

type LayoutStats = { frames: number; reads: number };
function layoutStats(): LayoutStats {
  const host = window as Window & { __tagLayout?: LayoutStats };
  if (!host.__tagLayout) host.__tagLayout = { frames: 0, reads: 0 };
  return host.__tagLayout;
}

function projectStairs(scene: Object3D, camera: Camera, width: number, height: number, into: TagRect[]) {
  let n = 0;
  scene.traverse((object) => {
    if (n >= into.length || object.name !== "stair-flight" || !object.visible) return;
    stairBox.setFromObject(object);
    stairBox.min.y = Math.max(stairBox.min.y, stairBox.max.y - 0.9);
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (let i = 0; i < 8; i += 1) {
      stairPoint.set(i & 1 ? stairBox.max.x : stairBox.min.x, i & 2 ? stairBox.max.y : stairBox.min.y, i & 4 ? stairBox.max.z : stairBox.min.z);
      stairPoint.project(camera);
      const x = (stairPoint.x * 0.5 + 0.5) * width;
      const y = (-stairPoint.y * 0.5 + 0.5) * height;
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
    if (!Number.isFinite(l) || r - l < 2 || b - t < 2) return;
    const box = into[n]!;
    box.l = l;
    box.t = t;
    box.r = r;
    box.b = b;
    n += 1;
  });
  return n;
}

function ceilingTop() {
  const tape = document.querySelector(".hudf-tape");
  const top = document.querySelector(".hudf-top");
  const tapeBottom = tape ? tape.getBoundingClientRect().bottom : 0;
  const titleBottom = top ? top.getBoundingClientRect().bottom : 0;
  return Math.max(8, tapeBottom, titleBottom);
}

/** Chrome the list must not sit under. Read once, when the list opens. */
function stackBands(): StackBand[] {
  const bands: StackBand[] = [];
  for (const sel of [".hudf-toast", ".hudf-here", ".hudf-strip.is-chat", ".hudf-strip.is-task", ".hudf-nav", ".hudf-top", ".hudf-tape"]) {
    const node = document.querySelector(sel);
    if (!node) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    bands.push({ top: box.top, bottom: box.bottom });
  }
  return bands;
}

function openStack(layer: HTMLElement, btn: HTMLButtonElement, closeMenu: () => void, onPick: (id: string) => void) {
  closeMenu();
  const ids = (btn.dataset.stackIds || "").split("\n").filter(Boolean);
  const names = (btn.dataset.stackNames || "").split("\n");
  const colors = (btn.dataset.stackColors || "").split("\n");
  const away = (btn.dataset.stackIdle || "").split("\n");
  if (!ids.length) return;
  const menu = document.createElement("div");
  menu.className = "tag-stack";
  menu.dataset.nameStack = "";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", btn.getAttribute("aria-label") || "More people");
  menu.dataset.returnFocus = btn.dataset.tagKey || "";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "tag-stack-x";
  close.dataset.stackClose = "";
  close.setAttribute("aria-label", "Close");
  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "×";
  close.append(mark);
  const scroll = document.createElement("div");
  scroll.className = "tag-stack-scroll";
  ids.forEach((id, index) => {
    const text = stackRowCopy(names[index] || "", away[index] === "1");
    const item = document.createElement("button");
    item.type = "button";
    item.className = "tag-stack-row";
    item.dataset.stackPick = id;
    item.setAttribute("aria-label", text);
    const dot = document.createElement("i");
    dot.className = "agent-swatch";
    dot.setAttribute("aria-hidden", "true");
    dot.style.background = mutedHex(colors[index] || "#8d99a6");
    const label = document.createElement("span");
    label.textContent = text;
    const chevron = document.createElement("b");
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    item.append(dot, label, chevron);
    scroll.append(item);
  });
  menu.append(close, scroll);
  const pill = btn.getBoundingClientRect();
  const box = stackListBox(pill.top, ceilingTop(), stackBands());
  let left = pill.left;
  const width = Math.max(132, Math.min(200, pill.width || 160));
  left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));
  const here = document.querySelector(".hudf-here")?.getBoundingClientRect();
  if (here && here.width > 1 && left < here.right + 8 && left + width > here.left && box.top < here.bottom && box.bottom > here.top) {
    const shifted = Math.min(window.innerWidth - width - 8, here.right + 8);
    if (shifted >= 8) left = shifted;
  }
  menu.style.left = `${left}px`;
  menu.style.right = "auto";
  menu.style.top = "auto";
  menu.style.bottom = `${Math.max(0, window.innerHeight - pill.top)}px`;
  menu.style.maxHeight = `${Math.max(0, Math.min(box.maxHeight, window.innerHeight - 8))}px`;
  menu.style.width = `${width}px`;
  document.body.append(menu);
  if (scroll.scrollHeight > scroll.clientHeight + 1) scroll.classList.add("is-overflow");
  btn.setAttribute("aria-expanded", "true");
  const returnFocus = () => {
    const back = menu.dataset.returnFocus;
    closeMenu();
    if (back) layer.querySelector<HTMLButtonElement>(`button[data-tag-key="${back}"]`)?.focus();
  };
  menu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button[data-stack-close]")) {
      event.preventDefault();
      event.stopPropagation();
      returnFocus();
      return;
    }
    const pick = target?.closest("button[data-stack-pick]");
    if (!(pick instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const id = pick.dataset.stackPick;
    closeMenu();
    if (id) onPick(id);
  });
  menu.addEventListener("keydown", (event) => {
    const keys = [...menu.querySelectorAll<HTMLButtonElement>("button[data-stack-pick]")];
    const index = keys.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      returnFocus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? Math.min(keys.length - 1, index + 1) : Math.max(0, index - 1);
    keys[index < 0 ? 0 : next]?.focus();
  });
  scroll.querySelector<HTMLButtonElement>("button.tag-stack-row")?.focus();
}

function bucket(n: number) {
  return (n * 20 + (n < 0 ? -0.5 : 0.5)) | 0;
}

/** DOM name tags. The collision pass runs only after a move, a camera change, or a chrome change. */
export function NameTagLayer({ agents, onSelect }: { agents: PublicAgent[]; onSelect: (id: string | null) => void }) {
  const { camera, size, gl, scene } = useThree();
  const nodes = useRef<HTMLButtonElement[]>([]);
  const labels = useRef<HTMLSpanElement[]>([]);
  const swatches = useRef<HTMLElement[]>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const blockCount = useRef(0);
  const stairCount = useRef(0);
  const knownSize = useRef({ w: -1, h: -1 });

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const layer = document.createElement("div");
    layer.className = "name-tags";
    layer.dataset.nameTags = "";
    layer.style.pointerEvents = "none";
    const buttons: HTMLButtonElement[] = [];
    const spans: HTMLSpanElement[] = [];
    const dots: HTMLElement[] = [];
    for (let i = 0; i < MAX; i += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "agent-tag";
      btn.dataset.nameTag = "";
      btn.style.pointerEvents = "auto";
      btn.hidden = true;
      const dot = document.createElement("i");
      dot.className = "agent-swatch";
      dot.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      btn.append(dot, span);
      layer.append(btn);
      buttons.push(btn);
      spans.push(span);
      dots.push(dot);
    }
    const closeMenu = () => {
      document.querySelector("[data-name-stack]")?.remove();
      layer.querySelectorAll("button[aria-expanded='true']").forEach((node) => node.setAttribute("aria-expanded", "false"));
    };
    const onDocPointer = (event: PointerEvent) => {
      const menu = document.querySelector("[data-name-stack]");
      if (!menu) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("button[data-stack-ids]")) return;
      closeMenu();
    };
    layer.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const closer = target?.closest("button[data-stack-close]");
      if (closer instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const menu = closer.closest<HTMLElement>("[data-name-stack]");
        const back = menu?.dataset.returnFocus;
        closeMenu();
        if (back) layer.querySelector<HTMLButtonElement>(`button[data-tag-key="${back}"]`)?.focus();
        return;
      }
      const pick = target?.closest("button[data-stack-pick]");
      if (pick instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const id = pick.dataset.stackPick;
        closeMenu();
        if (id) selectRef.current(id);
        return;
      }
      const btn = target?.closest("button[data-name-tag]");
      if (!(btn instanceof HTMLButtonElement) || !layer.contains(btn)) return;
      event.preventDefault();
      event.stopPropagation();
      if (btn.dataset.stackIds) {
        openStack(layer, btn, closeMenu, (id) => selectRef.current(id));
        return;
      }
      const id = btn.dataset.agentId;
      if (id) selectRef.current(id);
    });
    layer.addEventListener("keydown", (event) => {
      const menu = document.querySelector<HTMLElement>("[data-name-stack]");
      if (!menu) return;
      const keys = menu.querySelectorAll<HTMLButtonElement>("button[data-stack-pick]");
      const current = document.activeElement;
      const index = [...keys].indexOf(current as HTMLButtonElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const back = menu.dataset.returnFocus;
        closeMenu();
        if (back) layer.querySelector<HTMLButtonElement>(`button[data-tag-key="${back}"]`)?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const next = event.key === "ArrowDown" ? Math.min(keys.length - 1, index + 1) : Math.max(0, index - 1);
      keys[index < 0 ? 0 : next]?.focus();
    });
    const onSheet = () => closeMenu();
    document.addEventListener("pointerdown", onDocPointer);
    window.addEventListener("hud-sheet", onSheet);
    host.append(layer);
    nodes.current = buttons;
    labels.current = spans;
    swatches.current = dots;
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      window.removeEventListener("hud-sheet", onSheet);
      layer.remove();
      nodes.current = [];
    };
  }, [gl]);

  useFrame(() => {
    const stats = layoutStats();
    stats.frames += 1;
    const buttons = nodes.current;
    if (!buttons.length) return;
    const n = agents.length > MAX - 1 ? MAX - 1 : agents.length;
    const resized = size.width !== knownSize.current.w || size.height !== knownSize.current.h;
    let dirty = resized;
    const cx = bucket(camera.position.x);
    const cy = bucket(camera.position.y);
    const cz = bucket(camera.position.z);
    const lens = camera as Camera & { zoom?: number; view?: { enabled?: boolean; offsetX: number; offsetY: number } | null };
    const zoomNow = Math.round((lens.zoom ?? 1) * 1000);
    const offsetXNow = Math.round(lens.view?.enabled ? lens.view.offsetX : 0);
    const offsetYNow = Math.round(lens.view?.enabled ? lens.view.offsetY : 0);
    if (cx !== SIG[2] || cy !== SIG[3] || cz !== SIG[4] || n !== SIG[5]) dirty = true;
    if (zoomNow !== seenZoom || offsetXNow !== seenOffsetX || offsetYNow !== seenOffsetY) dirty = true;
    for (let i = 0; i < n; i += 1) {
      const agent = agents[i]!;
      const x = bucket(agent.position.x);
      const y = bucket(agent.position.y);
      const z = bucket(agent.position.z);
      const base = 8 + i * 3;
      if (SIG[base] !== x || SIG[base + 1] !== y || SIG[base + 2] !== z) dirty = true;
      SIG[base] = x;
      SIG[base + 1] = y;
      SIG[base + 2] = z;
    }
    let awayLo = 0;
    let awayHi = 0;
    for (let i = 0; i < n; i += 1) {
      if (!agents[i]!.away) continue;
      if (i < 16) awayLo |= 1 << i;
      else awayHi |= 1 << (i - 16);
    }
    if (awayLo !== SIG[6] || awayHi !== SIG[7]) dirty = true;
    SIG[6] = awayLo;
    SIG[7] = awayHi;
    if (!dirty) return;
    const cameraMoved = cx !== SIG[2] || cy !== SIG[3] || cz !== SIG[4];
    const viewMoved = zoomNow !== seenZoom || offsetXNow !== seenOffsetX || offsetYNow !== seenOffsetY;
    seenZoom = zoomNow;
    seenOffsetX = offsetXNow;
    seenOffsetY = offsetYNow;
    SIG[0] = size.width;
    SIG[1] = size.height;
    SIG[2] = cx;
    SIG[3] = cy;
    SIG[4] = cz;
    SIG[5] = n;

    const host = gl.domElement.parentElement;
    if (!host) return;
    if (resized) {
      knownSize.current.w = size.width;
      knownSize.current.h = size.height;
      const frame = host.getBoundingClientRect();
      stats.reads += 1;
      let blocks = 0;
      const chrome = host.ownerDocument.querySelectorAll<HTMLElement>("[data-chrome], .hudf-card");
      for (let i = 0; i < chrome.length && blocks < BLOCKS.length; i += 1) {
        const rect = chrome[i]!.getBoundingClientRect();
        stats.reads += 1;
        if (rect.width < 1 || rect.height < 1) continue;
        const box = BLOCKS[blocks]!;
        box.l = rect.left - frame.left;
        box.t = rect.top - frame.top;
        box.r = rect.right - frame.left;
        box.b = rect.bottom - frame.top;
        blocks += 1;
      }
      blockCount.current = blocks;
    }
    if (resized || cameraMoved || viewMoved) stairCount.current = projectStairs(scene, camera, size.width, size.height, STAIRS);
    const blocks = blockCount.current;
    VIEW.r = size.width - 8;
    VIEW.b = size.height - 8;

    for (let i = 0; i < n; i += 1) {
      const agent = agents[i]!;
      const staged = stagePose(agent.position.x, agent.position.z);
      const hip = agent.anchor === "feet" && !agent.lie ? 0.72 : agent.position.y;
      head.set(staged.x, hip + staged.y + (agent.lie ? 0.42 : 0.97), staged.z);
      const dx = head.x - camera.position.x;
      const dy = head.y - camera.position.y;
      const dz = head.z - camera.position.z;
      const depth = dx * dx + dy * dy + dz * dz;
      head.project(camera);
      const point = POINTS[i]!;
      point.id = agent.id;
      point.x = (head.x * 0.5 + 0.5) * size.width;
      point.y = (-head.y * 0.5 + 0.5) * size.height;
      point.depth = head.z < -1 || head.z > 1 ? 1e12 : depth;
      point.name = agent.name;
      point.idle = agent.away;
      point.color = agent.color;
    }
    const shown = placeTags(POINTS, n, BLOCKS, blocks, VIEW, ORDER, OUTS);
    let needRead = resized;
    for (let i = 0; i < shown; i += 1) {
      const span = labels.current[i];
      const slot = OUTS[i]!;
      if (span && span.textContent !== slot.text) {
        span.textContent = slot.text;
        needRead = true;
      }
    }
    if (needRead) {
      for (let i = 0; i < shown; i += 1) {
        const btn = buttons[i]!;
        btn.hidden = false;
        btn.style.width = "max-content";
      }
      for (let i = 0; i < shown; i += 1) {
        const btn = buttons[i]!;
        WIDTHS[i] = btn.scrollWidth;
        HEIGHTS[i] = btn.offsetHeight || TAG_H;
        stats.reads += 1;
      }
    }
    let fitCount = blocks;
    for (let i = 0; i < blocks; i += 1) {
      FIT[i]!.l = BLOCKS[i]!.l;
      FIT[i]!.t = BLOCKS[i]!.t;
      FIT[i]!.r = BLOCKS[i]!.r;
      FIT[i]!.b = BLOCKS[i]!.b;
    }
    for (let i = 0; i < stairCount.current && fitCount < FIT.length; i += 1) {
      FIT[fitCount]!.l = STAIRS[i]!.l;
      FIT[fitCount]!.t = STAIRS[i]!.t;
      FIT[fitCount]!.r = STAIRS[i]!.r;
      FIT[fitCount]!.b = STAIRS[i]!.b;
      fitCount += 1;
    }
    for (let i = 0; i < shown; i += 1) {
      const slot = OUTS[i]!;
      const point = POINTS.find((item) => item.id === slot.id);
      const box = MEASURED[i]!;
      box.x = slot.x;
      box.y = slot.y;
      box.w = WIDTHS[i] || slot.text.length * 7 + 28;
      box.h = HEIGHTS[i] || TAG_H;
      box.ax = point?.x ?? slot.x + box.w / 2;
      box.ay = point?.y ?? slot.y + box.h + 10;
    }
    const seated = fitTagBoxes(MEASURED.slice(0, shown), VIEW, FIT, fitCount);
    for (let i = 0; i < buttons.length; i += 1) {
      const btn = buttons[i]!;
      const span = labels.current[i];
      const dot = swatches.current[i];
      if (!span || !dot) continue;
      if (i >= shown) {
        btn.hidden = true;
        continue;
      }
      const slot = OUTS[i]!;
      const seat = seated[i] ?? { x: slot.x, y: slot.y };
      btn.hidden = false;
      btn.dataset.tagKey = String(i);
      btn.classList.toggle("is-more", slot.more > 0);
      btn.classList.toggle("is-away", slot.text.endsWith(" · Away"));
      btn.style.left = `${seat.x}px`;
      btn.style.top = `${seat.y}px`;
      btn.style.width = "max-content";
      btn.style.height = "auto";
      if (slot.more > 0) {
        delete btn.dataset.agentId;
        btn.dataset.stackIds = slot.ids;
        btn.dataset.stackNames = slot.who;
        btn.dataset.stackColors = slot.dots;
        btn.dataset.stackIdle = slot.away;
        btn.setAttribute("aria-haspopup", "dialog");
        dot.hidden = true;
      } else {
        btn.dataset.agentId = slot.id;
        delete btn.dataset.stackIds;
        delete btn.dataset.stackNames;
        delete btn.dataset.stackColors;
        delete btn.dataset.stackIdle;
        btn.removeAttribute("aria-haspopup");
        dot.hidden = false;
        dot.style.background = mutedHex(slot.color || "#8d99a6");
      }
      if (btn.getAttribute("aria-label") !== slot.label) btn.setAttribute("aria-label", slot.label);
    }
  });

  return null;
}

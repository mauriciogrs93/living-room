"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { PublicAgent } from "@/lib/room/types";
import { stagePose } from "@/lib/room/layout";
import { TAG_H, TAG_W, placeTags, type TagOut, type TagPoint, type TagRect } from "@/lib/room/name-tags";
import { mutedHex } from "./maquette/color";

const MAX = 32;
const POINTS: TagPoint[] = [];
const OUTS: TagOut[] = [];
const ORDER = new Uint16Array(MAX);
const BLOCKS: TagRect[] = [];
const SIG = new Int32Array(MAX * 3 + 8);
for (let i = 0; i < MAX; i += 1) {
  POINTS.push({ id: "", x: 0, y: 0, depth: 0, name: "", idle: false, color: "" });
  OUTS.push({ id: "", x: 0, y: 0, text: "", label: "", more: 0, color: "", who: "", ids: "" });
}
for (let i = 0; i < 24; i += 1) BLOCKS.push({ l: 0, t: 0, r: 0, b: 0 });

const head = new Vector3();
const VIEW: TagRect = { l: 8, t: 8, r: 0, b: 0 };

function openStack(layer: HTMLElement, btn: HTMLButtonElement, closeMenu: () => void) {
  closeMenu();
  const ids = (btn.dataset.stackIds || "").split("\n").filter(Boolean);
  const names = (btn.dataset.stackNames || "").split("\n");
  if (!ids.length) return;
  const menu = document.createElement("div");
  menu.className = "tag-stack";
  menu.dataset.nameStack = "";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", btn.getAttribute("aria-label") || "More people");
  menu.dataset.returnFocus = btn.dataset.tagKey || "";
  ids.forEach((id, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.dataset.stackPick = id;
    item.textContent = names[index] || "Someone";
    menu.append(item);
  });
  const left = Number.parseFloat(btn.style.left) || 0;
  const top = Number.parseFloat(btn.style.top) || 0;
  menu.style.left = `${left}px`;
  menu.style.top = `${top + 32}px`;
  layer.append(menu);
  btn.setAttribute("aria-expanded", "true");
  menu.querySelector("button")?.focus();
}

function bucket(n: number) {
  return (n * 20 + (n < 0 ? -0.5 : 0.5)) | 0;
}

/** DOM name tags. The collision pass runs only after a move, a camera change, or a chrome change. */
export function NameTagLayer({ agents, onSelect }: { agents: PublicAgent[]; onSelect: (id: string | null) => void }) {
  const { camera, size, gl } = useThree();
  const nodes = useRef<HTMLButtonElement[]>([]);
  const labels = useRef<HTMLSpanElement[]>([]);
  const swatches = useRef<HTMLElement[]>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const chromeGen = useRef(0);
  const seenGen = useRef(-1);
  const blockCount = useRef(0);
  const origin = useRef({ l: 0, t: 0 });

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const layer = document.createElement("div");
    layer.className = "name-tags";
    layer.dataset.nameTags = "";
    const buttons: HTMLButtonElement[] = [];
    const spans: HTMLSpanElement[] = [];
    const dots: HTMLElement[] = [];
    for (let i = 0; i < MAX; i += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "agent-tag";
      btn.dataset.nameTag = "";
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
      layer.querySelector("[data-name-stack]")?.remove();
      layer.querySelectorAll("button[aria-expanded='true']").forEach((node) => node.setAttribute("aria-expanded", "false"));
    };
    const onDocPointer = (event: PointerEvent) => {
      const menu = layer.querySelector("[data-name-stack]");
      if (!menu) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("button[data-stack-ids]")) return;
      closeMenu();
    };
    layer.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const pick = target?.closest("button[data-stack-pick]");
      if (pick instanceof HTMLButtonElement && layer.contains(pick)) {
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
        openStack(layer, btn, closeMenu);
        return;
      }
      const id = btn.dataset.agentId;
      if (id) selectRef.current(id);
    });
    layer.addEventListener("keydown", (event) => {
      const menu = layer.querySelector<HTMLElement>("[data-name-stack]");
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
    document.addEventListener("pointerdown", onDocPointer);
    host.append(layer);
    nodes.current = buttons;
    labels.current = spans;
    swatches.current = dots;
    const root = gl.domElement.closest(".hudf") ?? host;
    const observer = new MutationObserver(() => {
      chromeGen.current += 1;
    });
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onDocPointer);
      layer.remove();
      nodes.current = [];
    };
  }, [gl]);

  useFrame(() => {
    const buttons = nodes.current;
    if (!buttons.length) return;
    const n = agents.length > MAX - 1 ? MAX - 1 : agents.length;
    let dirty = chromeGen.current !== seenGen.current || size.width !== SIG[0] || size.height !== SIG[1];
    const cx = bucket(camera.position.x);
    const cy = bucket(camera.position.y);
    const cz = bucket(camera.position.z);
    if (cx !== SIG[2] || cy !== SIG[3] || cz !== SIG[4] || n !== SIG[5]) dirty = true;
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
    if (!dirty) return;
    const chromeChanged = chromeGen.current !== seenGen.current || size.width !== SIG[0] || size.height !== SIG[1];
    SIG[0] = size.width;
    SIG[1] = size.height;
    SIG[2] = cx;
    SIG[3] = cy;
    SIG[4] = cz;
    SIG[5] = n;
    seenGen.current = chromeGen.current;

    const host = gl.domElement.parentElement;
    if (!host) return;
    if (chromeChanged) {
      const frame = host.getBoundingClientRect();
      origin.current.l = frame.left;
      origin.current.t = frame.top;
      let blocks = 0;
      const chrome = host.ownerDocument.querySelectorAll<HTMLElement>("[data-chrome], .hudf-card");
      for (let i = 0; i < chrome.length && blocks < BLOCKS.length; i += 1) {
        const rect = chrome[i]!.getBoundingClientRect();
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
      btn.hidden = false;
      btn.dataset.tagKey = String(i);
      btn.classList.toggle("is-more", slot.more > 0);
      btn.classList.toggle("is-away", slot.text.endsWith(" · Away"));
      btn.style.left = `${slot.x}px`;
      btn.style.top = `${slot.y}px`;
      btn.style.width = `${TAG_W}px`;
      btn.style.height = `${TAG_H}px`;
      if (slot.more > 0) {
        delete btn.dataset.agentId;
        btn.dataset.stackIds = slot.ids;
        btn.dataset.stackNames = slot.who;
        btn.setAttribute("aria-haspopup", "dialog");
        dot.hidden = true;
      } else {
        btn.dataset.agentId = slot.id;
        delete btn.dataset.stackIds;
        delete btn.dataset.stackNames;
        btn.removeAttribute("aria-haspopup");
        dot.hidden = false;
        dot.style.background = mutedHex(slot.color || "#8d99a6");
      }
      if (span.textContent !== slot.text) span.textContent = slot.text;
      if (btn.getAttribute("aria-label") !== slot.label) btn.setAttribute("aria-label", slot.label);
    }
  });

  return null;
}

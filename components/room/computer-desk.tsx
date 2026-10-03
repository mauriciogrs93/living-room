"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, Vector3, type Object3D } from "three";
import { C, Chunk, Tap, flag, str, useMaps } from "./furniture-kit";
import { tapObject } from "./viewer-tap";

type Screen = { user: string; mode: string; line: string; source: string };

type ComputerValue = { open: Screen | null; show: (screen: Screen | null) => void };

const ComputerContext = createContext<ComputerValue | null>(null);

export function ComputerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Screen | null>(null);
  const value = useMemo(() => ({ open, show: setOpen }), [open]);
  return <ComputerContext.Provider value={value}>{children}</ComputerContext.Provider>;
}

function useComputerScreen() {
  const value = useContext(ComputerContext);
  if (!value) throw new Error("Computer desk is missing.");
  return value;
}

export function ComputerOverlay() {
  const value = useContext(ComputerContext);
  if (!value?.open) return null;
  const { user, mode, line, source } = value.open;
  const kicker = user ? `${user} · ${mode === "browse" ? "browsing" : mode === "type" ? "typing" : "off"}` : "Computer";
  return (
    <div className="computer-card" role="dialog" aria-label="Computer screen">
      <p className="computer-card-kicker">{kicker}</p>
      <p className="computer-card-line">{line || "The monitor is dark."}</p>
      {source ? <p className="computer-card-source">{source}</p> : null}
      <button type="button" onClick={() => value.show(null)}>
        Close
      </button>
    </div>
  );
}

function paintMonitor(power: boolean, line: string, source: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = power ? "#102033" : "#16181c";
  ctx.fillRect(0, 0, 512, 320);
  if (power) {
    ctx.fillStyle = "#143028";
    ctx.fillRect(0, 0, 512, 36);
    ctx.fillStyle = "#d7efe4";
    ctx.font = "600 36px Georgia, serif";
    const words = (line || " ").split(" ");
    let row = "";
    let y = 86;
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (ctx.measureText(next).width > 460 && row) {
        ctx.fillText(row, 24, y);
        row = word;
        y += 46;
      } else row = next;
      if (y > 250) break;
    }
    if (row && y <= 260) ctx.fillText(row.slice(0, 42), 24, y);
    if (source) {
      ctx.fillStyle = "#8fb5a0";
      ctx.font = "600 22px ui-sans-serif, sans-serif";
      ctx.fillText(source.slice(0, 32), 24, 292);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const cap = new Vector3();

export function DeskModel({ state }: { state: Record<string, unknown> }) {
  const maps = useMaps();
  const { show } = useComputerScreen();
  const power = flag(state, "power");
  const line = str(state, "line").replace(/[<>]/g, "").slice(0, 90);
  const source = str(state, "source").replace(/[<>]/g, "").slice(0, 24);
  const user = str(state, "user").replace(/[<>]/g, "").slice(0, 24);
  const mode = str(state, "mode", "off");
  const texture = useMemo(() => paintMonitor(power, line, source), [power, line, source]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const anchor = useRef<Object3D>(null);
  const hit = useRef<HTMLButtonElement | null>(null);
  const caption = useRef<HTMLDivElement | null>(null);
  const { camera, gl, size } = useThree();

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "computer-hit";
    button.setAttribute("aria-label", "Look at the computer screen");
    const note = document.createElement("div");
    note.className = "computer-caption";
    host.appendChild(button);
    host.appendChild(note);
    hit.current = button;
    caption.current = note;
    return () => {
      button.remove();
      note.remove();
      hit.current = null;
      caption.current = null;
    };
  }, [gl]);

  useLayoutEffect(() => {
    const button = hit.current;
    const note = caption.current;
    if (!button || !note) return;
    const open = () => {
      const next = !power;
      tapObject("computer");
      show({
        user,
        mode: next ? (mode === "off" ? "browse" : mode) : "off",
        line: next ? line || "The monitor wakes." : "The monitor is dark.",
        source,
      });
    };
    button.onclick = open;
    note.textContent = power ? line || "On" : "";
    note.style.visibility = power && line ? "visible" : "hidden";
  }, [show, user, mode, power, line, source]);

  useFrame(() => {
    const button = hit.current;
    const note = caption.current;
    const point = anchor.current;
    if (!button || !note || !point) return;
    point.updateWorldMatrix(true, false);
    point.getWorldPosition(cap);
    const projected = cap.project(camera);
    const onScreen = projected.z >= -1 && projected.z <= 1;
    const x = (projected.x * 0.5 + 0.5) * size.width;
    const y = (-projected.y * 0.5 + 0.5) * size.height;
    button.style.visibility = onScreen ? "visible" : "hidden";
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.width = "72px";
    button.style.height = "48px";
    note.style.left = `${x}px`;
    note.style.top = `${y + 28}px`;
  });

  return (
    <Tap
      onTap={() => {
        const next = !power;
        tapObject("computer");
        show({
          user,
          mode: next ? (mode === "off" ? "browse" : mode) : "off",
          line: next ? line || "The monitor wakes." : "The monitor is dark.",
          source,
        });
      }}
    >
      <group>
        <Chunk position={[0, 0.74, 0.02]} args={[0.96, 0.06, 0.5]} map={maps.wood} radius={0.02} />
        <Chunk position={[-0.4, 0.36, -0.14]} args={[0.05, 0.68, 0.05]} map={maps.wood} radius={0.01} />
        <Chunk position={[0.4, 0.36, -0.14]} args={[0.05, 0.68, 0.05]} map={maps.wood} radius={0.01} />
        <Chunk position={[-0.4, 0.36, 0.16]} args={[0.05, 0.68, 0.05]} map={maps.wood} radius={0.01} />
        <Chunk position={[0.4, 0.36, 0.16]} args={[0.05, 0.68, 0.05]} map={maps.wood} radius={0.01} />
        <Chunk position={[0, 0.86, 0.12]} args={[0.05, 0.14, 0.04]} color={C.tv} radius={0.01} />
        <Chunk position={[0, 1.08, 0.12]} args={[0.5, 0.34, 0.045]} color={C.tv} radius={0.02} roughness={0.4} />
        <mesh position={[0, 1.08, 0.15]}>
          <planeGeometry args={[0.42, 0.26]} />
          {texture ? (
            <meshStandardMaterial
              map={texture}
              emissive={power ? "#7dcea0" : "#000"}
              emissiveMap={power ? texture : null}
              emissiveIntensity={power ? 0.65 : 0}
              roughness={0.32}
              toneMapped={false}
            />
          ) : (
            <meshStandardMaterial color={power ? "#143028" : "#16181c"} emissive={power ? "#1f6b4a" : "#000"} emissiveIntensity={power ? 0.5 : 0} />
          )}
        </mesh>
        <object3D ref={anchor} position={[0, 1.08, 0.2]} />
        <Chunk position={[0, 0.785, -0.04]} args={[0.34, 0.02, 0.12]} color="#3a342f" radius={0.008} />
        <Chunk position={[0.34, 0.9, -0.08]} args={[0.025, 0.26, 0.025]} color="#c4a574" radius={0.008} />
        <mesh position={[0.36, 1.05, -0.02]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#f3e2b0" emissive={power ? "#f0c56a" : "#5c4630"} emissiveIntensity={power ? 0.9 : 0.12} />
        </mesh>
        {power && <pointLight position={[0, 1.2, 0.55]} color="#d7efe4" intensity={2.2} distance={2.8} decay={2} />}
        <Chair x={-0.32} />
        <Chair x={0.32} />
      </group>
    </Tap>
  );
}

function Chair({ x }: { x: number }) {
  const maps = useMaps();
  return (
    <group position={[x, 0, -0.32]}>
      <Chunk position={[0, 0.22, 0]} args={[0.04, 0.4, 0.04]} map={maps.wood} radius={0.01} />
      <Chunk position={[0, 0.44, 0.02]} args={[0.28, 0.05, 0.26]} map={maps.wood} radius={0.02} />
      <Chunk position={[0, 0.64, -0.1]} args={[0.28, 0.32, 0.05]} map={maps.wood} radius={0.02} />
    </group>
  );
}

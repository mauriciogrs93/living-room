"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { Tap, flag, str, useBuilt, useMats } from "./furniture-kit";
import { PAL } from "./maquette/config";
import { desk } from "./maquette/pieces";
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

const cap = new Vector3();

/**
 * The shared desk. The monitor faces the two engine seats; its content is abstract etched lines (no texture).
 * The typed line is read in the computer card (tap the monitor), not painted onto the glass.
 */
export function DeskModel({ state }: { state: Record<string, unknown> }) {
  const { M, night } = useMats();
  const { show } = useComputerScreen();
  const power = flag(state, "power");
  const line = str(state, "line").replace(/[<>]/g, "").slice(0, 90);
  const source = str(state, "source").replace(/[<>]/g, "").slice(0, 24);
  const user = str(state, "user").replace(/[<>]/g, "").slice(0, 24);
  const mode = str(state, "mode", "off");
  const built = useBuilt(() => desk(M, power, night), [M, power, night]);
  const hit = useRef<HTMLButtonElement | null>(null);
  const { camera, gl, size } = useThree();

  useLayoutEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "computer-hit";
    button.setAttribute("aria-label", "Look at the computer screen");
    host.appendChild(button);
    hit.current = button;
    return () => {
      button.remove();
      hit.current = null;
    };
  }, [gl]);

  const open = useCallback(() => {
    const next = !power;
    tapObject("computer");
    show({
      user,
      mode: next ? (mode === "off" ? "browse" : mode) : "off",
      line: next ? line || "The monitor wakes." : "The monitor is dark.",
      source,
    });
  }, [show, user, mode, power, line, source]);

  useLayoutEffect(() => {
    if (hit.current) hit.current.onclick = open;
  }, [open]);

  useFrame(() => {
    const button = hit.current;
    const point = built.parts.anchor;
    if (!button || !point) return;
    let visible = true;
    for (let p: Object3D | null = point; p; p = p.parent) if (!p.visible) visible = false;
    point.updateWorldMatrix(true, false);
    point.getWorldPosition(cap);
    const projected = cap.project(camera);
    const onScreen = visible && projected.z >= -1 && projected.z <= 1;
    button.style.visibility = onScreen ? "visible" : "hidden";
    button.style.left = `${(projected.x * 0.5 + 0.5) * size.width}px`;
    button.style.top = `${(-projected.y * 0.5 + 0.5) * size.height}px`;
    button.style.width = "56px";
    button.style.height = "44px";
  });

  return (
    <Tap onTap={open}>
      <primitive object={built.group} />
      {night && power && <pointLight position={[0.43, 1.0, -0.3]} color="#DDE6EE" intensity={0.5} distance={2.2} decay={2} />}
      {night && <pointLight position={[-0.32, 0.95, -0.1]} color={PAL.lamp} intensity={1.2} distance={2.6} decay={2} />}
    </Tap>
  );
}

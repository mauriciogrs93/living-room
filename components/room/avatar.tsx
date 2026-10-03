"use client";

import { useContext, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group, type Material, type Mesh } from "three";
import { FLOORS, stagePose } from "@/lib/room/layout";
import { motionPoint } from "@/lib/room/paths";
import type { PublicAgent } from "@/lib/room/types";
import { DeckContext } from "./interact";

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

function shade(hex: string, amount: number) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function lerpAngle(a: number, b: number, t: number) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export function AgentAvatar({
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
  const root = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const stack = useRef<HTMLDivElement>(null);
  const labelRoot = useRef<Root | null>(null);
  const labelPoint = useRef(new Vector3());
  const { camera, size, gl } = useThree();
  const deck = useContext(DeckContext);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyeL = useRef<Mesh>(null);
  const eyeR = useRef<Mesh>(null);
  const phase = useRef(0);
  const climb = useRef(stagePose(agent.position.x, agent.position.z).y);
  const smooth = useRef({
    x: agent.position.x,
    y: agent.anchor === "feet" ? agent.position.y + HIPS : agent.position.y,
    z: agent.position.z,
    yaw: agent.yaw,
  });

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const now = Date.now() + skew;
    let x = agent.position.x;
    let z = agent.position.z;
    let yaw = agent.yaw;
    let feet = agent.anchor === "feet" && !agent.lie;
    if (agent.motion) {
      const at = motionPoint(agent.motion.path, agent.motion.from, agent.motion.to, agent.motion.startedAt, agent.motion.arriveAt, now);
      x = at.x;
      z = at.z;
      yaw = at.yaw;
      feet = true;
    }
    const y = feet ? HIPS : agent.position.y;
    const s = smooth.current;
    const follow = Math.min(1, delta * (agent.motion ? 7.5 : 11));
    s.x += (x - s.x) * follow;
    s.y += (y - s.y) * follow;
    s.z += (z - s.z) * follow;
    s.yaw = lerpAngle(s.yaw, yaw, Math.min(1, delta * 8));
    const walking = Boolean(agent.motion) || agent.pose === "walking";
    const talking = Boolean(agent.speech);
    phase.current += delta * (walking ? 9 : talking ? 5 : agent.emote === "dance" ? 8 : 1.6);
    const bob = walking ? Math.abs(Math.sin(phase.current)) * 0.045 : talking ? Math.abs(Math.sin(phase.current * 2)) * 0.035 : agent.emote === "dance" ? Math.abs(Math.sin(phase.current)) * 0.08 : 0;
    const jump = agent.emote === "jump" ? Math.abs(Math.sin(phase.current * 3)) * 0.28 : 0;
    const staged = stagePose(s.x, s.z);
    const stepY = feet ? tread(s.z, staged.y) : staged.y;
    climb.current += (stepY - climb.current) * Math.min(1, delta * 9);
    const lift = climb.current;
    group.position.set(staged.x, s.y + lift + bob + jump, staged.z);
    group.rotation.y = s.yaw;
    if (shadow.current) {
      shadow.current.position.set(staged.x, lift + 0.03, staged.z);
      shadow.current.visible = !agent.lie;
      const spread = agent.pose === "sitting" ? 0.34 : 0.26;
      shadow.current.scale.set(spread, spread, spread);
    }
    if (ring.current) {
      ring.current.position.set(staged.x, staged.y + 0.04, staged.z);
      ring.current.visible = focused && !agent.lie && !agent.away;
    }
    const label = stack.current;
    const host = gl.domElement.parentElement;
    if (label && host) {
      labelPoint.current.set(staged.x, s.y + lift + (agent.lie ? 0.55 : 1.05), staged.z);
      const projected = labelPoint.current.project(camera);
      const onScreen = projected.z >= -1 && projected.z <= 1;
      label.style.visibility = onScreen ? "visible" : "hidden";
      if (onScreen) {
        const x = (projected.x * 0.5 + 0.5) * size.width;
        const y = (-projected.y * 0.5 + 0.5) * size.height;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.style.transform = "translate(-50%, -100%)";
        const rect = label.getBoundingClientRect();
        const bounds = host.getBoundingClientRect();
        const narrow = bounds.width < 800;
        const margin = 8;
        const top = narrow ? 46 : 12;
        const bottom = narrow ? deck.bottom : 16;
        let dx = 0;
        let dy = 0;
        if (rect.left < bounds.left + margin) dx = bounds.left + margin - rect.left;
        if (rect.right > bounds.right - margin) dx = bounds.right - margin - rect.right;
        if (rect.top < bounds.top + top) dy = bounds.top + top - rect.top;
        if (rect.bottom > bounds.bottom - bottom) dy = bounds.bottom - bottom - rect.bottom;
        if (dx !== 0 || dy !== 0) label.style.transform = `translate(calc(-50% + ${dx}px), calc(-100% + ${dy}px))`;
      }
    }
    const swing = Math.sin(phase.current);
    if (leftArm.current) {
      leftArm.current.rotation.x = walking ? swing * 0.7 : agent.pose === "reading" ? -1.05 : 0.08;
      leftArm.current.rotation.z = 0.18;
    }
    if (rightArm.current) {
      const waving = agent.emote === "wave" || agent.emote === "cheer";
      if (waving) {
        rightArm.current.rotation.x = -2.35;
        rightArm.current.rotation.z = -0.3 + Math.sin(phase.current * 2) * 0.25;
      } else if (agent.pose === "eating" || agent.pose === "reading") {
        rightArm.current.rotation.x = -1.15;
        rightArm.current.rotation.z = -0.2;
      } else {
        rightArm.current.rotation.x = walking ? -swing * 0.7 : 0.08;
        rightArm.current.rotation.z = -0.18;
      }
    }
    if (torso.current) {
      const breath = agent.lie ? 1 : 1 + Math.sin(phase.current * 1.3) * (walking ? 0.012 : 0.03);
      torso.current.scale.y = breath;
      torso.current.rotation.x = talking ? Math.sin(phase.current * 4) * 0.08 : agent.emote === "bow" ? 0.65 : agent.pose === "looking" ? 0.22 : 0;
    }
    if (head.current) {
      head.current.rotation.y = walking || talking ? Math.sin(phase.current * 0.6) * 0.08 : Math.sin(phase.current * 0.35) * 0.28;
      head.current.rotation.x = talking ? Math.sin(phase.current * 5) * 0.1 : 0;
    }
    const blink = agent.pose === "sleeping" ? 0.16 : (phase.current % 4.6) > 4.42 ? 0.12 : 1;
    if (eyeL.current) eyeL.current.scale.y = blink;
    if (eyeR.current) eyeR.current.scale.y = blink;
    const step = walking ? Math.sin(phase.current) * 0.62 : 0;
    const leg = agent.pose === "sitting" ? -1.25 : step;
    if (leftLeg.current) leftLeg.current.rotation.x = leg;
    if (rightLeg.current) rightLeg.current.rotation.x = agent.pose === "sitting" ? -1.25 : -step;
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
    return () => {
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
      const material = (obj as Mesh).material as Material | Material[] | undefined;
      if (!material || Array.isArray(material)) return;
      const mat = material as Material & { userData: { baseOpacity?: number } };
      if (mat.userData.baseOpacity == null) mat.userData.baseOpacity = mat.opacity;
      const base = mat.userData.baseOpacity ?? 1;
      mat.transparent = agent.away || base < 1;
      mat.opacity = agent.away ? base * 0.28 : base;
      mat.depthWrite = !agent.away;
    });
  });

  useLayoutEffect(() => {
    if (stack.current) stack.current.classList.toggle("is-away", agent.away);
    labelRoot.current?.render(
      <>
        {agent.speech ? (
          <div className="agent-bubble">
            <span className="agent-bubble-name">{agent.name}</span>
            <span>{agent.speech.text}</span>
          </div>
        ) : null}
        {agent.pose === "sleeping" && <div className="agent-zzz">z z z</div>}
        {agent.away && <div className="agent-away">away</div>}
        <div
          className={`agent-tag${focused ? " is-followed" : ""}${agent.away ? " is-away" : ""}`}
          style={{ pointerEvents: "auto" }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(agent.id);
          }}
        >
          <span className="agent-emoji" aria-hidden>
            {agent.emoji}
          </span>
          <span>{agent.name}</span>
        </div>
      </>,
    );
  });

  const skin = "#f0c7a8";
  const cloth = agent.color;
  const clothDark = shade(agent.color, -28);
  const hair = shade(agent.color, -45);

  return (
    <>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[agent.position.x, 0.025, agent.position.z]}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial color={focused ? agent.color : "#6a4b38"} transparent opacity={agent.away ? 0.05 : focused ? 0.28 : 0.16} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[agent.position.x, 0.035, agent.position.z]}>
        <ringGeometry args={[0.28, 0.4, 40]} />
        <meshBasicMaterial color={agent.color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <group
        ref={root}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(agent.id);
        }}
      >
        <group scale={1.18} rotation={[agent.lie ? -Math.PI / 2 : 0, 0, 0]}>
          <group ref={torso}>
            <mesh position={[0, 0.14, 0]} castShadow>
              <sphereGeometry args={[0.23, 18, 14]} />
              <meshStandardMaterial color={cloth} roughness={0.62} />
            </mesh>
            <group ref={head} position={[0, 0.4, 0.02]}>
            <mesh position={[0, 0.08, 0]} castShadow>
              <sphereGeometry args={[0.19, 18, 14]} />
              <meshStandardMaterial color={skin} roughness={0.48} />
            </mesh>
            <mesh position={[0, 0.16, -0.02]}>
              <sphereGeometry args={[0.16, 16, 12]} />
              <meshStandardMaterial color={hair} roughness={0.62} />
            </mesh>
            <mesh ref={eyeL} position={[-0.06, 0.08, 0.15]}>
              <sphereGeometry args={[0.03, 10, 8]} />
              <meshStandardMaterial color="#fffaf6" roughness={0.35} />
            </mesh>
            <mesh ref={eyeR} position={[0.06, 0.08, 0.15]}>
              <sphereGeometry args={[0.03, 10, 8]} />
              <meshStandardMaterial color="#fffaf6" roughness={0.35} />
            </mesh>
            <mesh position={[-0.06, 0.08, 0.172]}>
              <sphereGeometry args={[0.014, 8, 6]} />
              <meshStandardMaterial color="#241c18" roughness={0.3} />
            </mesh>
            <mesh position={[0.06, 0.08, 0.172]}>
              <sphereGeometry args={[0.014, 8, 6]} />
              <meshStandardMaterial color="#241c18" roughness={0.3} />
            </mesh>
            <mesh position={[-0.07, 0.14, 0.1]} rotation={[0, 0, 0.35]}>
              <boxGeometry args={[0.045, 0.012, 0.01]} />
              <meshStandardMaterial color="#6a4a3c" />
            </mesh>
            <mesh position={[0.07, 0.14, 0.1]} rotation={[0, 0, -0.35]}>
              <boxGeometry args={[0.045, 0.012, 0.01]} />
              <meshStandardMaterial color="#6a4a3c" />
            </mesh>
            <mesh position={[0, 0.02, 0.16]} rotation={[0.4, 0, 0]} scale={[1, 0.45, 0.5]}>
              <torusGeometry args={[0.032, 0.007, 6, 10, Math.PI]} />
              <meshStandardMaterial color="#c47b68" roughness={0.5} />
            </mesh>
            <mesh position={[-0.1, 0.04, 0.1]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial color="#e7a090" transparent opacity={0.55} />
            </mesh>
            <mesh position={[0.1, 0.04, 0.1]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial color="#e7a090" transparent opacity={0.55} />
            </mesh>
            </group>
            <group ref={leftArm} position={[-0.24, 0.18, 0]}>
              <mesh position={[0, -0.14, 0]} castShadow>
                <capsuleGeometry args={[0.055, 0.14, 4, 8]} />
                <meshStandardMaterial color={cloth} roughness={0.62} />
              </mesh>
            </group>
            <group ref={rightArm} position={[0.24, 0.18, 0]}>
              <mesh position={[0, -0.14, 0]} castShadow>
                <capsuleGeometry args={[0.055, 0.14, 4, 8]} />
                <meshStandardMaterial color={cloth} roughness={0.62} />
              </mesh>
              {agent.holding?.kind === "snack" && (
                <mesh position={[0.02, -0.28, 0.08]}>
                  <sphereGeometry args={[0.06, 12, 10]} />
                  <meshStandardMaterial color={agent.holding.label.includes("cookie") ? "#c48a45" : "#e07a3d"} />
                </mesh>
              )}
              {agent.holding?.kind === "book" && (
                <mesh position={[0.02, -0.22, 0.1]} rotation={[0.4, 0.2, 0]}>
                  <boxGeometry args={[0.16, 0.03, 0.12]} />
                  <meshStandardMaterial color="#f4efe4" />
                </mesh>
              )}
            </group>
          </group>
          <group ref={leftLeg} position={[-0.08, -0.04, 0]} rotation={[0, 0.08, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
              <meshStandardMaterial color={clothDark} roughness={0.7} />
            </mesh>
          </group>
          <group ref={rightLeg} position={[0.08, -0.04, 0]} rotation={[0, -0.08, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
              <meshStandardMaterial color={clothDark} roughness={0.7} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  );
}

"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, CanvasTexture, SRGBColorSpace } from "three";
import { C, Chunk } from "./furniture-kit";

function glowMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const paint = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  paint.addColorStop(0, "rgba(255, 226, 170, 0.95)");
  paint.addColorStop(0.45, "rgba(255, 160, 70, 0.28)");
  paint.addColorStop(1, "rgba(255, 140, 40, 0)");
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 64, 64);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

export function LampHalo() {
  const map = useMemo(() => glowMap(), []);
  useEffect(() => () => map?.dispose(), [map]);
  if (!map) return null;
  return (
    <sprite position={[0, 1.28, 0.02]} scale={[1.15, 1.15, 1]}>
      <spriteMaterial map={map} transparent opacity={0.72} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </sprite>
  );
}

export function SwitchPlate({ on }: { on: boolean }) {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.14, 0.2, 0.04]} />
        <meshStandardMaterial color="#f4efe6" roughness={0.55} />
      </mesh>
      <mesh position={[0, on ? 0.03 : -0.03, 0.03]}>
        <boxGeometry args={[0.035, 0.07, 0.02]} />
        <meshStandardMaterial color={on ? "#e7b15a" : "#4a3424"} emissive={on ? "#ffb15a" : "#000"} emissiveIntensity={on ? 0.35 : 0} />
      </mesh>
    </group>
  );
}

export function TableSet() {
  return (
    <group>
      <Chunk position={[0, 0.36, 0]} args={[0.08, 0.36, 0.08]} color={C.wood} radius={0.02} />
      <Chunk position={[0, 0.56, 0]} args={[0.78, 0.06, 0.52]} color="#d9d3c8" radius={0.02} roughness={0.4} />
      <SeatChair position={[0, 0, -0.42]} yaw={0} />
      <SeatChair position={[0, 0, 0.42]} yaw={Math.PI} />
    </group>
  );
}

export function SeatChair({ position = [0, 0, 0] as [number, number, number], yaw = 0 }: { position?: [number, number, number]; yaw?: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <Chunk position={[0, 0.22, 0]} args={[0.34, 0.08, 0.34]} color={C.sofa} radius={0.04} />
      <Chunk position={[0, 0.46, -0.14]} args={[0.34, 0.36, 0.08]} color={C.sofa} radius={0.04} />
      <Chunk position={[-0.12, 0.1, -0.1]} args={[0.04, 0.2, 0.04]} color={C.wood} radius={0.01} />
      <Chunk position={[0.12, 0.1, -0.1]} args={[0.04, 0.2, 0.04]} color={C.wood} radius={0.01} />
      <Chunk position={[-0.12, 0.1, 0.1]} args={[0.04, 0.2, 0.04]} color={C.wood} radius={0.01} />
      <Chunk position={[0.12, 0.1, 0.1]} args={[0.04, 0.2, 0.04]} color={C.wood} radius={0.01} />
    </group>
  );
}

export function Wardrobe({ open = false }: { open?: boolean }) {
  const slide = open ? 0.18 : 0;
  return (
    <group>
      <Chunk position={[0, 0.85, 0]} args={[0.56, 1.6, 0.4]} color={C.wood} radius={0.03} />
      <mesh position={[-0.16 - slide, 0.9, 0.21 + slide]}>
        <boxGeometry args={[0.28, 1.35, 0.02]} />
        <meshStandardMaterial color="#6b4a32" roughness={0.7} />
      </mesh>
      <mesh position={[0.16 + slide, 0.9, 0.21 + slide]}>
        <boxGeometry args={[0.28, 1.35, 0.02]} />
        <meshStandardMaterial color="#6b4a32" roughness={0.7} />
      </mesh>
      <mesh position={[-0.04, 0.9, 0.23]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color={C.brass} metalness={0.5} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function DogBed() {
  return (
    <group>
      <Chunk position={[0, 0.06, 0]} args={[0.55, 0.08, 0.4]} color="#c47b5a" radius={0.04} />
      <Chunk position={[0, 0.1, 0]} args={[0.42, 0.06, 0.28]} color="#f3e6d4" radius={0.04} />
    </group>
  );
}

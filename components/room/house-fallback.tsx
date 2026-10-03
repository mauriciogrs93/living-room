"use client";

import { Component, useEffect, type ReactNode } from "react";
import { FLOORS, HOUSE } from "@/lib/room/layout";
import type { PublicAgent } from "@/lib/room/types";

/**
 * Flat three-floor house used when WebGL cannot paint the dollhouse.
 * It stays in the main bundle so a failed room-canvas chunk still has a house.
 */
export function HouseFallback({ agents = [] }: { agents?: PublicAgent[] }) {
  useEffect(() => {
    performance.mark("house-css");
  }, []);
  return (
    <div className="room-stage flex h-full w-full items-center justify-center px-5 pt-16 pb-24">
      <div className="w-full max-w-[340px]" aria-label="The living room">
        <div className="mx-auto h-8 w-[84%] rounded-t-[48px] bg-[#6e4328] shadow-[inset_0_-10px_0_#4a2e1c]" />
        <div className="overflow-hidden rounded-[18px] border-[10px] border-[#5c3a24] bg-[#c4a07a] shadow-[0_22px_48px_rgba(0,0,0,0.38)]">
          <Bedroom agents={agents} />
          <Living agents={agents} />
          <Kitchen agents={agents} />
        </div>
      </div>
    </div>
  );
}

function floorOf(z: number) {
  let best = 0;
  let score = Infinity;
  FLOORS.forEach((floor, index) => {
    const mid = (floor.z0 + floor.z1) / 2;
    const dist = Math.abs(z - mid);
    if (dist < score) {
      score = dist;
      best = index;
    }
  });
  return best;
}

function People({ agents, floor }: { agents: PublicAgent[]; floor: number }) {
  const here = agents.filter((agent) => floorOf(agent.position.z) === floor);
  return (
    <>
      {here.map((agent) => {
        const span = HOUSE.x1 - HOUSE.x0;
        const left = ((agent.position.x - HOUSE.x0) / span) * 100;
        return (
          <span
            key={agent.id}
            className="absolute bottom-1 z-10 grid size-6 place-items-center rounded-full text-[13px] shadow"
            style={{ left: `clamp(4%, ${left}%, 86%)`, background: agent.color }}
            title={agent.name}
          >
            {agent.emoji}
          </span>
        );
      })}
    </>
  );
}

function Bedroom({ agents }: { agents: PublicAgent[] }) {
  return (
    <div className="relative h-[108px] border-b-[6px] border-[#5c3a24] bg-[#f3e2cf]">
      <div className="absolute top-3 left-3 h-14 w-16 rounded-sm border-4 border-[#f7f1e6] bg-[#9ec4de]" />
      <div className="absolute right-3 bottom-2 h-8 w-[46%] rounded-t-md bg-[#f7f1e6] shadow" />
      <div className="absolute right-4 bottom-7 h-3 w-[38%] rounded-sm bg-[#a8483c]" />
      <div className="absolute bottom-2 left-[38%] h-10 w-3 rounded-full bg-[#b8894a]" />
      <div className="absolute bottom-10 left-[34%] h-5 w-8 rounded-full bg-[#f6e2c0]" />
      <People agents={agents} floor={2} />
    </div>
  );
}

function Living({ agents }: { agents: PublicAgent[] }) {
  return (
    <div className="relative h-[118px] border-b-[6px] border-[#5c3a24] bg-[#f6efe4]">
      <div className="absolute inset-x-6 bottom-2 h-8 rounded-sm bg-[#c45c4e]/80" />
      <div className="absolute bottom-4 left-4 h-10 w-[48%] rounded-t-2xl bg-[#6e9a86]" />
      <div className="absolute bottom-12 left-7 h-4 w-8 rounded-sm bg-[#fffaf4]" />
      <div className="absolute top-3 right-3 h-12 w-16 rounded-sm bg-[#2a2624]" />
      <div className="absolute top-4 right-4 h-8 w-12 rounded-sm bg-[#243044]" />
      <div className="absolute right-20 bottom-3 h-12 w-3 rounded-full bg-[#b56848]" />
      <div className="absolute right-[4.6rem] bottom-12 h-6 w-8 rounded-full bg-[#3f7a52]" />
      <People agents={agents} floor={1} />
    </div>
  );
}

function Kitchen({ agents }: { agents: PublicAgent[] }) {
  return (
    <div className="relative h-[108px] bg-[#efe2d2]">
      <div className="absolute inset-x-0 top-0 h-5 bg-[#d7c4a8]" />
      <div className="absolute top-5 right-3 h-16 w-10 rounded-sm bg-[#f4f7f6] shadow" />
      <div className="absolute top-8 right-4 h-6 w-7 rounded-sm bg-[#d5ddd8]" />
      <div className="absolute bottom-2 left-3 h-8 w-[42%] rounded-sm bg-[#8a5a36]" />
      <div className="absolute bottom-8 left-6 size-4 rounded-full bg-[#c45c4e]" />
      <div className="absolute bottom-9 left-12 size-3 rounded-full bg-[#f6e2c0]" />
      <People agents={agents} floor={0} />
    </div>
  );
}

export class RoomStageBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { down: boolean }> {
  state = { down: false };

  static getDerivedStateFromError() {
    return { down: true };
  }

  render() {
    if (this.state.down) return this.props.fallback;
    return this.props.children;
  }
}

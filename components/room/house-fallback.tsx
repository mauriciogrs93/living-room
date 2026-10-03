"use client";

import { Component, useEffect, type ReactNode } from "react";
import { FLOORS, HOUSE } from "@/lib/room/layout";
import type { PublicAgent } from "@/lib/room/types";
import { mutedHex } from "./maquette/color";

/**
 * Flat three-floor house used when WebGL cannot paint the dollhouse, drawn as a maquette section:
 * plaster storeys on a birch plinth, oak and linen furniture blocks, plaster figures in each agent's muted colour.
 * It stays in the main bundle so a failed room-canvas chunk still has a house.
 */
export function HouseFallback({ agents = [] }: { agents?: PublicAgent[] }) {
  useEffect(() => {
    performance.mark("house-css");
  }, []);
  return (
    <div className="room-stage flex h-full w-full items-center justify-center px-5 pt-16 pb-24">
      <figure className="fb-house" aria-label="The living room">
        <div className="fb-storey">
          <Bedroom agents={agents} />
        </div>
        <div className="fb-storey">
          <Living agents={agents} />
        </div>
        <div className="fb-storey">
          <Kitchen agents={agents} />
        </div>
        <div className="fb-plinth" />
        <figcaption className="fb-caption">FIG. 1 · THE LIVING ROOM · SECTION A–A</figcaption>
      </figure>
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
          <span key={agent.id} className="fb-figure" style={{ left: `clamp(6%, ${left}%, 88%)` }} title={agent.name}>
            <i className="fb-head" />
            <i className="fb-body" style={{ background: mutedHex(agent.color) }} />
            <b className="fb-name">{agent.name}</b>
          </span>
        );
      })}
    </>
  );
}

function Bedroom({ agents }: { agents: PublicAgent[] }) {
  return (
    <div className="fb-room">
      <i className="fb-block fb-window" style={{ left: "6%", top: "18%", width: "16%", height: "40%" }} />
      <i className="fb-block" style={{ right: "8%", bottom: 0, width: "40%", height: "22%", background: "#D6C5A9" }} />
      <i className="fb-block" style={{ right: "8%", bottom: "22%", width: "38%", height: "10%", background: "#E2DDD5" }} />
      <i className="fb-block" style={{ right: "40%", bottom: "22%", width: "8%", height: "10%", background: "#B8674E" }} />
      <i className="fb-block" style={{ left: "30%", bottom: 0, width: "3px", height: "58%", background: "#2D3136" }} />
      <i className="fb-block" style={{ left: "27%", bottom: "54%", width: "22px", height: "14px", background: "#E2DDD5" }} />
      <People agents={agents} floor={2} />
    </div>
  );
}

function Living({ agents }: { agents: PublicAgent[] }) {
  return (
    <div className="fb-room">
      <i className="fb-block" style={{ left: "8%", bottom: 0, width: "44%", height: "26%", background: "#E2DDD5" }} />
      <i className="fb-block" style={{ left: "8%", bottom: "26%", width: "44%", height: "14%", background: "#D3CCC0" }} />
      <i className="fb-block" style={{ right: "10%", top: "22%", width: "26%", height: "30%", background: "#2D3136" }} />
      <i className="fb-block" style={{ right: "8%", bottom: 0, width: "30%", height: "18%", background: "#66574B" }} />
      <i className="fb-block" style={{ left: "58%", bottom: 0, width: "9%", height: "14%", background: "#B8674E", borderRadius: "2px 2px 3px 3px" }} />
      <i className="fb-block" style={{ left: "58.5%", bottom: "14%", width: "8%", height: "18%", background: "#A7AD9C", borderRadius: "50% 50% 30% 30%" }} />
      <People agents={agents} floor={1} />
    </div>
  );
}

function Kitchen({ agents }: { agents: PublicAgent[] }) {
  return (
    <div className="fb-room">
      <i className="fb-block" style={{ left: "4%", bottom: 0, width: "54%", height: "34%", background: "#D6C5A9" }} />
      <i className="fb-block" style={{ left: "4%", bottom: "34%", width: "54%", height: "5%", background: "#EEEAE3" }} />
      <i className="fb-block" style={{ right: "6%", bottom: 0, width: "16%", height: "70%", background: "#EFECE6", border: "1px solid rgba(45,49,54,.18)" }} />
      <i className="fb-block fb-window" style={{ right: "26%", top: "16%", width: "20%", height: "34%" }} />
      <i className="fb-block" style={{ left: "30%", bottom: "39%", width: "6%", height: "9%", background: "#B89758", borderRadius: "40% 40% 2px 2px" }} />
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

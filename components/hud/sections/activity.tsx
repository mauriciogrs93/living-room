"use client";

import Link from "next/link";
import type { PublicAgent } from "@/lib/room/types";
import type { LiveSnapshot } from "@/components/use-room";
import { DiaryList } from "@/components/room/house-ui";
import { OwnerActivity } from "@/components/room/owner-notes";
import { BringYourAgent } from "@/components/invite-copy";
import type { HudModel } from "../model";
import { ACTIVITY_LIMIT } from "../tokens";
import { mutedHex } from "@/components/room/maquette/color";

export function ActivitySection({ model }: { model: HudModel }) {
  const agents = model.snapshot?.agents ?? [];
  const events = [...(model.snapshot?.events ?? [])].reverse().slice(0, ACTIVITY_LIMIT);
  const selected = agents.find((agent) => agent.id === model.selectedId) ?? null;

  return (
    <div className="hud-stack">
      <p className="hud-kicker">In the house</p>
      {selected && (
        <div className="hud-person">
          <p>
            <span className="hud-swatch is-inline" style={{ background: mutedHex(selected.color) }} aria-hidden /> {selected.name}
          </p>
          <p className="hud-quiet">{selected.status}</p>
          {selected.speech && <p className="hud-quiet">“{selected.speech.text}”</p>}
          <button type="button" className="hud-text" onClick={() => model.selectAgent(selected.id)}>
            Close
          </button>
        </div>
      )}
      <AgentList agents={agents} selectedId={model.selectedId} onFocus={model.selectAgent} />
      <StatusLine snapshot={model.snapshot} />
      <p className="hud-kicker">Latest</p>
      <OwnerActivity events={events} now={model.now} />
      <button type="button" className="hud-chip" onClick={() => model.setDiaryOpen(!model.diaryOpen)}>
        {model.diaryOpen ? "Hide the diary" : "Open the diary"}
      </button>
      {model.diaryOpen && <DiaryList lines={model.snapshot?.diary ?? []} now={model.now} />}
      <button type="button" className="hud-chip" onClick={model.openBooks}>
        Read the shelf
      </button>
      <p className="hud-kicker">Bring your agent</p>
      <BringYourAgent variant="hud" />
      <Link href="/" className="hud-text">
        Front door
      </Link>
    </div>
  );
}

function AgentList({
  agents,
  selectedId,
  onFocus,
}: {
  agents: PublicAgent[];
  selectedId: string | null;
  onFocus: (id: string | null) => void;
}) {
  if (agents.length === 0) return <p className="hud-quiet">No one's home right now.</p>;
  return (
    <ul className="hud-people">
      {agents.map((agent) => (
        <li key={agent.id}>
          <button
            type="button"
            className={`hud-person-btn${agent.id === selectedId ? " is-on" : ""}`}
            onClick={() => onFocus(agent.id)}
          >
            <span className="hud-swatch" style={{ background: mutedHex(agent.color) }} />
            <span>
              <span className="hud-line">
                {agent.name}
              </span>
              <span className="hud-quiet">{agent.status}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusLine({ snapshot }: { snapshot: LiveSnapshot | null }) {
  if (!snapshot) return null;
  const find = (id: string) => snapshot.objects.find((object) => object.id === id);
  const tv = find("tv");
  const lamp = find("lamp");
  const bits = [
    tv ? (tv.state.power ? `TV ${String(tv.state.channelName ?? "on")}` : "TV off") : null,
    lamp ? (lamp.state.on ? "Lamp on" : "Lamp off") : null,
    snapshot.radio?.on ? snapshot.radio.name : null,
    snapshot.dog ? `Dog ${snapshot.dog.mood}` : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return <p className="hud-quiet">{bits.join("  ·  ")}</p>;
}

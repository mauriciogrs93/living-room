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
import { orderAgents } from "@/lib/room/activity-pin";
import { walkedInLine } from "@/lib/room/name-tags";
import { CLOSE } from "../frame/strings";

function uniqueAgents(agents: PublicAgent[]) {
  const seen = new Set<string>();
  const rows: PublicAgent[] = [];
  for (const agent of agents) {
    if (!agent.id || seen.has(agent.id)) continue;
    seen.add(agent.id);
    rows.push(agent);
  }
  return rows;
}

export function ActivitySection({ model, watcher = false }: { model: HudModel; watcher?: boolean }) {
  const agents = orderAgents(uniqueAgents(model.snapshot?.agents ?? []), model.selectedId);
  const events = [...(model.snapshot?.events ?? [])].reverse().slice(0, ACTIVITY_LIMIT);

  return (
    <div className="hud-stack">
      <p className="hud-kicker">In the house</p>
      <AgentList agents={agents} selectedId={model.selectedId} onFocus={model.selectAgent} />
      <StatusLine snapshot={model.snapshot} />
      <p className="hud-kicker">Latest</p>
      <OwnerActivity events={events} now={model.now} />
      {watcher ? null : (
        <>
          <button type="button" className="hud-chip" data-ctl="activity-diary" onClick={() => model.setDiaryOpen(!model.diaryOpen)}>
            {model.diaryOpen ? "Hide the diary" : "Open the diary"}
          </button>
          {model.diaryOpen && <DiaryList lines={model.snapshot?.diary ?? []} now={model.now} />}
          <button type="button" className="hud-chip" data-ctl="activity-books" onClick={model.openBooks}>
            Read the shelf
          </button>
        </>
      )}
      {watcher ? null : (
        <>
          <p className="hud-kicker">Bring your agent</p>
          <BringYourAgent variant="hud" />
          <Link href="/" className="hud-text" data-ctl="activity-door">
            Front door
          </Link>
        </>
      )}
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
  onFocus: (id: string | null, keepOpen?: boolean) => void;
}) {
  if (agents.length === 0) return <p className="hud-quiet">No one's home right now.</p>;
  return (
    <ul className="hud-people">
      {agents.map((agent) => {
        const pinned = agent.id === selectedId;
        const status = agent.status === "just walked in" ? walkedInLine(agent.name) : agent.status;
        return (
          <li key={agent.id} className={pinned ? "is-pin" : undefined}>
            <button
              type="button"
              className={`hud-person-btn${pinned ? " is-on is-open" : ""}`}
              data-ctl="activity-agent"
              {...(pinned ? { "data-activity-pin": "" } : {})}
              onClick={() => onFocus(agent.id)}
            >
              <span className="hud-swatch" style={{ background: mutedHex(agent.color) }} />
              <span>
                <span className="hud-line">{agent.name}</span>
                <span className="hud-quiet">{status}</span>
                {pinned && agent.speech ? <span className="hud-quiet">“{agent.speech.text}”</span> : null}
              </span>
            </button>
            {pinned ? (
              <button type="button" className="hudf-x" data-ctl="activity-close" aria-label={CLOSE} onClick={() => onFocus(null, true)}>
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </li>
        );
      })}
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

"use client";

import { useState } from "react";
import { doorAct, useDoor } from "@/components/room/door-client";
import { inviteLine } from "@/lib/join-line";
import type { HudModel } from "../model";

function ago(at: number, now: number) {
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export function DoorSection({ model }: { model: HudModel }) {
  const door = useDoor();
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  if (!door) return <p className="hud-quiet">Checking the door…</p>;
  const origin = model.origin || (typeof window !== "undefined" ? window.location.origin : "");
  const line = door.joinLine || inviteLine(origin, door.invite);

  async function run(action: string, id = "") {
    setNote("");
    const result = await doorAct(action, id);
    setNote(result.ok ? result.message : result.error);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
    } catch {
      setCopied(false);
      setNote("Couldn't copy. Select the line and copy it.");
    }
  }

  return (
    <div className="hud-stack" data-door-section="">
      <div className="hud-row">
        <p className="hud-kicker">Door · {door.locked ? "locked" : "open"}</p>
        <button type="button" className="hud-chip" onClick={() => void run(door.locked ? "unlock" : "lock")}>
          {door.locked ? "Unlock" : "Lock"}
        </button>
      </div>
      <p className="hud-line" data-invite-line="">
        {line}
      </p>
      <div className="hud-row" style={{ flexWrap: "wrap" }}>
        <button type="button" className="hud-chip is-solid" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="hud-chip" onClick={() => void run("reset-invite")}>
          New invite
        </button>
      </div>
      <p className="hud-kicker">Knocking</p>
      {door.knocks.length === 0 && <p className="hud-quiet">No one is at the door.</p>}
      {door.knocks.map((knock) => (
        <div className="hud-person" key={knock.id} data-knock={knock.name}>
          <span aria-hidden>{knock.emoji}</span>
          <div className="hud-stack">
            <p className="hud-line" style={{ color: knock.color }}>
              {knock.name}
            </p>
            {knock.note ? <p className="hud-quiet">{knock.note}</p> : null}
            <p className="hud-quiet">{ago(knock.at, model.now)}</p>
            <div className="hud-row" style={{ flexWrap: "wrap" }}>
              <button type="button" className="hud-chip is-solid" onClick={() => void run("admit", knock.id)}>
                Let in once
              </button>
              <button type="button" className="hud-chip" onClick={() => void run("trust", knock.id)}>
                Always let in
              </button>
              <button type="button" className="hud-chip" onClick={() => void run("decline", knock.id)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ))}
      <p className="hud-kicker">Trusted</p>
      {door.trusted.length === 0 && <p className="hud-quiet">No one is trusted yet.</p>}
      {door.trusted.map((person) => (
        <div className="hud-row" key={person.id}>
          <p className="hud-line">
            {person.emoji} {person.name}
          </p>
          <button type="button" className="hud-chip" onClick={() => void run("untrust", person.id)}>
            Remove
          </button>
        </div>
      ))}
      <p className="hud-kicker">Blocked</p>
      {door.blocked.length === 0 && <p className="hud-quiet">No one is blocked.</p>}
      {door.blocked.map((person) => (
        <div className="hud-row" key={person.id}>
          <p className="hud-line">
            {person.emoji} {person.name}
          </p>
          <button type="button" className="hud-chip" onClick={() => void run("unblock", person.id)}>
            Unblock
          </button>
        </div>
      ))}
      {note ? <p className="hud-quiet">{note}</p> : null}
    </div>
  );
}

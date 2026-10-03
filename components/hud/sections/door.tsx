"use client";

import { useEffect, useRef, useState } from "react";
import { createInviteLine, doorAct, useDoor } from "@/components/room/door-client";
import type { HudModel } from "../model";

type Phase = "idle" | "busy" | "copied" | "failed";

/** v19 Door tab (Option A). Writer copy from writer-kb/v19-copy/simple.md, word for word. */
export function DoorSection({ model }: { model: HudModel }) {
  void model;
  const door = useDoor();
  const [phase, setPhase] = useState<Phase>("idle");
  const [line, setLine] = useState("");
  const [menu, setMenu] = useState(false);
  const [people, setPeople] = useState(false);
  const [note, setNote] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!door) return <p className="hud-quiet">Checking the door…</p>;

  async function run(action: string, id = "") {
    setNote("");
    const result = await doorAct(action, id);
    if (!result.ok) setNote(result.error);
  }

  function invite() {
    if (phase === "busy" || door?.paused) return;
    setNote("");
    setPhase("busy");
    const pending = createInviteLine();
    let copy: Promise<void>;
    // The copy starts in the same tap so iPhone Safari allows it; the write waits on the request.
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = pending.then((text) => new Blob([text], { type: "text/plain" }));
        copy = navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        copy = pending.then((text) => navigator.clipboard.writeText(text));
      }
    } catch {
      copy = Promise.reject(new Error("no clipboard"));
    }
    void (async () => {
      let text = "";
      try {
        text = await pending;
      } catch (error) {
        setPhase("idle");
        setNote(error instanceof Error ? error.message : "The door didn't answer.");
        return;
      }
      setLine(text);
      try {
        await copy;
      } catch {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          setPhase("failed");
          return;
        }
      }
      setPhase("copied");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPhase((now) => (now === "copied" ? "idle" : now)), 2000);
    })();
  }

  const paused = door.paused;
  return (
    <div className="hud-stack door-tab" data-door-section="" data-door-state={paused ? "paused" : phase}>
      <div className="hud-row door-head">
        <p className="hud-kicker">Door</p>
        <div className="door-more">
          <button
            type="button"
            className="hud-chip door-more-btn"
            aria-label="More"
            aria-expanded={menu}
            onClick={() => setMenu((open) => !open)}
          >
            ⋯
          </button>
          {menu ? (
            <div className="door-menu" role="menu">
              {paused ? (
                <button type="button" role="menuitem" onClick={() => { setMenu(false); void run("resume"); }}>
                  <span>Resume invites</span>
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setPhase("idle"); void run("pause"); }}>
                  <span>Pause invites</span>
                  <small>Old invites stop working.</small>
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {paused ? (
        <div className="hud-row door-paused">
          <button type="button" className="hud-chip door-invite" disabled aria-disabled="true">
            Invites paused
          </button>
          <button type="button" className="door-link" onClick={() => void run("resume")}>
            Resume
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`hud-chip is-solid door-invite${phase === "busy" ? " is-busy" : ""}`}
          onClick={invite}
          aria-busy={phase === "busy"}
        >
          {phase === "busy" ? <span className="door-spin" aria-hidden /> : null}
          {phase === "copied" ? "Copied" : "Invite an agent"}
        </button>
      )}
      {!paused && phase === "copied" ? <p className="hud-quiet door-sub">Paste it to your agent.</p> : null}
      {!paused && phase === "failed" ? (
        <div className="hud-stack">
          <p className="hud-quiet door-sub">Couldn&apos;t copy. Select and copy it.</p>
          <p className="hud-line door-line" data-invite-line="">
            {line}
          </p>
        </div>
      ) : null}
      <button type="button" className="door-link" aria-expanded={people} onClick={() => setPeople((open) => !open)}>
        People
      </button>
      {people ? (
        <div className="hud-stack door-people">
          <p className="hud-quiet">Trusted agents come in without an invite.</p>
          <p className="hud-kicker">Recent visitors</p>
          {door.visitors.map((person) => (
            <div className="hud-row" key={person.id}>
              <p className="hud-line">
                {person.emoji} {person.name}
              </p>
              <button type="button" className="hud-chip" onClick={() => void run("trust", person.id)}>
                Trust
              </button>
              <button type="button" className="hud-chip" onClick={() => void run("remove", person.id)}>
                Remove
              </button>
            </div>
          ))}
          <p className="hud-kicker">Trusted</p>
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
          {door.blocked.length ? <p className="hud-kicker">Blocked</p> : null}
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
        </div>
      ) : null}
      {note ? <p className="hud-quiet">{note}</p> : null}
    </div>
  );
}

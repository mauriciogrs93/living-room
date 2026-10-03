"use client";

import { useEffect, useRef, useState } from "react";
import { useDoorAccess, useKnockCount } from "@/components/room/door-client";
import { useOwnerChecked, useOwnerPresent, useUnseenReplies } from "@/components/room/owner-notes";
import { useAtmosphere } from "@/components/room/atmosphere";
import { readBadges } from "./badges";
import { useHudHash } from "./hash";
import type { HudModel } from "./model";
import { sectionKnown, visibleSections } from "./registry";
import { LONG_PRESS_MS } from "./tokens";

export function HudChrome({
  model,
  shot,
  setShot,
  night,
}: {
  model: HudModel;
  shot: boolean;
  setShot: (shot: boolean) => void;
  night: boolean;
}) {
  const owner = useOwnerPresent();
  const checked = useOwnerChecked();
  const unseen = useUnseenReplies();
  const knocks = useKnockCount();
  const doorAccess = useDoorAccess();
  const hash = useHudHash(sectionKnown);
  const sections = visibleSections(owner).filter((section) => section.id !== "door" || doorAccess);
  const active = sections.find((section) => section.id === hash.section) ?? null;
  const [drag, setDrag] = useState(0);
  const pull = useRef<{ y: number; dy: number } | null>(null);
  const { label, clock, place } = useAtmosphere();
  const hold = useRef<{ timer: number; fired: boolean } | null>(null);

  useEffect(() => {
    if (!checked) return;
    if (hash.section && !visibleSections(owner).some((section) => section.id === hash.section)) hash.close();
  }, [checked, owner, hash.section, hash.close]);

  const marks = readBadges({ agents: model.snapshot?.agents.length ?? 0, unseen, owner });
  const live = marks.find((mark) => mark.id === "live")?.mark;
  const mail = marks.some((mark) => mark.id === "mail");
  const count = live?.count ?? 0;

  function openCard() {
    const next = hash.section && sections.some((section) => section.id === hash.section) ? hash.section : sections[0]?.id;
    if (next) hash.open(next);
  }

  function pointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (hold.current) window.clearTimeout(hold.current.timer);
    const timer = window.setTimeout(() => {
      if (!hold.current) return;
      hold.current.fired = true;
      setShot(true);
      hash.close();
    }, LONG_PRESS_MS);
    hold.current = { timer, fired: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerUp() {
    const press = hold.current;
    hold.current = null;
    if (!press) return;
    window.clearTimeout(press.timer);
    if (press.fired) return;
    if (shot) {
      setShot(false);
      return;
    }
    if (active) hash.close();
    else openCard();
  }

  function pointerCancel() {
    if (!hold.current) return;
    window.clearTimeout(hold.current.timer);
    hold.current = null;
  }

  function gripDown(event: React.PointerEvent<HTMLDivElement>) {
    pull.current = { y: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function gripMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pull.current) return;
    const dy = Math.max(0, event.clientY - pull.current.y);
    pull.current.dy = dy;
    setDrag(dy);
  }
  function gripUp() {
    const dy = pull.current?.dy ?? 0;
    pull.current = null;
    setDrag(0);
    if (dy > 48) hash.close();
  }

  const View = active?.render;

  return (
    <>
      {active && View && (
        <section
          className="hud-card"
          data-hud-card=""
          style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
          aria-label="Room"
        >
          <div
            className="hud-grip"
            onPointerDown={gripDown}
            onPointerMove={gripMove}
            onPointerUp={gripUp}
            onPointerCancel={gripUp}
          />
          {/* a drawing title block */}
          <div className="hud-tb-row">
            <span>LR–01</span>
            <span>SECTION A–A</span>
            <span>1:50</span>
          </div>
          <h2 className="hud-display">The Living Room</h2>
          <div className="hud-tb-row is-muted">
            <span>{[place, label, clock].filter(Boolean).join(" · ").toUpperCase()}</span>
            <span>
              {count} {count === 1 ? "AGENT" : "AGENTS"}
            </span>
          </div>
          <div className="hud-tabs" role="tablist">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={section.id === active.id}
                className={section.id === active.id ? "is-on" : ""}
                onClick={() => hash.open(section.id)}
              >
                {section.title.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="hud-card-body">
            <View model={model} />
          </div>
        </section>
      )}
      <button
        type="button"
        className={`hud-fab${night ? " is-night" : ""} is-count`}
        data-hud="fab"
        aria-label={
          shot
            ? "Show the news tape"
            : `${count} here${knocks > 0 ? `, ${knocks} at the door` : ""}`
        }
        aria-pressed={Boolean(active)}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className={`hud-live${live?.tone === "on" ? " is-on" : ""}`} />
        <span className="hud-here">{count} HERE</span>
        {knocks > 0 ? (
          <span key={knocks} className="hud-count" data-door-badge={knocks} aria-label={`${knocks} at the door`}>
            {knocks > 9 ? "9+" : knocks}
          </span>
        ) : null}
        {mail ? <span className="hud-mail" aria-label="Unread reply" /> : null}
      </button>
    </>
  );
}

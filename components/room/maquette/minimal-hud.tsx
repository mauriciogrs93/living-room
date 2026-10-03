"use client";

/**
 * MOCKUP ONLY (?hud=minimal): the Founder's "minimal control frame", drawn as an overlay owned by the room so no hud/
 * file is touched. Nothing is permanently on screen except a slim ticker line (fades to 20% while idle) and one small
 * "N here" pill, which expands into a bottom sheet with People / Tonight / Door tabs. Gestures: tap a room to zoom to
 * that floor, tap a person to follow them, tap empty space or swipe down to go back. Day/night follows real time.
 * Plaster + graphite, 1px hairlines, 44px hit areas, and the sheet is measured by the camera fit so it never covers the
 * house. URL states for renders: &sheet=people|tonight|door, &follow=<agent id or name>.
 */
import { useEffect, useRef, useState } from "react";
import type { PublicAgent } from "@/lib/room/types";
import { FLOORS, stagePose } from "@/lib/room/layout";

export type MiniFloor = "kitchen" | "living" | "bedroom";
const NAMES: MiniFloor[] = ["kitchen", "living", "bedroom"];
const ROOM_LABEL: Record<MiniFloor, string> = { kitchen: "Kitchen", living: "Living room", bedroom: "Bedroom · study" };

export function minimalHud() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hud") === "minimal";
}

export function floorOfY(y: number): MiniFloor {
  let index = 0;
  FLOORS.forEach((floor, i) => {
    if (y >= floor.y - 0.15) index = i;
  });
  return NAMES[Math.min(index, NAMES.length - 1)];
}

export function floorOfAgent(agent: PublicAgent): MiniFloor {
  return floorOfY(stagePose(0, agent.position.z).y + 0.2);
}

type Tab = "people" | "tonight" | "door";
type News = { title: string; source: string };

const CSS = `
.room-root .hud-fab, .room-root .hud-card, .room-root .global-tape-meta { display: none !important; }
.room-root .global-tape { height: 30px; background: transparent !important; border-bottom: 1px solid var(--hud-rule) !important;
  box-shadow: none !important; transition: opacity 700ms ease; backdrop-filter: none !important; }
.room-root .global-tape-flag { border: 0 !important; background: transparent !important; font-size: 10px; }
.room-root .global-tape-line { font-size: 13px; }
html.mini-idle .room-root .global-tape { opacity: 0.2; }
.mini-pill { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom));
  z-index: 40; height: 44px; display: inline-flex; align-items: center; gap: 9px; padding: 0 18px; border-radius: 22px;
  border: 1px solid var(--hud-rule-strong); background: var(--hud-paper); color: var(--hud-ink);
  font: 500 11px/1 var(--mono); letter-spacing: 0.12em; box-shadow: var(--hud-shadow); cursor: pointer; white-space: nowrap; }
.mini-pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--hud-accent); }
.mini-pill b { font-weight: 500; }
.mini-pill .mini-x { margin-left: 4px; width: 44px; height: 44px; margin-right: -18px; display: inline-flex; align-items: center;
  justify-content: center; border-left: 1px solid var(--hud-rule); font-size: 13px; letter-spacing: 0; }
.mini-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 41; max-height: min(44dvh, 380px);
  padding: 6px max(16px, env(safe-area-inset-left)) calc(14px + env(safe-area-inset-bottom));
  background: var(--hud-paper); color: var(--hud-ink); border-top: 1px solid var(--hud-rule-strong);
  border-radius: 14px 14px 0 0; box-shadow: 0 -8px 24px rgba(43,45,49,0.08); font-family: var(--sans); touch-action: none; overflow: auto; }
.mini-grip { display: block; width: 100%; height: 22px; background: none; border: 0; cursor: grab; }
.mini-grip::before { content: ""; display: block; margin: 7px auto 0; width: 36px; height: 3px; border-radius: 2px; background: var(--hud-rule-strong); }
.mini-tabs { display: flex; border-bottom: 1px solid var(--hud-rule); margin-bottom: 4px; }
.mini-tabs button { flex: 1; height: 44px; background: none; border: 0; color: var(--hud-muted); font: 500 11px/1 var(--mono);
  letter-spacing: 0.12em; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border-bottom: 1px solid transparent; margin-bottom: -1px; cursor: pointer; }
.mini-tabs button[aria-selected="true"] { color: var(--hud-ink); border-bottom-color: var(--hud-ink); }
.mini-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 4px; background: var(--hud-accent); color: #f7f5f0;
  border: 1px solid rgba(45,49,54,0.18); font: 500 11px/18px var(--mono); letter-spacing: 0; text-align: center; box-sizing: border-box; }
.mini-row { display: flex; align-items: center; gap: 12px; min-height: 52px; border-bottom: 1px solid var(--hud-rule); }
.mini-row:last-child { border-bottom: 0; }
.mini-dot { width: 9px; height: 9px; border-radius: 2px; flex: none; }
.mini-name { font: 500 15px/1.2 var(--sans); }
.mini-sub { font: 400 12px/1.3 var(--sans); color: var(--hud-muted); margin-top: 2px; }
.mini-grow { flex: 1; min-width: 0; }
.mini-grow .mini-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-btn { min-width: 44px; height: 44px; padding: 0 4px; background: none; border: 0; color: var(--hud-ink);
  font: 500 11px/1 var(--mono); letter-spacing: 0.12em; cursor: pointer; display: inline-flex; align-items: center; }
.mini-btn span { padding: 9px 12px; border: 1px solid var(--hud-rule-strong); border-radius: 4px; }
.mini-btn.is-primary span { background: var(--hud-ink); color: var(--hud-paper); border-color: var(--hud-ink); }
.mini-kicker { font: 500 10px/1 var(--mono); letter-spacing: 0.14em; color: var(--hud-muted); text-transform: uppercase; }
.mini-news { font: 400 14px/1.35 var(--sans); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
`;

function useIdle() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const wake = () => {
      root.classList.remove("mini-idle");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.add("mini-idle"), 3500);
    };
    wake();
    const events = ["pointerdown", "wheel", "scroll", "touchmove", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      root.classList.remove("mini-idle");
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);
}

export function MinimalHud({
  agents,
  selectedId,
  onSelectAgent,
  floor,
  setFloor,
  door,
  radio,
  onTapRadio,
}: {
  radio: { on: boolean; name: string };
  onTapRadio?: () => void;
  agents: PublicAgent[];
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  floor: MiniFloor | null;
  setFloor: (floor: MiniFloor | null) => void;
  door: { locked: boolean; knocks: number };
}) {
  useIdle();
  const [tab, setTab] = useState<Tab | null>(() => {
    if (typeof window === "undefined") return null;
    const s = new URLSearchParams(window.location.search).get("sheet");
    return s === "people" || s === "tonight" || s === "door" ? s : null;
  });
  const [news, setNews] = useState<News[]>([]);
  const drag = useRef<number | null>(null);
  const followed = agents.find((a) => a.id === selectedId) ?? null;

  // a deep link for renders: &follow=basil
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("follow")?.toLowerCase();
    if (!want || selectedId) return;
    const hit = agents.find((a) => a.id.toLowerCase() === want || a.name.toLowerCase() === want);
    if (hit) onSelectAgent(hit.id);
  }, [agents, selectedId, onSelectAgent]);

  // following someone = their floor fills the frame; letting go returns to the whole house
  useEffect(() => {
    if (followed) setFloor(floorOfAgent(followed));
  }, [followed?.id, followed ? floorOfAgent(followed) : null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== "tonight" || news.length) return;
    fetch("/api/news")
      .then((r) => r.json())
      .then((b: { items?: News[] }) => setNews((b.items ?? []).slice(0, 3)))
      .catch(() => {});
  }, [tab, news.length]);

  // the camera re-measures the free area whenever the sheet opens/closes
  useEffect(() => {
    const t = [0, 120, 320].map((ms) => window.setTimeout(() => window.dispatchEvent(new Event("maquette-layout")), ms));
    return () => t.forEach((id) => window.clearTimeout(id));
  }, [tab, followed?.id, floor]);

  // swipe down anywhere on the stage = back (closes the sheet first, then the zoom)
  useEffect(() => {
    let y0: number | null = null;
    const down = (e: PointerEvent) => (y0 = e.clientY);
    const up = (e: PointerEvent) => {
      if (y0 != null && e.clientY - y0 > 70) back();
      y0 = null;
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  });

  function back() {
    if (tab) return setTab(null);
    onSelectAgent(null);
    setFloor(null);
  }

  const here = agents.filter((a) => !a.away).length;

  return (
    <>
      <style>{CSS}</style>
      {!tab && (
        <button
          type="button"
          className="mini-pill"
          aria-label={followed ? `Following ${followed.name}` : `${here} here, open people`}
          onClick={() => setTab("people")}
        >
          <i />
          {followed ? (
            <>
              <b>FOLLOWING {followed.name.toUpperCase()}</b>
              <span
                className="mini-x"
                role="button"
                aria-label="Stop following"
                onClick={(e) => {
                  e.stopPropagation();
                  back();
                }}
              >
                ✕
              </span>
            </>
          ) : floor ? (
            <>
              <b>{ROOM_LABEL[floor].toUpperCase()}</b>
              <span className="mini-x" role="button" aria-label="Whole house" onClick={(e) => (e.stopPropagation(), back())}>
                ✕
              </span>
            </>
          ) : (
            <b>{here} HERE</b>
          )}
          {door.knocks > 0 && !followed && !floor ? <span className="mini-badge">{door.knocks}</span> : null}
        </button>
      )}
      {tab && (
        <section className="mini-sheet" aria-label="Room">
          <button
            type="button"
            className="mini-grip"
            aria-label="Close"
            onClick={() => setTab(null)}
            onPointerDown={(e) => (drag.current = e.clientY)}
            onPointerUp={(e) => {
              if (drag.current != null && e.clientY - drag.current > 30) setTab(null);
              drag.current = null;
            }}
          />
          <div className="mini-tabs" role="tablist">
            {(["people", "tonight", "door"] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t.toUpperCase()}
                {t === "people" ? <span style={{ opacity: 0.6 }}>{here}</span> : null}
                {t === "door" && door.knocks > 0 ? <span className="mini-badge">{door.knocks}</span> : null}
              </button>
            ))}
          </div>
          {tab === "people" &&
            agents.map((a) => (
              <div className="mini-row" key={a.id}>
                <span className="mini-dot" style={{ background: a.color }} />
                <div className="mini-grow">
                  <div className="mini-name">{a.name}</div>
                  <div className="mini-sub">
                    {ROOM_LABEL[floorOfAgent(a)]} · {a.status || "here"}
                  </div>
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    onSelectAgent(a.id);
                    setTab(null);
                  }}
                >
                  <span>FOLLOW</span>
                </button>
              </div>
            ))}
          {tab === "tonight" && (
            <div>
              {/* the house radio lives under Tonight (Founder, Oct 3): station line + PLAY/STOP and NEXT */}
              <div className="mini-row">
                <span className="mini-dot" style={{ background: radio.on ? "var(--hud-accent)" : "var(--hud-idle)", borderRadius: 5 }} />
                <div className="mini-grow">
                  <div className="mini-kicker">Radio</div>
                  <div className="mini-name" style={{ marginTop: 3 }}>
                    {radio.on ? "On" : "Off"} · {radio.name || "Radio Paradise"}
                  </div>
                </div>
                <button type="button" className="mini-btn is-primary" onClick={() => onTapRadio?.()}>
                  <span>{radio.on ? "STOP" : "PLAY"}</span>
                </button>
                <button type="button" className="mini-btn">
                  <span>NEXT</span>
                </button>
              </div>
              {(news.length ? news : [{ title: "The wire is quiet tonight.", source: "Living Room" }]).map((n, i) => (
                <div className="mini-row" key={i} style={{ alignItems: "flex-start", padding: "9px 0" }}>
                  <div className="mini-grow">
                    <div className="mini-kicker">{n.source}</div>
                    <div className="mini-news" style={{ marginTop: 4 }}>{n.title}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "door" && (
            <div>
              <div className="mini-row">
                <span className="mini-dot" style={{ background: door.locked ? "var(--hud-accent)" : "var(--hud-ok-ink)", borderRadius: 5 }} />
                <div className="mini-grow">
                  <div className="mini-name">Front door · {door.locked ? "locked" : "open"}</div>
                  <div className="mini-sub">
                    {door.knocks > 0 ? `${door.knocks} knock${door.knocks === 1 ? "" : "s"} waiting` : "No one at the door"}
                  </div>
                </div>
              </div>
              <div className="mini-row" style={{ justifyContent: "flex-end", gap: 4 }}>
                <button type="button" className="mini-btn">
                  <span>IGNORE</span>
                </button>
                <button type="button" className="mini-btn is-primary">
                  <span>{door.locked ? "LET IN" : "LOCK"}</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { signOut } from "@/components/account/me";
import { useAmbience } from "@/components/room/ambience";
import { useAtmosphere } from "@/components/room/atmosphere";
import { MAQUETTE } from "@/components/room/maquette/config";
import { anchorPoint } from "@/components/hud/anchors";
import type { HudModel } from "@/components/hud/model";
import { onRadioNotice, tapRadio } from "@/components/hud/radio";
import { ActivitySection } from "@/components/hud/sections/activity";
import { DoorSection } from "@/components/hud/sections/door";
import { InviteSection } from "@/components/hud/sections/invite";
import { YouSection } from "@/components/hud/sections/you";
import { OWNER_BADGE, SIGN_OUT, WATCH_LEAVE } from "@/lib/auth/strings";
import { houseClockLabel, houseDateKey, sunriseTime, sunsetTime } from "@/lib/house-clock";
import { CHANNELS, channelById, outsideView } from "@/lib/room/content";
import type { PublicAgent } from "@/lib/room/types";
import { cleanHud, httpLink, httpsUrl } from "./sanitize";
import { YOURS_CARDS, yoursCards } from "./controls";
import {
  ACTION_FAIL,
  ACTIVITY,
  BADGE_WATCH,
  CLOSE,
  COMING_SOON,
  DAY,
  DUSK,
  HERE,
  HERE_EMPTY,
  HOUSE,
  LOOK_OUTSIDE,
  MUTE,
  NEXT,
  NIGHT,
  OFFLINE,
  OPENS_NEW_TAB,
  PLAY,
  PLAYING,
  PLAYS,
  PREVIOUS,
  RADIO_OFF,
  ROOM_SOUND,
  SHOW_CONTROLS,
  STOP,
  STREAM_FAIL,
  SUNRISE,
  SUNSET,
  TITLE_OWNER,
  TITLE_WATCH,
  TODAY_EMPTY,
  TURN_OFF,
  TURN_ON,
  TV_OFF,
  TV_OFF_WATCH,
  UNMUTE,
  WATCH_YOU,
} from "./strings";
import "@/app/hud-frame.css";

const TUCK_MS = 8000;
const SEEN_KEY = "lr-hud-seen";
const TODAY_KEY = "lr-today-seen";

export function frameKnown(id: string) {
  return (
    id === "today" ||
    id === "radio" ||
    id === "tv" ||
    id === "sky" ||
    id === "here" ||
    id === "activity" ||
    id === "invite" ||
    id === "people" ||
    id === "you" ||
    id === "now" ||
    id === "door" ||
    id === "yours-packages" ||
    id === "yours-music" ||
    id === "yours-city"
  );
}

type Role = "owner" | "watch";

type FrameProps = {
  role: Role;
  model: HudModel;
  section: string | null;
  open: (id: string) => void;
  close: () => void;
  children: ReactNode;
  overlay?: ReactNode;
};

function shownId(section: string | null) {
  if (section === "now") return "here";
  if (section === "door") return "people";
  return section;
}

export function HudFrame({ role, model, section, open, close, children, overlay }: FrameProps) {
  const shown = shownId(section);
  const { muted, toggleMute, hear } = useAmbience();
  const { place, clock, dusk, night } = useAtmosphere();
  const [sheet, setSheet] = useState(false);
  const [tablet, setTablet] = useState(false);
  const [short, setShort] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [allowTuck, setAllowTuck] = useState(false);
  const [hot, setHot] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [radioNote, setRadioNote] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [seenToday, setSeenToday] = useState(0);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef(model.now);
  nowRef.current = model.now;

  const owner = role === "owner";
  const radio = model.snapshot?.radio;
  const station = cleanHud(radio?.name, 40);
  const stations = (radio?.stations ?? []).slice(0, 8).map((name) => cleanHud(name, 40));
  const tune = MAQUETTE.hudAdditions.radioTune && stations.length >= 2;
  const tv = readTv(model.snapshot);
  const channel = channelById(tv.channelId) ?? CHANNELS[0]!;
  const view = cleanHud(model.snapshot?.objects.find((object) => object.kind === "window")?.state.view, 140) || outsideView();
  const agents = model.snapshot?.agents ?? [];
  const events = model.snapshot?.events ?? [];
  const latest = events.reduce<(typeof events)[number] | null>((best, event) => (!best || event.at > best.at ? event : best), null);
  const dateKey = houseDateKey(model.now);
  const sunLine = useMemo(() => {
    const at = nowRef.current;
    const set = sunsetTime(at);
    if (at < set.getTime()) return SUNSET(houseClockLabel(set));
    return SUNRISE(houseClockLabel(sunriseTime(at)));
  }, [dateKey]);
  const tasks = useMemo(() => {
    return agents
      .map((agent) => cleanHud(`${agent.name} ${agent.status}`.trim(), 140))
      .filter(Boolean)
      .slice(0, 3);
  }, [agents]);
  const taskPage = tasks.length ? Math.floor(model.now / 6000) % tasks.length : 0;
  const dot = Boolean(latest && latest.at > seenToday);
  const ringKey =
    shown === "radio" ? "object:radio" : shown === "tv" ? "object:tv" : shown === "sky" ? "object:window" : shown === "here" || shown === "people" ? "object:door" : null;
  const yours = yoursCards(MAQUETTE.yoursComingSoon, role);
  const yoursCard = yours.length ? YOURS_CARDS.find((card) => card.id === shown) : undefined;

  useEffect(() => {
    try {
      setSeenToday(Number(localStorage.getItem(TODAY_KEY) || 0));
    } catch {
      setSeenToday(0);
    }
  }, []);

  useEffect(() => {
    if (shown !== "today" || !latest) return;
    try {
      localStorage.setItem(TODAY_KEY, String(latest.at));
    } catch {
      /* the dot is local only */
    }
    setSeenToday(latest.at);
  }, [shown, latest]);

  useEffect(() => onRadioNotice((message) => {
    if (message === "fail") setRadioNote(ACTION_FAIL);
    else if (message === "stream") setRadioNote(STREAM_FAIL);
    else setRadioNote("");
  }), []);

  useEffect(() => {
    const read = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const asSheet = width < 1200 && (coarse || width < 720);
      setSheet(asSheet);
      setTablet(asSheet && width >= 720);
      setShort(height <= 700 && width < 720);
    };
    read();
    window.addEventListener("resize", read);
    const query = window.matchMedia("(pointer: coarse)");
    query.addEventListener("change", read);
    return () => {
      window.removeEventListener("resize", read);
      query.removeEventListener("change", read);
    };
  }, []);

  useEffect(() => {
    let marked = false;
    try {
      marked = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      marked = false;
    }
    if (marked) {
      setAllowTuck(true);
      return;
    }
    const mark = () => {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* first visit stays untucked */
      }
    };
    const timer = window.setTimeout(mark, 60_000);
    window.addEventListener("pagehide", mark);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", mark);
    };
  }, []);

  useEffect(() => {
    if (shown) setTucked(false);
  }, [shown]);

  useEffect(() => {
    if (!allowTuck || shown || hot || tucked) return;
    const timer = window.setTimeout(() => setTucked(true), TUCK_MS);
    return () => window.clearTimeout(timer);
  }, [allowTuck, shown, hot, tucked, pulse]);

  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("hud-stage")));
    return () => cancelAnimationFrame(id);
  }, [tucked]);

  useEffect(() => {
    if (!ringKey) {
      setRing(null);
      return;
    }
    const read = () => setRing(anchorPoint(ringKey));
    read();
    window.addEventListener("hud-stage", read);
    return () => window.removeEventListener("hud-stage", read);
  }, [ringKey, model.snapshot?.serverTime]);

  useEffect(() => {
    if (shown) titleRef.current?.focus();
    else opener.current?.focus();
  }, [shown]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (shown) close();
        else if (tucked) setTucked(false);
      } else if (event.key === "Tab" && tucked) setTucked(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, tucked, close]);

  function remember(event: { currentTarget: HTMLElement }) {
    opener.current = event.currentTarget;
  }

  function toggle(id: string, event: { currentTarget: HTMLElement }) {
    remember(event);
    setTucked(false);
    if (shown === id) close();
    else open(id);
  }

  function go(id: string, event: { currentTarget: HTMLElement }) {
    remember(event);
    setTucked(false);
    open(id);
  }

  function onChromeKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!sheet || !shown || event.key !== "Tab") return;
    const root = cardRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.hasAttribute("disabled"),
    );
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function swipeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sheet) return;
    if ((event.target as HTMLElement).closest(".hudf-chips")) return;
    const body = bodyRef.current;
    if (body && body.contains(event.target as Node) && body.scrollTop > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    (event.currentTarget as HTMLElement).dataset.swipeY = String(event.clientY);
    (event.currentTarget as HTMLElement).dataset.swipeT = String(performance.now());
  }

  function swipeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const host = event.currentTarget as HTMLElement;
    const y = Number(host.dataset.swipeY);
    const t = Number(host.dataset.swipeT);
    delete host.dataset.swipeY;
    if (!Number.isFinite(y) || !Number.isFinite(t)) return;
    const dy = event.clientY - y;
    const speed = dy / Math.max(1, performance.now() - t);
    if (dy > 96 || (dy > 24 && speed > 0.5)) close();
  }

  async function postTap(body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/tap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setActionNote(res.ok ? "" : ACTION_FAIL);
    } catch {
      setActionNote(ACTION_FAIL);
    }
  }

  function hearHouse() {
    if (!muted) {
      toggleMute();
      return;
    }
    const url = httpsUrl(radio?.url);
    if (url) hear(url);
    else toggleMute();
  }

  const skyWord = night ? NIGHT : dusk ? DUSK : DAY;
  const cardClass = `hudf-card${sheet ? " is-sheet" : " is-float"}${tablet ? " is-tablet" : ""}`;
  const rootClass = `room-root hudf${night ? " is-night" : ""}${sheet && shown ? " is-sheet" : ""}${tucked ? " is-tucked" : ""}${short ? " is-short" : ""}`;

  const card = shown ? (
    <div
      ref={cardRef}
      className={cardClass}
      role="dialog"
      aria-modal={sheet}
      data-chrome=""
      onKeyDown={onChromeKey}
      onPointerDown={swipeStart}
      onPointerUp={swipeEnd}
      onPointerCancel={swipeEnd}
    >
      {sheet ? <div className="hudf-grab" /> : null}
      <div className="hudf-hd">
        <h2 ref={titleRef} tabIndex={-1}>
          {cardTitle(shown, tv.name)}
        </h2>
        <button type="button" className="hudf-x" data-ctl="card-close" aria-label={CLOSE} onClick={close}>
          ×
        </button>
      </div>
      <div className="hudf-body" ref={bodyRef}>
        {shown === "today" && (
          <>
            <p className="is-info hudf-quiet">{sunLine}</p>
            {tv.headlines.map((item, index) => (
              <Headline key={index} item={item} />
            ))}
            {latest ? (
              <button type="button" data-ctl="today-event" onClick={(event) => go("activity", event)}>
                {cleanHud(latest.text, 140)}
              </button>
            ) : tv.headlines.length === 0 ? (
              <p className="is-info hudf-quiet">{TODAY_EMPTY}</p>
            ) : null}
          </>
        )}
        {shown === "radio" && (
          <>
            {owner ? (
              <div className="hudf-row">
                {tune ? (
                  <button type="button" className="hudf-round" data-ctl="radio-prev" aria-label={PREVIOUS} onClick={() => tapRadio("prev")}>
                    ‹
                  </button>
                ) : null}
                {radio?.on ? (
                  <button type="button" className="hudf-play" data-ctl="radio-stop" onClick={() => tapRadio("off")}>
                    {STOP}
                  </button>
                ) : (
                  <button type="button" className="hudf-play" data-ctl="radio-play" onClick={() => tapRadio("on")}>
                    {PLAY}
                  </button>
                )}
                <button type="button" className="hudf-round" data-ctl="radio-next" aria-label={NEXT} onClick={() => tapRadio("next")}>
                  ›
                </button>
              </div>
            ) : radio?.on ? (
              <button type="button" className="hudf-play" data-ctl="radio-mute" onClick={hearHouse}>
                {muted ? UNMUTE : MUTE}
              </button>
            ) : (
              <p className="is-info hudf-quiet">{RADIO_OFF}</p>
            )}
            {owner && !radio?.on && station ? <p className="is-info hudf-quiet">{PLAYS(station)}</p> : null}
            {radio?.on && station ? <p className="is-info hudf-quiet">{PLAYING}</p> : null}
            {radioNote ? <p className="is-info hudf-quiet">{radioNote}</p> : null}
            <div className="hudf-list">
              {stations.map((name, index) =>
                owner && tune ? (
                  <button key={name + index} type="button" data-ctl={`radio-row-${index}`} className={index === radio?.index ? "is-on" : ""} onClick={() => tapRadio("tune", index)}>
                    {name}
                  </button>
                ) : (
                  <div key={name + index} className="is-info">
                    {name}
                  </div>
                ),
              )}
            </div>
          </>
        )}
        {shown === "tv" && (
          <>
            <div className="hudf-row">
              <div className="hudf-screen" style={{ ["--a" as string]: channel.accent, ["--c" as string]: channel.color }}>
                <b>{tv.name || channel.name}</b>
                {!tv.power ? <em>{TV_OFF}</em> : null}
              </div>
              {owner ? (
                <button type="button" className="hudf-play is-sec" data-ctl="tv-power" onClick={() => void postTap({ id: "tv" })}>
                  {tv.power ? TURN_OFF : TURN_ON}
                </button>
              ) : (
                <p className="is-info hudf-quiet">{tv.power ? tv.name || channel.name : TV_OFF_WATCH}</p>
              )}
            </div>
            <div className={`hudf-chips${short ? " is-snap" : ""}`}>
              {CHANNELS.map((item) =>
                owner && MAQUETTE.hudAdditions.tvChannel ? (
                  <button key={item.id} type="button" data-ctl={`tv-chip-${item.id}`} className={item.id === tv.channelId && tv.power ? "is-on" : ""} onClick={() => void postTap({ id: "tv", channel: item.id })}>
                    {item.name}
                  </button>
                ) : (
                  <span key={item.id} className={`is-info${item.id === tv.channelId && tv.power ? " is-on" : ""}`}>
                    {item.name}
                  </span>
                ),
              )}
            </div>
            {actionNote ? <p className="is-info hudf-quiet">{actionNote}</p> : null}
          </>
        )}
        {shown === "sky" && (
          <>
            <p className="is-info">
              {place}
              {clock ? ` · ${clock}` : ""} · {skyWord}
            </p>
            <p className="is-info hudf-quiet">{view}</p>
            {owner ? (
              <button type="button" className="hudf-play is-sec" data-ctl="sky-look" onClick={() => void postTap({ id: "window" })}>
                {LOOK_OUTSIDE}
              </button>
            ) : null}
            {actionNote ? <p className="is-info hudf-quiet">{actionNote}</p> : null}
          </>
        )}
        {(shown === "here" || shown === "people") && <HereList model={model} agents={agents} />}
        {shown === "people" && owner ? <DoorSection model={model} /> : null}
        {shown === "activity" && <ActivitySection model={model} watcher={!owner} />}
        {shown === "invite" && owner ? <InviteSection model={model} /> : null}
        {yoursCard ? <p className="is-info hudf-quiet">{COMING_SOON}</p> : null}
        {shown === "you" && (
          <>
            {owner ? <YouSection /> : <p className="is-info hudf-quiet">{WATCH_YOU}</p>}
            <button type="button" className="hudf-switch" role="switch" aria-checked={!muted} data-ctl="room-sound" onClick={toggleMute}>
              <span>{ROOM_SOUND}</span>
              <span>{muted ? MUTE : UNMUTE}</span>
            </button>
            {owner ? <SignForm ctl="you-signout" label={SIGN_OUT} /> : <SignForm ctl="you-leave" label={WATCH_LEAVE} />}
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={rootClass}
      data-role={role}
      data-hud-frame=""
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.propertyName === "grid-template-rows" || event.propertyName === "grid-template-columns") {
          window.dispatchEvent(new Event("hud-stage"));
        }
      }}
      onPointerOver={(event) => {
        if ((event.target as HTMLElement).closest("[data-chrome]")) setHot(true);
      }}
      onPointerOut={(event) => {
        const next = event.relatedTarget as HTMLElement | null;
        if (!next?.closest?.("[data-chrome]")) setHot(false);
      }}
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).closest(".hudf-stage")) setHot(true);
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as HTMLElement | null;
        if (!next || next.closest(".hudf-stage") || !rootRef.current?.contains(next)) setHot(false);
      }}
    >
      <header className="hudf-top" data-chrome="" onPointerDown={() => setPulse((value) => value + 1)}>
        <div className="hudf-title is-info">
          <b>{owner ? TITLE_OWNER : TITLE_WATCH}</b>
          <span>
            {place}
            {clock ? ` · ${clock}` : ""}
          </span>
        </div>
        <span className={`hudf-badge is-info${owner ? "" : " is-watch"}`}>{owner ? OWNER_BADGE : BADGE_WATCH}</span>
        <button type="button" className="hudf-count" data-ctl="here-count" onClick={(event) => toggle("here", event)}>
          {agents.length} here
        </button>
        {owner ? <SignForm ctl="signout" label={SIGN_OUT} /> : <SignForm ctl="leave" label={WATCH_LEAVE} />}
      </header>
      <div
        className="hudf-stage"
        onPointerDown={() => {
          if (tucked) setTucked(false);
        }}
      >
        {children}
        {!sheet ? card : null}
      </div>
      <div className="hudf-rail" data-chrome="" onPointerDown={() => setPulse((value) => value + 1)}>
        <p className="is-info mono">{HOUSE}</p>
        <Rail id="today" label="Today" on={shown === "today"} dot={dot} onClick={(event) => toggle("today", event)} />
        <Rail id="radio" label="Radio" on={shown === "radio"} bars={Boolean(radio?.on)} onClick={(event) => toggle("radio", event)} />
        <Rail id="tv" label="TV" on={shown === "tv"} onClick={(event) => toggle("tv", event)} />
        <Rail id="sky" label="Sky" on={shown === "sky"} onClick={(event) => toggle("sky", event)} />
        {YOURS_CARDS.filter((card) => yours.includes(card.title)).map((card) => (
          <Rail key={card.id} id={card.id} ctl={card.id} label={card.title} on={shown === card.id} onClick={(event) => toggle(card.id, event)} />
        ))}
      </div>
      <button type="button" className="hudf-here" data-chrome="" data-ctl="here-tab" onClick={(event) => toggle("here", event)}>
        {HERE}
        <span>{agents.length}</span>
      </button>
      <div className="hudf-bot" data-chrome="" onPointerDown={() => setPulse((value) => value + 1)}>
        <div className="hudf-strips">
          <button type="button" className="hudf-strip is-task" data-ctl="strip-task" onClick={(event) => go("activity", event)}>
            <span>{tasks[taskPage] || TODAY_EMPTY}</span>
            {tasks.length ? <em className="is-info">{taskPage + 1}/{tasks.length}</em> : null}
          </button>
          <button type="button" className="hudf-strip is-chat" data-ctl="strip-chat" onClick={(event) => go("activity", event)}>
            <span>{ACTIVITY}</span>
          </button>
        </div>
        <nav className="hudf-nav">
          <button type="button" data-ctl="nav-room" className={!shown ? "is-on" : ""} onClick={(event) => { remember(event); close(); }}>
            Room
          </button>
          <button type="button" data-ctl="nav-activity" className={shown === "activity" ? "is-on" : ""} onClick={(event) => toggle("activity", event)}>
            Activity
          </button>
          {owner ? (
            <button type="button" data-ctl="nav-invite" className={shown === "invite" ? "is-on" : ""} onClick={(event) => toggle("invite", event)}>
              Invite
            </button>
          ) : null}
          <button type="button" data-ctl="nav-people" className={shown === "people" ? "is-on" : ""} onClick={(event) => toggle("people", event)}>
            People
          </button>
          <button type="button" data-ctl="nav-you" className={shown === "you" ? "is-on" : ""} onClick={(event) => toggle("you", event)}>
            You
          </button>
        </nav>
      </div>
      {sheet && shown ? <button type="button" className="hudf-scrim" data-ctl="sheet-scrim" aria-label={CLOSE} onClick={close} /> : null}
      {sheet ? card : null}
      <div className="hudf-pill" data-chrome="">
        <button type="button" data-ctl="pill-today" onClick={(event) => go("today", event)}>
          Today
        </button>
        <button type="button" data-ctl="pill-radio" onClick={(event) => go("radio", event)}>
          Radio{station ? ` · ${station}` : ""}
        </button>
        {radio?.on && owner ? (
          <button type="button" className="is-stop" data-ctl="pill-stop" onClick={() => tapRadio("off")}>
            {STOP}
          </button>
        ) : null}
        {radio?.on && !owner ? (
          <button type="button" className="is-stop" data-ctl="pill-mute" onClick={hearHouse}>
            {muted ? UNMUTE : MUTE}
          </button>
        ) : null}
        {!radio?.on ? (
          <button type="button" data-ctl="pill-handle" aria-label={SHOW_CONTROLS} onClick={() => setTucked(false)}>
            ⌃
          </button>
        ) : null}
      </div>
      {ring ? <div className="hudf-ring" style={{ left: ring.x, top: ring.y }} /> : null}
      {model.status === "offline" ? <p className="hud-offline is-info">{OFFLINE}</p> : null}
      {overlay ? <div className="hudf-overlay">{overlay}</div> : null}
    </div>
  );
}

function Rail({
  id,
  label,
  on,
  dot,
  bars,
  ctl,
  onClick,
}: {
  id: string;
  label: string;
  on: boolean;
  dot?: boolean;
  bars?: boolean;
  ctl?: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" data-ctl={ctl ?? `rail-${id}`} className={on ? "is-on" : ""} aria-label={label} onClick={onClick}>
      {dot ? <i className="hudf-dot" /> : null}
      {bars ? (
        <span className="hudf-eq" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <small>{label}</small>
    </button>
  );
}

function SignForm({ ctl, label }: { ctl: string; label: string }) {
  return (
    <form method="post" action="/api/auth/signout" className="hudf-signout" onSubmit={(event) => { event.preventDefault(); void signOut(); }}>
      <button type="submit" className="hudf-leave" data-ctl={ctl}>
        {label}
      </button>
    </form>
  );
}

function HereList({ model, agents }: { model: HudModel; agents: PublicAgent[] }) {
  if (!agents.length) return <p className="is-info hudf-quiet">{HERE_EMPTY}</p>;
  return (
    <div className="hudf-list">
      {agents.map((agent) => (
        <button key={agent.id} type="button" data-ctl="here-name" onClick={() => model.selectAgent(agent.id)}>
          {cleanHud(agent.name, 40)}
        </button>
      ))}
    </div>
  );
}

function Headline({ item }: { item: unknown }) {
  if (!item || typeof item !== "object") return null;
  const record = item as { title?: unknown; source?: unknown; link?: unknown };
  const title = cleanHud(record.title, 140);
  if (!title) return null;
  const source = cleanHud(record.source, 40);
  const text = source ? `${title} — ${source}` : title;
  const link = httpLink(record.link);
  if (!link) return <p className="is-info hudf-quiet">{text}</p>;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      {text} <span className="is-info">{OPENS_NEW_TAB}</span>
    </a>
  );
}

function readTv(snapshot: HudModel["snapshot"]) {
  const object = snapshot?.objects.find((item) => item.kind === "tv");
  const state = object?.state ?? {};
  const channelId = typeof state.channel === "number" ? state.channel : 1;
  const headlines = Array.isArray(state.headlines) ? state.headlines : [];
  return {
    power: state.power === true,
    channelId,
    name: cleanHud(state.channelName, 40),
    headlines,
  };
}

function cardTitle(shown: string, channelName: string) {
  if (shown === "today") return "Today";
  if (shown === "radio") return "Radio";
  if (shown === "tv") return channelName ? `TV · ${channelName}` : "TV";
  if (shown === "sky") return "Sky";
  if (shown === "here") return HERE;
  if (shown === "activity") return ACTIVITY;
  if (shown === "invite") return "Invite";
  if (shown === "people") return "People";
  if (shown === "you") return "You";
  const yours = YOURS_CARDS.find((card) => card.id === shown);
  if (yours) return yours.title;
  return HOUSE;
}

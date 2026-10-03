"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtmosphere } from "./atmosphere";

type Item = {
  title: string;
  source: string;
  region: string;
  summary: string;
  url: string;
  publishedAt: number;
};

const QUIET: Item = {
  title: "No headlines yet. They'll be here soon.",
  source: "Living Room",
  region: "WORLD",
  summary: "",
  url: "",
  publishedAt: 0,
};

export function GlobalTape() {
  const [items, setItems] = useState<Item[]>([QUIET]);
  const [open, setOpen] = useState<Item | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cursor, setCursor] = useState(0);
  const [shown, setShown] = useState(true);
  const [fitted, setFitted] = useState(QUIET.title);
  const line = useRef<HTMLButtonElement>(null);
  const { label, clock: hourLabel, place } = useAtmosphere();

  // the camera reframes around the Tonight card (phone: below it), and phone notes yield to it
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.tonight = "1";
    else delete root.dataset.tonight;
    window.dispatchEvent(new Event("maquette-layout"));
    return () => {
      delete root.dataset.tonight;
    };
  }, [open]);

  useEffect(() => {
    let stop = false;
    const load = () => {
      fetch("/api/news")
        .then((response) => response.json())
        .then((body: { items?: Item[] }) => {
          if (stop || !Array.isArray(body.items)) return;
          const next = body.items.filter(usable).slice(0, 30);
          if (next.length) {
            setItems(next);
            setCursor(0);
          }
        })
        .catch(() => {});
    };
    load();
    const poll = setInterval(load, 12 * 60 * 1000);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => {
      setShown(false);
      window.setTimeout(() => {
        setCursor((value) => (value + 1) % items.length);
        setShown(true);
      }, 320);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  const item = items[cursor % items.length] ?? QUIET;

  useLayoutEffect(() => {
    const node = line.current;
    if (!node) return;
    const words = item.title.split(/\s+/).filter(Boolean);
    let next = words[0] ?? item.title;
    node.textContent = next;
    for (let index = 1; index < words.length; index += 1) {
      const trial = `${next} ${words[index]}`;
      node.textContent = trial;
      if (node.scrollWidth > node.clientWidth + 1) break;
      next = trial;
    }
    if (next.length < item.title.length) next = `${next.replace(/\s+$/, "")}…`;
    setFitted(next);
  }, [item.title, shown]);

  const openIndex = open ? Math.max(0, items.indexOf(open)) : 0;
  const meta = [place, label, hourLabel].filter(Boolean).join(" · ").toUpperCase();

  return (
    <>
      <div className="global-tape" role="region" aria-label="Tonight">
        <div className="global-tape-flag">
          <i aria-hidden />
          TONIGHT
        </div>
        <div className="global-tape-window">
          <button
            ref={line}
            type="button"
            className={`global-tape-line${shown ? "" : " is-out"}`}
            onClick={() => setOpen(item)}
          >
            {fitted}
          </button>
        </div>
        {meta ? <span className="global-tape-meta">{meta}</span> : null}
      </div>
      {open && (
        <div className="global-tape-scrim" onClick={() => setOpen(null)}>
          <article className="global-tape-card" role="dialog" aria-label={open.title} onClick={(event) => event.stopPropagation()}>
            <div className="tc-kicker">
              <b>
                <i aria-hidden />
                TONIGHT
              </b>
              <span>
                {(open.region || "WORLD").toUpperCase()}
                {items.length > 1 ? ` · ${openIndex + 1} OF ${items.length}` : ""}
              </span>
            </div>
            <h2 className="tc-title">{open.title}</h2>
            {open.summary ? <p className="tc-summary">{open.summary}</p> : null}
            <p className="tc-meta">
              {open.source.toUpperCase()}
              {age(open, now) ? ` · ${age(open, now).toUpperCase()} AGO` : ""}
              {open.publishedAt ? ` · ${clock(open.publishedAt)}` : ""}
            </p>
            <div className="tc-actions">
              {open.url ? (
                <a className="tc-btn is-primary" href={open.url} target="_blank" rel="noopener noreferrer">
                  READ STORY
                </a>
              ) : null}
              {items.length > 1 ? (
                <button type="button" className="tc-btn" onClick={() => setOpen(items[(openIndex + 1) % items.length] ?? null)}>
                  NEXT
                </button>
              ) : null}
              <button type="button" className="tc-btn" onClick={() => setOpen(null)}>
                CLOSE
              </button>
            </div>
          </article>
        </div>
      )}
    </>
  );
}

function usable(item: Item) {
  return Boolean(item && typeof item.title === "string" && item.title.trim() && typeof item.source === "string");
}

function age(item: Item, now: number) {
  if (!item.publishedAt) return "";
  const mins = Math.max(0, Math.round((now - item.publishedAt) / 60000));
  if (mins < 1) return "1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

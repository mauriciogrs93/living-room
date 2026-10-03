"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Item = {
  title: string;
  source: string;
  region: string;
  summary: string;
  url: string;
  publishedAt: number;
};

const COLORS: Record<string, string> = {
  WORLD: "#4F6D8A",
  US: "#4F6D8A",
  EUROPE: "#7E9C76",
  ASIA: "#C8553D",
  "MIDDLE EAST": "#E3A857",
  AFRICA: "#7E9C76",
  AMERICAS: "#4F6D8A",
  TECH: "#4F6D8A",
  SCIENCE: "#7E9C76",
};

const QUIET: Item = {
  title: "The wire is quiet. Headlines will fill when the feeds answer.",
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

  return (
    <>
      <div className="global-tape" role="region" aria-label="Tonight">
        <div className="global-tape-flag">Tonight</div>
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
      </div>
      {open && (
        <div className="global-tape-scrim" onClick={() => setOpen(null)}>
          <article className="global-tape-card" role="dialog" aria-label={open.title} onClick={(event) => event.stopPropagation()}>
            <p className="global-tape-card-region" style={{ color: COLORS[open.region] ?? COLORS.WORLD }}>
              {open.region || "WORLD"}
            </p>
            <h2>{open.title}</h2>
            {open.summary ? <p className="global-tape-card-summary">{open.summary}</p> : null}
            <p className="global-tape-card-meta">
              {open.source}
              {age(open, now) ? ` · ${age(open, now)}` : ""}
              {open.publishedAt ? ` · ${clock(open.publishedAt)}` : ""}
            </p>
            {open.url ? (
              <a href={open.url} target="_blank" rel="noopener noreferrer">
                Read full story
              </a>
            ) : null}
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
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

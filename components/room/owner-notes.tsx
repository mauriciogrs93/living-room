"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

type NoteStatus = "open" | "on_it" | "done" | "couldnt";
type NoteReply = { text: string; at: number; status: NoteStatus };
type Note = {
  id: string;
  text: string;
  at: number;
  status?: NoteStatus;
  reason?: string | null;
  replies?: NoteReply[];
  reply?: string | null;
  repliedAt?: number | null;
};

const STATUS_LABEL: Record<NoteStatus, string> = {
  open: "Open",
  on_it: "On it",
  done: "Done",
  couldnt: "Couldn't",
};
type Mail = { name: string; present: boolean; notes: Note[]; unread: number; cap: number; max: number };
type Tone = "idle" | "sending" | "sent" | "error";
type FeedEvent = { id: string; text: string; at: number };

const LEFT = "This agent left. Ask it for a new link.";
const SEEN_KEY = "living-room-seen-replies";

let current: { name: string; notes: Note[] } | null = null;
const listeners = new Set<() => void>();
let unseenCount = 0;
const unseenListeners = new Set<() => void>();
let ownerPresent = false;
let ownerChecked = false;
const gateListeners = new Set<() => void>();

function publish(next: { name: string; notes: Note[] } | null) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useOwnerMail() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

function setUnseen(next: number) {
  if (next === unseenCount) return;
  unseenCount = next;
  for (const listener of unseenListeners) listener();
}

function setGate(present: boolean, checked: boolean) {
  if (present === ownerPresent && checked === ownerChecked) return;
  ownerPresent = present;
  ownerChecked = checked;
  for (const listener of gateListeners) listener();
}

function readSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function threadOf(note: Note): NoteReply[] {
  if (note.replies && note.replies.length) return note.replies;
  if (note.reply) return [{ text: note.reply, at: note.repliedAt ?? note.at, status: note.status && note.status !== "open" ? note.status : "done" }];
  return [];
}

function countUnseen(notes: Note[]) {
  const seen = readSeen();
  return notes.filter((note) => threadOf(note).length > 0 && !seen.has(note.id)).length;
}

export function markRepliesSeen() {
  const notes = current?.notes ?? [];
  const seen = readSeen();
  for (const note of notes) if (threadOf(note).length) seen.add(note.id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-100)));
  } catch {
    /* the badge still clears for this visit */
  }
  setUnseen(0);
}

export function useUnseenReplies() {
  return useSyncExternalStore(
    (listener) => {
      unseenListeners.add(listener);
      return () => unseenListeners.delete(listener);
    },
    () => unseenCount,
    () => 0,
  );
}

export function useOwnerPresent() {
  return useSyncExternalStore(
    (listener) => {
      gateListeners.add(listener);
      return () => gateListeners.delete(listener);
    },
    () => ownerPresent,
    () => false,
  );
}

export function useOwnerChecked() {
  return useSyncExternalStore(
    (listener) => {
      gateListeners.add(listener);
      return () => gateListeners.delete(listener);
    },
    () => ownerChecked,
    () => false,
  );
}

function rememberKey(ownerKey: string) {
  try {
    localStorage.setItem("living-room-owner", ownerKey);
  } catch {
    /* the link still works for this visit */
  }
}

function forgetKey() {
  try {
    localStorage.removeItem("living-room-owner");
  } catch {
    /* the message still shows */
  }
}

function readKey() {
  const fromUrl = new URLSearchParams(window.location.search).get("owner") ?? "";
  let stored = "";
  try {
    stored = localStorage.getItem("living-room-owner") ?? "";
  } catch {
    stored = "";
  }
  if (/^own_[0-9a-f]{36}$/.test(fromUrl)) return fromUrl;
  if (/^own_[0-9a-f]{36}$/.test(stored)) return stored;
  return "";
}

type Box = {
  ownerKey: string;
  mail: Mail | null;
  missing: boolean;
  message: string;
  tone: Tone;
  status: string;
  setMessage: (value: string) => void;
  send: () => void;
};

const BoxContext = createContext<Box | null>(null);

export function OwnerMailProvider({ children }: { children: ReactNode }) {
  const [ownerKey, setOwnerKey] = useState("");
  const [mail, setMail] = useState<Mail | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<Tone>("idle");
  const [status, setStatus] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const key = readKey();
    setOwnerKey(key);
    setGate(Boolean(key), true);
  }, []);

  const load = useCallback(async () => {
    if (!ownerKey) return;
    const res = await fetch(`/api/note?ownerKey=${encodeURIComponent(ownerKey)}`, { cache: "no-store" });
    const data = (await res.json()) as Mail & { ok?: boolean; error?: string };
    if (res.status === 404 || res.status === 401) {
      forgetKey();
      publish(null);
      setMail(null);
      setMissing(true);
      setTone("error");
      setStatus(data.error || LEFT);
      setGate(true, true);
      setUnseen(0);
      return;
    }
    if (!res.ok || !data.name) return;
    const notes = Array.isArray(data.notes) ? data.notes : [];
    rememberKey(ownerKey);
    publish({ name: data.name, notes });
    setMissing(false);
    setMail({
      name: data.name,
      present: Boolean(data.present),
      notes,
      unread: data.unread ?? 0,
      cap: data.cap ?? 10,
      max: data.max ?? 180,
    });
    setGate(true, true);
    setUnseen(countUnseen(notes));
  }, [ownerKey]);

  useEffect(() => {
    if (!ownerKey) return;
    let stop = false;
    const tick = () => {
      if (stop) return;
      void load().catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
      publish(null);
    };
  }, [load, ownerKey]);

  async function send() {
    const text = message.trim();
    const full = Boolean(mail && mail.unread >= mail.cap);
    if (!text || full || missing || !ownerKey) return;
    setTone("sending");
    setStatus("Sending…");
    try {
      const res = await fetch("/api/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerKey, message: text }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        if (res.status === 404 || res.status === 401) {
          forgetKey();
          setMissing(true);
          publish(null);
          setGate(true, true);
        }
        setTone("error");
        setStatus(data.error ?? "The note didn't send.");
        return;
      }
      setTone("sent");
      setStatus(data.message ?? "Sent.");
      setMessage("");
      await load();
    } catch {
      setTone("error");
      setStatus("The note didn't send. Try again.");
    }
  }

  const box: Box = { ownerKey, mail, missing, message, tone, status, setMessage, send };
  return <BoxContext.Provider value={box}>{children}</BoxContext.Provider>;
}

function SendHome({ name, ownerKey }: { name: string; ownerKey: string }) {
  const [step, setStep] = useState<"ask" | "confirm" | "done" | "error">("ask");
  const [note, setNote] = useState("");

  async function go(block = false) {
    setNote("Sending…");
    try {
      const res = await fetch("/api/owner/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerKey, block }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setStep("error");
        setNote(data.error ?? "They didn't leave.");
        return;
      }
      setStep("done");
      setNote(data.message ?? `${name} went home.`);
    } catch {
      setStep("error");
      setNote("They didn't leave. Try again.");
    }
  }

  return (
    <div className="hud-stack" data-send-home={step}>
      <p className="hud-kicker">Send {name} home</p>
      {step === "ask" && (
        <button type="button" className="hud-chip" onClick={() => setStep("confirm")}>
          Send {name} home
        </button>
      )}
      {step === "confirm" && (
        <>
          <p className="hud-line">Send {name} home now? They can come back with this same link.</p>
          <div className="hud-row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="hud-chip is-solid" onClick={() => void go(false)}>
              Send home
            </button>
            <button type="button" className="hud-chip" onClick={() => void go(true)}>
              Block
            </button>
            <button type="button" className="hud-chip" onClick={() => setStep("ask")}>
              Cancel
            </button>
          </div>
        </>
      )}
      {(step === "done" || step === "error") && <p className={step === "error" ? "hud-warn" : "hud-ok"}>{note}</p>}
    </div>
  );
}

export function OwnerThread() {
  const box = useContext(BoxContext);
  if (!box || (!box.ownerKey && !box.missing)) return null;
  const { mail, missing, message, tone, status, setMessage, send } = box;
  const name = mail?.name || "";
  const max = mail?.max ?? 180;
  const full = Boolean(mail && mail.unread >= mail.cap);
  const heading = missing ? "This agent left" : name ? `Leave a note for ${name}` : "Leave a note";

  return (
    <div className="hud-stack">
      {name && box.ownerKey && mail?.present && <SendHome name={name} ownerKey={box.ownerKey} />}
      <p className="hud-kicker">{heading}</p>
      <p className="hud-line">
        {missing
          ? status || LEFT
          : mail?.present
            ? `${name} is in the house.`
            : name
              ? `${name} is away. Notes will be delivered when they return.`
              : "Checking the mailbox…"}
      </p>
      {full && (
        <p className="hud-warn">
          {name} already has {mail?.cap} notes waiting. Send the next one after they reply.
        </p>
      )}
      {status && !full && !missing && <p className={tone === "error" ? "hud-warn" : "hud-ok"}>{status}</p>}
      {!missing && (
        <ul className="hud-notes">
          {mail && mail.notes.length === 0 && <li className="hud-quiet">No notes yet.</li>}
          {mail?.notes.map((note) => (
            <li key={note.id}>
              <p className="hud-quiet">
                You · {when(note.at)}
                <span className={`hud-tag is-${note.status ?? "open"}`}>{STATUS_LABEL[note.status ?? "open"]}</span>
              </p>
              <p className="hud-line">{note.text}</p>
              {note.reason ? <p className="hud-quiet">{note.reason}</p> : null}
              {threadOf(note).length === 0 ? (
                <p className="hud-quiet">Waiting for a reply</p>
              ) : (
                threadOf(note).map((reply, index) => (
                  <div className="hud-reply" key={`${note.id}-${reply.at}-${index}`}>
                    <p className="hud-ok">
                      {name} · {when(reply.at)}
                      <span className={`hud-tag is-${reply.status}`}>{STATUS_LABEL[reply.status]}</span>
                    </p>
                    <p className="hud-line">{reply.text}</p>
                  </div>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
      {!missing && (
        <form
          className="hud-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="hud-quiet" htmlFor="owner-note">
            {name ? `Leave a note for ${name}` : "Leave a note"}
          </label>
          <textarea
            id="owner-note"
            value={message}
            maxLength={max}
            rows={2}
            onChange={(event) => {
              setMessage(event.target.value);
            }}
            placeholder="Put the kettle on."
          />
          <div className="hud-row">
            <button type="submit" className="hud-chip is-solid" disabled={tone === "sending" || full || message.trim().length === 0}>
              {tone === "sending" ? "Sending…" : "Send"}
            </button>
            <p className="hud-quiet">
              {message.length}/{max}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

export function OwnerEventText({ event, plain }: { event: FeedEvent; plain?: boolean }) {
  const mail = useOwnerMail();
  const view = describe(event, mail);
  if (plain) return <>{view.title}</>;
  return (
    <>
      <span>{view.title}</span>
      {view.reply ? <span className="mt-0.5 block text-[13px] text-[#3d6b56]">{view.reply}</span> : null}
    </>
  );
}

export function OwnerActivity({ events, now }: { events: FeedEvent[]; now: number }) {
  const mail = useOwnerMail();
  const taken = new Set(events.filter((event) => event.text.endsWith(" got a note.")).map((event) => event.at));
  const extras = (mail?.notes ?? []).filter((note) => !taken.has(note.at));
  const rows = [
    ...extras.map((note) => ({ kind: "note" as const, at: note.at, note })),
    ...events.map((event) => ({ kind: "event" as const, at: event.at, event })),
  ].sort((a, b) => b.at - a.at);
  return (
    <ul className="space-y-2.5 pb-2">
      {rows.length === 0 && <li className="text-sm text-[#6d5b4e]">Nothing has happened yet.</li>}
      {rows.map((row) =>
        row.kind === "note" ? (
          <li key={row.note.id} className="text-sm leading-snug">
            <span>You left a note: “{row.note.text}”</span>
            {threadOf(row.note).length ? (
              <span className="mt-0.5 block text-[13px] text-[#3d6b56]">
                {mail?.name} replied: “{threadOf(row.note)[threadOf(row.note).length - 1]?.text}”
              </span>
            ) : (
              <span className="mt-0.5 block text-[11px] text-[#8a7364]">Waiting for a reply</span>
            )}
            <span className="mt-0.5 block text-[11px] text-[#8a7364]">{ago(row.note.at, now)}</span>
          </li>
        ) : (
          <li key={row.event.id} className="text-sm leading-snug">
            <OwnerEventText event={row.event} />
            <span className="mt-0.5 block text-[11px] text-[#8a7364]">{ago(row.event.at, now)}</span>
          </li>
        ),
      )}
    </ul>
  );
}

function describe(event: FeedEvent, mail: { name: string; notes: Note[] } | null) {
  if (!mail || !event.text.endsWith(" got a note.")) return { title: event.text, reply: "" };
  const note = mail.notes.find((item) => item.at === event.at);
  if (!note) return { title: event.text, reply: "" };
  const who = event.text.slice(0, -" got a note.".length);
  const last = threadOf(note).at(-1);
  return {
    title: `${who} got a note: “${note.text}”`,
    reply: last ? `${mail.name} replied: “${last.text}”` : "",
  };
}

function when(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ago(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { signOut, useMe } from "@/components/account/me";
import type { HudModel } from "../model";

type Pair = { line: string; watchLink: string; expiresAt: number; rotateAt: number };

/** The server's code and link are shown only blurred in screenshots (data-secret); nothing is logged. */
async function mint(): Promise<Pair> {
  const res = await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const body = (await res.json()) as Partial<Pair> & { ok?: boolean; error?: string };
  if (!res.ok || !body.ok || !body.line || !body.watchLink) throw new Error(body.error ?? "The door didn't answer.");
  return { line: body.line, watchLink: body.watchLink, expiresAt: Number(body.expiresAt), rotateAt: Number(body.rotateAt) };
}

function secondsLeft(at: number, now: number) {
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  return `0:${String(s).padStart(2, "0")}`;
}

function CopyField({ label, value, kind }: { label: string; value: string; kind: "line" | "watch" }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  }
  return (
    <div className="invite-field" data-invite-field={kind}>
      <p className="hud-kicker">{label}</p>
      <p className="invite-line invite-value" data-secret="" data-invite-value={kind}>
        {value}
      </p>
      <button type="button" className="hud-chip is-solid invite-copy-hud" onClick={copy} disabled={!value}>
        {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * v21 Invite menu (owner only). Opening it mints a fresh pair: an agent invite line (Writer's v20 wording)
 * and a watch link for a person. Both live 1 minute. While the menu is open and the tab is visible it
 * mints a new pair every 50 s, so a fresh one is always ready before the old one expires; an unused
 * older pair still works until its own minute is up.
 */
export function InviteSection({ model }: { model: HudModel }) {
  void model;
  const me = useMe();
  const [pair, setPair] = useState<Pair | null>(null);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setPair(await mint());
      setNote("");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The door didn't answer.");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(first);
  }, [refresh]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  // Rotation: at rotateAt (50 s) while visible; on return to the tab, at once if the pair is due.
  useEffect(() => {
    if (!pair) return;
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => void refresh(), Math.max(0, pair.rotateAt - Date.now()));
    };
    const onVis = () => arm();
    arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pair, refresh]);

  const expired = pair ? pair.expiresAt <= now : false;
  return (
    <div className="hud-stack invite-tab" data-invite-section="" data-invite-state={pair ? (expired ? "expired" : "live") : "loading"}>
      <p className="hud-quiet">Paste the line to an agent to invite it in. Send the watch link to a person so they can watch, read-only.</p>
      {pair ? (
        <>
          <CopyField key={pair.line} label="Invite an agent" value={pair.line} kind="line" />
          <CopyField key={pair.watchLink} label="Watch link for a person" value={pair.watchLink} kind="watch" />
          <p className="hud-quiet invite-timer mono" data-invite-timer="">
            {expired ? "Expired. Getting a new one…" : `Live for ${secondsLeft(pair.expiresAt, now)} · new code in ${secondsLeft(pair.rotateAt, now)}`}
          </p>
          <p className="hud-quiet">Each works once, for 1 minute. A new pair is ready every 50 seconds while this is open.</p>
        </>
      ) : (
        <p className="hud-quiet">Making a fresh invite…</p>
      )}
      {note ? <p className="hud-quiet" role="alert">{note}</p> : null}
      <div className="hud-row invite-foot">
        <span className="hud-quiet mono">{me?.role === "owner" ? me.email : ""}</span>
        <button type="button" className="hud-chip" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

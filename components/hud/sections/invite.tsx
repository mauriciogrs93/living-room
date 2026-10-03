"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { signOut, useMe } from "@/components/account/me";
import type { HudModel } from "../model";
import { INVITE_ROTATE_MS, INVITE_TTL_MS } from "@/lib/room/invite-ttl";

type Pair = { line: string; watchLink: string; expiresAt: number; rotateAt: number; receivedAt: number };

/**
 * The server's code and link are shown only blurred in screenshots (data-secret); nothing is logged.
 * Times are kept on this device's clock (received + ttl/rotate), so a skewed clock can't make a dead code
 * look alive: the server minted the pair just before answering, so the real expiry is slightly later.
 */
async function mint(): Promise<Pair> {
  const res = await fetch("/api/apartment/invite", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const body = (await res.json()) as { ok?: boolean; error?: string; line?: string; watchLink?: string; ttlMs?: number; rotateMs?: number };
  if (!res.ok || !body.ok || !body.line || !body.watchLink) throw new Error(body.error ?? "The door didn't answer.");
  const receivedAt = Date.now();
  const ttl = Number(body.ttlMs) || INVITE_TTL_MS;
  const rotate = Math.min(Number(body.rotateMs) || INVITE_ROTATE_MS, ttl);
  return { line: body.line, watchLink: body.watchLink, expiresAt: receivedAt + ttl, rotateAt: receivedAt + rotate, receivedAt };
}

function secondsLeft(at: number, now: number) {
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  return `0:${String(s).padStart(2, "0")}`;
}

function CopyField({
  label,
  value,
  kind,
  meta,
  updated = false,
  dead = false,
}: {
  label: string;
  value: string;
  kind: "line" | "watch";
  meta?: React.ReactNode;
  updated?: boolean;
  dead?: boolean;
}) {
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
      {meta}
      <p className={`invite-line invite-value${dead ? " is-dead" : ""}`} data-secret="" data-invite-value={kind}>
        {value}
      </p>
      <div className="invite-copy-row">
        <button type="button" className="hud-chip is-solid invite-copy-hud" onClick={copy} disabled={!value || dead}>
          {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {done ? "Copied" : "Copy"}
        </button>
        {updated ? (
          <span className="invite-updated mono" role="status" data-invite-updated="">
            Updated
          </span>
        ) : null}
      </div>
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
  const hadPair = useRef(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = await mint();
      setPair(next);
      setNote("");
      // A rotation (not the first pair): show "Updated" beside Copy for about 2 s.
      if (hadPair.current) setUpdatedAt(Date.now());
      hadPair.current = true;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The door didn't answer.");
      // Try again shortly; meanwhile the countdown says the shown code is about to expire (or has).
      window.setTimeout(() => setRetry((n) => n + 1), 8000);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(first);
  }, [refresh]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
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
  }, [pair, refresh, retry]);

  const expired = pair ? pair.expiresAt <= now : false;
  // After the 50 s mark the shown code has under 10 s left: say so plainly until the new one arrives.
  const overdue = pair ? !expired && pair.rotateAt <= now : false;
  const updated = updatedAt > 0 && now - updatedAt < 2000;
  const countdown = pair ? (
    <div className={`invite-countdown${overdue ? " is-warn" : ""}${expired ? " is-dead" : ""}`} data-invite-timer="" data-invite-phase={expired ? "expired" : overdue ? "expiring" : "live"}>
      <p className="mono" aria-live="polite">
        {expired
          ? "Expired. Getting a new code…"
          : overdue
            ? `This code expires in ${secondsLeft(pair.expiresAt, now)}. Getting a new one…`
            : `New code in ${secondsLeft(pair.rotateAt, now)}`}
      </p>
      {/* a thin bar that runs down to the 50 s rotation; restarts with each new pair */}
      <span className="invite-bar" aria-hidden>
        <i key={pair.line} style={{ animationDuration: `${pair.rotateAt - pair.receivedAt}ms` }} />
      </span>
    </div>
  ) : null;
  return (
    <div className="hud-stack invite-tab" data-invite-section="" data-invite-state={pair ? (expired ? "expired" : "live") : "loading"}>
      <p className="hud-quiet invite-intro">Paste the line to an agent to invite it in. Send the watch link to a person so they can watch, read-only.</p>
      {pair ? (
        <>
          <CopyField key={pair.line} label="Invite an agent" value={pair.line} kind="line" meta={countdown} updated={updated} dead={expired} />
          <CopyField key={pair.watchLink} label="Watch link for a person" value={pair.watchLink} kind="watch" updated={updated} dead={expired} />
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

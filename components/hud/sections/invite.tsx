"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useMe } from "@/components/account/me";
import { startCopy } from "@/components/invite-copy";
import type { HudModel } from "../model";
import { WATCH_REVOKE_BUTTON, WATCH_REVOKE_DONE } from "@/lib/apartments/copy";
import { INVITE_TTL_MS } from "@/lib/room/invite-ttl";

type Kind = "line" | "watch";
/** A code on show. `expiresAt` is on this device's clock, counted from when the request was SENT, so the
 *  menu refreshes a moment before the server's minute is up, never after. */
type Shown = { value: string; expiresAt: number };
type Minted = Partial<Record<Kind, Shown>>;

const MINT_FAILED = "Couldn't make an invite. Try again.";
const NO_CONNECTION = "Can't connect. Check your connection.";

/**
 * POST /api/apartment/invite. kind "line" | "watch" mints one; "both" mints the pair the menu shows when it opens.
 * The server's codes are shown only blurred in screenshots (data-secret); nothing is logged.
 */
async function mint(kind: Kind | "both"): Promise<Minted> {
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch("/api/apartment/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "both" ? {} : { kind }),
    });
  } catch {
    throw new Error(NO_CONNECTION);
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; line?: string; watchLink?: string; ttlMs?: number };
  if (!res.ok || !body.ok) {
    // Paused invites and rate limits keep the server's own words; anything else is Writer's one line.
    throw new Error((res.status === 409 || res.status === 429) && body.error ? body.error : MINT_FAILED);
  }
  const ttl = Number(body.ttlMs) || INVITE_TTL_MS;
  const out: Minted = {};
  if (body.line) out.line = { value: body.line, expiresAt: sentAt + ttl };
  if (body.watchLink) out.watch = { value: body.watchLink, expiresAt: sentAt + ttl };
  if ((kind !== "watch" && !out.line) || (kind !== "line" && !out.watch)) throw new Error(MINT_FAILED);
  return out;
}

type Phase = "idle" | "busy" | "copied" | "failed";

function CopyField({
  label,
  kind,
  shown,
  phase,
  updated,
  onCopy,
  children,
}: {
  label: string;
  kind: Kind;
  shown: Shown | null;
  phase: Phase;
  updated: boolean;
  onCopy: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="invite-field" data-invite-field={kind} data-copy-state={phase}>
      <p className="hud-kicker">{label}</p>
      <p className="invite-line invite-value" data-secret="" data-invite-value={kind}>
        {shown?.value ?? "\u00a0"}
      </p>
      <div className="invite-copy-row">
        <button type="button" className="hud-chip is-solid invite-copy-hud" onClick={onCopy} aria-busy={phase === "busy"}>
          {phase === "busy" ? <span className="copy-spin" aria-hidden /> : phase === "copied" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {phase === "copied" ? "Copied" : "Copy"}
        </button>
        {updated ? (
          <span className="invite-updated mono" role="status" data-invite-updated="">
            Updated
          </span>
        ) : null}
      </div>
      {phase === "failed" ? <p className="hud-quiet">Couldn&apos;t copy. Select and copy it.</p> : null}
      {children}
    </div>
  );
}

/**
 * v21 r2 Invite menu (owner only): MINT ON COPY.
 *   - Each Copy tap mints a fresh code (agent line or watch link) and copies it in the same tap (iPhone-safe);
 *     the code is live for a full minute from that tap. Two taps, two codes.
 *   - Opening the menu shows a line and a link (one request). While the menu stays open and the tab is
 *     visible, a shown code that reaches its minute is cleared at once (so it can't be seen or copied) and
 *     replaced (one request for that field).
 *   - Nothing runs while the menu is closed (this component is unmounted) or the tab is hidden: no timers,
 *     no rotation, no background minting. Coming back to a visible tab refreshes an expired line once.
 */
export function InviteSection({ model }: { model: HudModel }) {
  void model;
  const me = useMe();
  const [shown, setShown] = useState<Record<Kind, Shown | null>>({ line: null, watch: null });
  const [phase, setPhase] = useState<Record<Kind, Phase>>({ line: "idle", watch: "idle" });
  const [freshUntil, setFreshUntil] = useState<Record<Kind, number>>({ line: 0, watch: 0 });
  const [note, setNote] = useState("");
  const [revokeNote, setRevokeNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef<Record<Kind, boolean>>({ line: false, watch: false });
  const mounted = useRef(true);
  const copiedTimer = useRef<Record<Kind, number | undefined>>({ line: undefined, watch: undefined });

  useEffect(() => {
    mounted.current = true;
    const timers = copiedTimer.current;
    return () => {
      mounted.current = false;
      window.clearTimeout(timers.line);
      window.clearTimeout(timers.watch);
    };
  }, []);

  const show = useCallback((got: Minted, updated: boolean) => {
    if (!mounted.current) return;
    setShown((cur) => ({ line: got.line ?? cur.line, watch: got.watch ?? cur.watch }));
    if (updated) {
      const until = Date.now() + 2000;
      setFreshUntil((cur) => ({ line: got.line ? until : cur.line, watch: got.watch ? until : cur.watch }));
      // "Copied" belonged to the code that just expired.
      setPhase((cur) => ({ line: got.line ? "idle" : cur.line, watch: got.watch ? "idle" : cur.watch }));
    }
    setNote("");
  }, []);

  /** Replace an expired shown code (menu open, tab visible). */
  const refresh = useCallback(
    async (kinds: Kind[], updated: boolean) => {
      const todo = kinds.filter((k) => !busy.current[k]);
      if (!todo.length || !mounted.current || document.hidden) return;
      for (const k of todo) busy.current[k] = true;
      try {
        show(await mint(todo.length === 2 ? "both" : todo[0]!), updated);
      } catch (error) {
        if (!mounted.current) return;
        // Keep the expired code off the screen. Copy mints a new one; there is nothing dead to select.
        setShown((cur) => {
          const next = { ...cur };
          for (const k of todo) next[k] = null;
          return next;
        });
        setNote(error instanceof Error ? error.message : MINT_FAILED);
      } finally {
        for (const k of todo) busy.current[k] = false;
      }
    },
    [show],
  );

  // Opening the menu: one request for the line and the link it shows.
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(["line", "watch"], false), 0);
    return () => window.clearTimeout(first);
  }, [refresh]);

  // A shown code that reaches its minute is replaced, only while this menu is open and the tab visible.
  useEffect(() => {
    const timers: number[] = [];
    const arm = () => {
      while (timers.length) window.clearTimeout(timers.pop());
      if (document.hidden) return;
      for (const k of ["line", "watch"] as const) {
        const s = shown[k];
        if (!s) continue;
        timers.push(
          window.setTimeout(() => {
            if (!mounted.current || document.hidden) return;
            // Drop the code the moment it expires so it is never still sitting there to read or copy.
            setShown((cur) => (cur[k]?.expiresAt === s.expiresAt ? { ...cur, [k]: null } : cur));
            setNow(Date.now());
            void refresh([k], true);
          }, Math.max(0, s.expiresAt - Date.now())),
        );
      }
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      while (timers.length) window.clearTimeout(timers.pop());
      document.removeEventListener("visibilitychange", arm);
    };
  }, [shown, refresh]);

  // "Updated" shows for about 2 s after a refresh.
  useEffect(() => {
    const soon = Math.min(...[freshUntil.line, freshUntil.watch].filter((t) => t > Date.now()));
    if (!Number.isFinite(soon)) return;
    const t = window.setTimeout(() => setNow(Date.now()), Math.max(0, soon - Date.now() + 20));
    return () => window.clearTimeout(t);
  }, [freshUntil]);

  function copy(kind: Kind) {
    if (phase[kind] === "busy") return;
    setNote("");
    setPhase((cur) => ({ ...cur, [kind]: "busy" }));
    busy.current[kind] = true;
    // Mint + copy start in this same tap (iPhone Safari): a fresh code, live for a full minute from now.
    const minted = mint(kind);
    const run = startCopy(minted.then((got) => got[kind]!.value));
    void minted.then((got) => show(got, false), () => undefined);
    void run.then(
      (result) => {
        busy.current[kind] = false;
        if (!mounted.current) return;
        setPhase((cur) => ({ ...cur, [kind]: result.copied ? "copied" : "failed" }));
        if (!result.copied) return;
        window.clearTimeout(copiedTimer.current[kind]);
        copiedTimer.current[kind] = window.setTimeout(() => {
          if (mounted.current) setPhase((cur) => ({ ...cur, [kind]: cur[kind] === "copied" ? "idle" : cur[kind] }));
        }, 2000);
      },
      (error: unknown) => {
        busy.current[kind] = false;
        if (!mounted.current) return;
        setPhase((cur) => ({ ...cur, [kind]: "idle" }));
        setNote(error instanceof Error ? error.message : MINT_FAILED);
      },
    );
  }

  async function endWatchLinks() {
    setRevokeNote("");
    try {
      const res = await fetch("/api/apartment/watch-revoke", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!mounted.current) return;
      if (!res.ok || !body.ok) {
        setRevokeNote("Couldn't stop watching. Try again.");
        return;
      }
      setShown((cur) => ({ ...cur, watch: null }));
      setRevokeNote(body.message ?? WATCH_REVOKE_DONE);
    } catch {
      if (mounted.current) setRevokeNote(NO_CONNECTION);
    }
  }

  const ready = Boolean(shown.line || shown.watch);
  const isUpdated = (k: Kind) => freshUntil[k] > now;
  return (
    <div className="hud-stack invite-tab" data-invite-section="" data-invite-state={ready ? "live" : note ? "error" : "loading"}>
      <p className="hud-quiet invite-intro">Copy one and send it right away. Each works once.</p>
      <CopyField label="Invite an agent" kind="line" shown={shown.line} phase={phase.line} updated={isUpdated("line")} onCopy={() => copy("line")} />
      <CopyField label="Let a person watch" kind="watch" shown={shown.watch} phase={phase.watch} updated={isUpdated("watch")} onCopy={() => copy("watch")}>
        <button type="button" className="invite-revoke mono" onClick={() => void endWatchLinks()} data-watch-revoke="">
          {WATCH_REVOKE_BUTTON}
        </button>
        {revokeNote ? (
          <p className="hud-quiet" role="status">
            {revokeNote}
          </p>
        ) : null}
      </CopyField>
      {note ? (
        <p className="hud-quiet" role="alert" data-invite-note="">
          {note}
        </p>
      ) : null}
      <div className="hud-row invite-foot">
        <span className="hud-quiet mono" data-account-email="">
          {me?.role === "owner" ? me.email : ""}
        </span>
      </div>
    </div>
  );
}

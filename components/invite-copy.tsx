"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { createInviteLine } from "@/components/room/door-client";
import { ownerSession } from "@/components/room/owner-session";
import { PUBLIC_JOIN_COPY } from "@/lib/join-line";

export type InviteCopyResult = { line: string; copied: boolean };

/**
 * v20: mint a fresh invite (owner only, POST /api/door) and copy the line it comes back in.
 * Call this SYNCHRONOUSLY inside the tap handler: the clipboard write starts during the tap with a
 * promise of the line, so iPhone Safari allows it even though the line is fetched. Falls back to
 * writeText, then to { copied: false } so the caller shows the line to select by hand.
 * Rejects (with the server's message) when minting is refused: not the owner, paused, or rate-limited.
 */
export function startInviteCopy(): Promise<InviteCopyResult> {
  const pending = createInviteLine();
  let copy: Promise<void>;
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      // A promise of a text/plain Blob: the form iPhone Safari, Chrome and Firefox all accept in ClipboardItem.
      const blob = pending.then((text) => new Blob([text], { type: "text/plain" }));
      copy = navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    } else {
      copy = Promise.reject(new Error("no ClipboardItem"));
    }
  } catch (error) {
    copy = Promise.reject(error);
  }
  copy.catch(() => {});
  return (async () => {
    const line = await pending;
    try {
      await copy;
      return { line, copied: true };
    } catch {
      /* try the plain write next */
    }
    try {
      await navigator.clipboard.writeText(line);
      return { line, copied: true };
    } catch {
      return { line, copied: false };
    }
  })();
}

type Phase = "idle" | "busy" | "copied" | "failed";

let owner: boolean | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (owner === null) {
    void ownerSession().then((session) => {
      if (owner === session.door) return;
      owner = session.door;
      for (const fn of listeners) fn();
    });
  }
  return () => listeners.delete(listener);
}

/** True only once the owner cookie is confirmed to open the Door. */
function useIsOwner() {
  return useSyncExternalStore(subscribe, () => owner === true, () => false);
}

/**
 * v20 "Bring your agent" spot (landing and HUD Activity). Non-owners get one plain line, no Copy button,
 * no code, no placeholder. The owner gets a Copy button that mints a fresh invite on the spot.
 */
export function BringYourAgent({ variant }: { variant: "landing" | "hud" }) {
  const isOwner = useIsOwner();
  const quiet = variant === "landing" ? "landing-note" : "hud-quiet";
  if (!isOwner) return <p className={`${quiet} public-join`} data-public-join="">{PUBLIC_JOIN_COPY}</p>;
  return <OwnerCopy variant={variant} />;
}

function OwnerCopy({ variant }: { variant: "landing" | "hud" }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [line, setLine] = useState("");
  const [note, setNote] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function copy() {
    if (phase === "busy") return;
    setNote("");
    setPhase("busy");
    const run = startInviteCopy();
    void run.then(
      (result) => {
        setLine(result.line);
        if (!result.copied) {
          setPhase("failed");
          return;
        }
        setPhase("copied");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setPhase((now) => (now === "copied" ? "idle" : now)), 4000);
      },
      (error: unknown) => {
        setPhase("idle");
        setNote(error instanceof Error ? error.message : "The door didn't answer.");
      },
    );
  }

  const quiet = variant === "landing" ? "landing-note" : "hud-quiet";
  const busy = phase === "busy";
  const label = phase === "copied" ? "Copied" : "Copy";
  return (
    <div className="invite-copy-wrap" data-owner-copy="" data-copy-state={phase}>
      <button
        type="button"
        className={variant === "landing" ? "invite-copy mono" : "hud-chip is-solid invite-copy-hud"}
        onClick={copy}
        aria-busy={busy}
      >
        {busy ? <span className="copy-spin" aria-hidden /> : phase === "copied" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {variant === "landing" ? label.toUpperCase() : label}
      </button>
      {phase === "copied" ? <p className={quiet}>Copied. Paste it to your agent.</p> : null}
      {phase === "failed" ? (
        <>
          <p className={quiet}>Couldn&apos;t copy. Select and copy it.</p>
          <p className={`${quiet} invite-line`} data-invite-line="">
            {line}
          </p>
        </>
      ) : null}
      {note ? <p className={quiet}>{note}</p> : null}
    </div>
  );
}

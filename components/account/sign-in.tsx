"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { refreshMe } from "./me";

type Phase = "email" | "sending" | "sent" | "resending";

const NO_CONNECTION = "Can't connect. Check your connection.";
/** Writer (r2): Supabase allows 2 sign-in emails an hour; our 429 (or Supabase's, mapped) reads the same. */
const EMAIL_LIMIT = "Too many emails for now. Try again in an hour.";

const SIGNIN_NOTES: Record<string, string> = {
  expired: "That sign-in link has expired or was already used. Send a new one.",
  invalid: "That sign-in link isn't complete. Send a new one.",
  unavailable: "Sign-in isn't available right now. Try again soon.",
};

/** Reads #watch=<code> once, removes it from the address bar, and returns it. */
function takeWatchCode() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = hash.get("watch") ?? "";
  if (hash.has("watch")) {
    hash.delete("watch");
    const rest = hash.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
  }
  return code;
}

/**
 * v21 sign-in screen (/room for anyone without a session). Email -> Supabase's default magic-link email; the
 * link signs in only this browser (PKCE). No codes to type. A watch link (#watch=...) is redeemed here into a
 * read-only watch session.
 */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("email");
  const [note, setNote] = useState(() => {
    if (typeof window === "undefined") return "";
    const why = new URLSearchParams(window.location.search).get("signin");
    return why ? (SIGNIN_NOTES[why] ?? SIGNIN_NOTES.invalid) : "";
  });
  const [watchNote, setWatchNote] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.hash.replace(/^#/, "")).has("watch") ? "Opening the watch link…" : "",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("signin")) {
      params.delete("signin");
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    }
    const watch = takeWatchCode();
    if (!watch) return;
    void (async () => {
      try {
        const res = await fetch("/api/watch/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: watch }) });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && body.ok) {
          setWatchNote("");
          await refreshMe();
          return;
        }
        setWatchNote(body.error ?? "This watch link isn't valid. Ask the owner for a new one.");
      } catch {
        setWatchNote(NO_CONNECTION);
      }
    })();
  }, []);

  /** POST /api/auth/otp: the server asks Supabase for its default magic-link email (PKCE, this browser). */
  async function request(again: boolean) {
    if (phase === "sending" || phase === "resending") return;
    setNote("");
    setPhase(again ? "resending" : "sending");
    const back: Phase = again ? "sent" : "email";
    try {
      const res = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (!res.ok || !body.ok) {
        setPhase(back);
        setNote(res.status === 429 ? EMAIL_LIMIT : (body.error ?? "We couldn't send the email. Try again."));
        return;
      }
      setPhase("sent");
    } catch {
      setPhase(back);
      setNote(NO_CONNECTION);
    }
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    void request(false);
  }

  const sent = phase === "sent" || phase === "resending";
  return (
    <div className="landing min-h-dvh signin-page" data-signin="">
      <header className="landing-head mono">
        <Link href="/">
          <b>Living Room</b>
        </Link>
        <span className="landing-head-sheet">LR–01 · 1:50</span>
        <span>Private</span>
      </header>
      <main className="signin-main">
        <section className="signin-card">
          <p className="landing-kicker mono">Your apartment</p>
          <h1 className="landing-title signin-title">
            Sign in to open <span>your apartment.</span>
          </h1>
          <p className="landing-lede">One account, one private apartment. Only you and people you send a watch link can see it.</p>
          {watchNote ? (
            <p className="signin-note" role="status" data-watch-note="">
              {watchNote}
            </p>
          ) : null}
          {!sent ? (
            <form className="signin-form" onSubmit={send}>
              <label className="mono" htmlFor="signin-email">
                EMAIL
              </label>
              <input
                id="signin-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" className="invite-copy signin-submit mono" aria-busy={phase === "sending"} disabled={phase === "sending"}>
                {phase === "sending" ? "SENDING…" : "EMAIL ME A SIGN-IN LINK"}
              </button>
            </form>
          ) : (
            <div className="signin-form signin-sent" data-signin-sent="">
              <p className="signin-note" role="status">
                Check your email and tap the link. Open it in this browser.
              </p>
              <p className="signin-note signin-quiet">It comes from Supabase. Not there? Check spam.</p>
              <div className="signin-actions">
                <button type="button" className="signin-resend" onClick={() => void request(true)} disabled={phase === "resending"} aria-busy={phase === "resending"} data-signin-resend="">
                  Send it again
                </button>
                <button type="button" className="signin-resend" onClick={() => { setPhase("email"); setNote(""); }}>
                  Use a different email
                </button>
              </div>
            </div>
          )}
          {note ? (
            <p className="signin-note is-error" role="alert">
              {note}
            </p>
          ) : null}
          <p className="landing-note">Have a watch link? Open it on this device and you&apos;ll see that apartment, read-only.</p>
        </section>
      </main>
    </div>
  );
}

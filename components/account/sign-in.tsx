"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { refreshMe } from "./me";

type Phase = "email" | "sending" | "sent" | "verifying";

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
 * v21 sign-in screen (/room for anyone without a session). Email -> a one-time link (and a code, when the
 * email template includes one). A watch link (#watch=...) is redeemed here into a read-only watch session.
 */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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
        setWatchNote("Can’t reach the room. Try the link again.");
      }
    })();
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "sending") return;
    setNote("");
    setPhase("sending");
    try {
      const res = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setPhase("email");
        setNote(body.error ?? "We couldn't send the email. Try again.");
        return;
      }
      setPhase("sent");
    } catch {
      setPhase("email");
      setNote("Can’t reach the room. Check your connection.");
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "verifying") return;
    setNote("");
    setPhase("verifying");
    try {
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setPhase("sent");
        setNote(body.error ?? "That code didn't work.");
        return;
      }
      await refreshMe();
    } catch {
      setPhase("sent");
      setNote("Can’t reach the room. Check your connection.");
    }
  }

  const sent = phase === "sent" || phase === "verifying";
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
          <p className="landing-lede">Each account has one private apartment. Only you can see it, and anyone you send a watch link.</p>
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
              <button type="submit" className="invite-copy mono" aria-busy={phase === "sending"} disabled={phase === "sending"}>
                {phase === "sending" ? "SENDING…" : "EMAIL ME A SIGN-IN LINK"}
              </button>
            </form>
          ) : (
            <form className="signin-form" onSubmit={verify}>
              <p className="signin-note" role="status">
                Check your email. Open the link on this device, or type the code from the email.
              </p>
              <label className="mono" htmlFor="signin-code">
                CODE
              </label>
              <input
                id="signin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="submit" className="invite-copy mono" disabled={phase === "verifying" || code.replace(/\s/g, "").length < 6}>
                {phase === "verifying" ? "CHECKING…" : "SIGN IN"}
              </button>
              <button type="button" className="signin-link mono" onClick={() => { setPhase("email"); setCode(""); }}>
                Use a different email
              </button>
            </form>
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

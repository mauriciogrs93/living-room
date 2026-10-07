"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LEFT_APARTMENT } from "@/lib/apartments/copy";
import { refreshMe } from "./me";
import { passwordIssue } from "@/lib/auth/password";
import {
  ALREADY_HAVE,
  CREATE_ACCOUNT,
  CREATE_CHECK_EMAIL,
  CREATE_LINK,
  CREATE_TITLE,
  CREATING,
  DIFFERENT_EMAIL,
  ENTER_EMAIL,
  ENTER_PASSWORD,
  HIDE,
  HIDE_PASSWORD,
  INTRO,
  LABEL_EMAIL,
  LABEL_PASSWORD,
  MAGIC_LINK,
  MAGIC_SENT,
  MAGIC_SPAM,
  NO_CONNECTION,
  OR_DIVIDER,
  PASSWORD_HINT,
  SEND_AGAIN,
  SHOW,
  SHOW_PASSWORD,
  SIGN_IN,
  SIGNING_IN,
  SIGNIN_NOTES,
  TOO_LONG,
  TOO_MANY,
  TOO_SHORT,
  UNAVAILABLE,
} from "@/lib/auth/strings";

type Mode = "signin" | "signup" | "magic";
type Phase = "form" | "sending" | "sent" | "resending";

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

/** Password is the primary sign-in. The magic link stays a secondary button. */
export function SignIn({ signupEnabled = false }: { signupEnabled?: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
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

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "sending") return;
    setNote("");
    if (!email.trim()) {
      setNote(ENTER_EMAIL);
      return;
    }
    const issue = passwordIssue(password);
    if (issue === "empty") {
      setNote(ENTER_PASSWORD);
      return;
    }
    if (issue === "short") {
      setNote(TOO_SHORT);
      return;
    }
    if (issue === "long") {
      setNote(TOO_LONG);
      return;
    }
    setPhase("sending");
    const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/password";
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; signedIn?: boolean };
      if (res.status === 404 && mode === "signup") {
        setMode("signin");
        setPhase("form");
        return;
      }
      if (!res.ok || !body.ok) {
        setPhase("form");
        setNote(res.status === 429 ? TOO_MANY : (body.error ?? UNAVAILABLE));
        return;
      }
      if (mode === "signup" && body.signedIn === false) {
        setPhase("sent");
        return;
      }
      await refreshMe();
    } catch {
      setPhase("form");
      setNote(NO_CONNECTION);
    }
  }

  async function requestLink(again: boolean) {
    if (phase === "sending" || phase === "resending") return;
    setNote("");
    if (!email.trim()) {
      setNote(ENTER_EMAIL);
      return;
    }
    setPhase(again ? "resending" : "sending");
    const back: Phase = again ? "sent" : "form";
    try {
      const res = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setPhase(back);
        setNote(body.error ?? UNAVAILABLE);
        return;
      }
      setPhase("sent");
    } catch {
      setPhase(back);
      setNote(NO_CONNECTION);
    }
  }

  const sent = phase === "sent" || phase === "resending";
  const signupSent = sent && mode === "signup";
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
          <h1 className="landing-title signin-title">{mode === "signup" ? CREATE_TITLE : <>Sign in to open <span>your apartment.</span></>}</h1>
          <p className="landing-lede">{INTRO}</p>
          {watchNote ? (
            <p className="signin-note" role="status" data-watch-note="">
              {watchNote}
            </p>
          ) : null}
          {signupSent ? (
            <div className="signin-form signin-sent" data-signin-sent="">
              <p className="signin-note" role="status">
                {CREATE_CHECK_EMAIL}
              </p>
              <p className="signin-note signin-hint">{MAGIC_SPAM}</p>
              <button type="button" className="signin-text" data-auth-control="back-to-signin" onClick={() => { setMode("signin"); setPhase("form"); setNote(""); }}>
                {ALREADY_HAVE}
              </button>
            </div>
          ) : mode === "magic" && sent ? (
            <div className="signin-form signin-sent" data-signin-sent="">
              <p className="signin-note" role="status">
                {MAGIC_SENT}
              </p>
              <p className="signin-note signin-hint">{MAGIC_SPAM}</p>
              <div className="signin-actions">
                <button type="button" className="signin-resend" data-signin-resend="" data-auth-control="resend" onClick={() => void requestLink(true)} disabled={phase === "resending"}>
                  {SEND_AGAIN}
                </button>
                <button type="button" className="signin-resend" data-auth-control="different-email" onClick={() => { setPhase("form"); setNote(""); }}>
                  {DIFFERENT_EMAIL}
                </button>
              </div>
              <button type="button" className="signin-text" data-auth-control="back-to-password" onClick={() => { setMode("signin"); setPhase("form"); setNote(""); }}>
                {SIGN_IN}
              </button>
            </div>
          ) : mode === "magic" ? (
            <form className="signin-form" onSubmit={(event) => { event.preventDefault(); void requestLink(false); }}>
              <label htmlFor="signin-email">
                {LABEL_EMAIL}
              </label>
              <input id="signin-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              <button type="submit" className="signin-secondary" data-auth-control="magic-submit" disabled={phase === "sending"}>
                {phase === "sending" ? SIGNING_IN : MAGIC_LINK}
              </button>
              <button type="button" className="signin-text" data-auth-control="back-to-password" onClick={() => { setMode("signin"); setNote(""); }}>
                {SIGN_IN}
              </button>
            </form>
          ) : (
            <form className="signin-form" onSubmit={(event) => void submitPassword(event)}>
              <label htmlFor="signin-email">
                {LABEL_EMAIL}
              </label>
              <input id="signin-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="signin-password">
                {LABEL_PASSWORD}
              </label>
              <div className="signin-password">
                <input
                  id="signin-password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="button" className="signin-resend" aria-pressed={show} aria-label={show ? HIDE_PASSWORD : SHOW_PASSWORD} data-auth-control="show-password" onClick={() => setShow((value) => !value)}>
                  {show ? HIDE : SHOW}
                </button>
              </div>
              {mode === "signup" ? <p className="signin-hint">{PASSWORD_HINT}</p> : null}
              <button type="submit" className="invite-copy signin-submit mono" data-auth-control={mode === "signup" ? "create-submit" : "sign-in"} disabled={phase === "sending"} aria-busy={phase === "sending"}>
                {phase === "sending" ? (mode === "signup" ? CREATING : SIGNING_IN) : mode === "signup" ? CREATE_ACCOUNT : SIGN_IN}
              </button>
              {mode === "signin" ? (
                <>
                  <p className="signin-or">{OR_DIVIDER}</p>
                  <button type="button" className="signin-secondary" data-auth-control="magic" onClick={() => { setMode("magic"); setPhase("form"); setNote(""); }}>
                    {MAGIC_LINK}
                  </button>
                  {signupEnabled ? (
                    <button type="button" className="signin-text" data-auth-control="create-account" onClick={() => { setMode("signup"); setNote(""); }}>
                      {CREATE_LINK}
                    </button>
                  ) : null}
                </>
              ) : (
                <button type="button" className="signin-text" data-auth-control="back-to-signin" onClick={() => { setMode("signin"); setNote(""); }}>
                  {ALREADY_HAVE}
                </button>
              )}
            </form>
          )}
          {note ? (
            <p className={note === LEFT_APARTMENT ? "signin-note" : "signin-note is-error"} role={note === LEFT_APARTMENT ? "status" : "alert"} {...(note === LEFT_APARTMENT ? { "data-left-apartment": "" } : {})}>
              {note}
            </p>
          ) : null}
          <p className="landing-note">Have a watch link? Open it on this device and you&apos;ll see that apartment, read-only.</p>
        </section>
      </main>
    </div>
  );
}

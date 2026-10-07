"use client";

import { useState } from "react";
import { refreshMe } from "./me";
import { closePasswordOffer, dismissPasswordOffer } from "./password-offer-state";
import { passwordIssue } from "@/lib/auth/password";
import {
  CANCEL,
  CHANGE_TITLE,
  CURRENT_PASSWORD,
  ENTER_PASSWORD,
  HIDE,
  HIDE_PASSWORD,
  LABEL_PASSWORD,
  NEW_PASSWORD,
  NO_CONNECTION,
  NOT_NOW,
  OFFER_BODY,
  OFFER_TITLE,
  PASSWORD_HINT,
  PASSWORD_SAVED,
  SAVE_FAILED,
  SAVE_PASSWORD,
  SAVING,
  SHOW,
  SHOW_PASSWORD,
  TOO_LONG,
  TOO_MANY,
  TOO_SHORT,
} from "@/lib/auth/strings";

/** First password, or a change when one already exists. Same card as sign-in. */
export function PasswordOffer({ passwordSet }: { passwordSet: boolean }) {
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [show, setShow] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNote("");
    if (passwordSet && !current) {
      setNote(ENTER_PASSWORD);
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
    setBusy(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passwordSet ? { password, currentPassword: current } : { password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setNote(res.status === 429 ? TOO_MANY : (body.error ?? SAVE_FAILED));
        setBusy(false);
        return;
      }
      setSaved(true);
      setBusy(false);
      await refreshMe();
      window.setTimeout(() => closePasswordOffer(), 1200);
    } catch {
      setBusy(false);
      setNote(NO_CONNECTION);
    }
  }

  return (
    <div className="password-offer" data-password-offer="">
      <button type="button" className="password-offer-scrim" aria-label="Close" data-ctl="offer-scrim" data-auth-control="offer-scrim" onClick={() => dismissPasswordOffer()} />
      <section className="signin-card password-offer-sheet" role="dialog" aria-modal="true" aria-labelledby="offer-title">
        <span className="password-offer-grab" aria-hidden="true" />
        <button type="button" className="password-offer-close" aria-label="Close" data-ctl="offer-close" data-auth-control="offer-close" onClick={() => dismissPasswordOffer()}>
          ×
        </button>
        <h2 id="offer-title" className="landing-title signin-title">{passwordSet ? CHANGE_TITLE : OFFER_TITLE}</h2>
        {passwordSet ? null : <p className="signin-hint">{OFFER_BODY}</p>}
        {saved ? (
          <p className="signin-note" role="status" data-password-saved="">
            {PASSWORD_SAVED}
          </p>
        ) : (
          <form className="signin-form" onSubmit={(event) => void save(event)}>
            {passwordSet ? (
              <>
                <label htmlFor="offer-current">{CURRENT_PASSWORD}</label>
                <div className="signin-password">
                  <input
                    id="offer-current"
                    name="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    autoComplete="current-password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                  />
                  <button type="button" className="signin-resend" aria-pressed={showCurrent} aria-label={showCurrent ? HIDE_PASSWORD : SHOW_PASSWORD} data-ctl="offer-show-current" data-auth-control="offer-show-current" onClick={() => setShowCurrent((value) => !value)}>
                    {showCurrent ? HIDE : SHOW}
                  </button>
                </div>
              </>
            ) : null}
            <label htmlFor="offer-password">{passwordSet ? NEW_PASSWORD : LABEL_PASSWORD}</label>
            <div className="signin-password">
              <input
                id="offer-password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="button" className="signin-resend" aria-pressed={show} aria-label={show ? HIDE_PASSWORD : SHOW_PASSWORD} data-ctl="offer-show" data-auth-control="offer-show" onClick={() => setShow((value) => !value)}>
                {show ? HIDE : SHOW}
              </button>
            </div>
            <p className="signin-hint">{PASSWORD_HINT}</p>
            <button type="submit" className="invite-copy signin-submit mono" data-ctl="offer-save" data-auth-control="save-password" disabled={busy} aria-busy={busy}>
              {busy ? SAVING : SAVE_PASSWORD}
            </button>
            {passwordSet ? (
              <button type="button" className="signin-text" data-ctl="offer-cancel" data-auth-control="cancel" onClick={() => closePasswordOffer()}>
                {CANCEL}
              </button>
            ) : (
              <button type="button" className="signin-text" data-ctl="offer-not-now" data-auth-control="not-now" onClick={() => dismissPasswordOffer()}>
                {NOT_NOW}
              </button>
            )}
          </form>
        )}
        {note ? (
          <p className="signin-note is-error" role="alert" data-password-note="">
            {note}
          </p>
        ) : null}
      </section>
    </div>
  );
}

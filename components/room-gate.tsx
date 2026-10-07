"use client";

import { useEffect, useState } from "react";
import { WatchApp } from "./watch-app";
import { SignIn } from "./account/sign-in";
import { PasswordOffer } from "./account/password-offer";
import { usePasswordOfferOpen } from "./account/password-offer-state";
import { WATCH_ENDED_COPY } from "@/lib/apartments/copy";
import { useMe } from "./account/me";
import { useWatchEnded } from "./account/watch-ended";

/** v21 /room: the signed-in owner or a watch-link guest sees the apartment; everyone else, the sign-in screen. */
function WatchEnded({ message }: { message: string }) {
  return (
    <div className="landing min-h-dvh signin-page" data-watch-ended="">
      <main className="signin-main">
        <p className="signin-note" role="status">
          {message}
        </p>
      </main>
    </div>
  );
}

export function RoomGate({ origin = "", signupEnabled = false }: { origin?: string; signupEnabled?: boolean }) {
  const me = useMe();
  const watchEnded = useWatchEnded();
  const passwordSet = me?.role === "owner" ? Boolean(me.passwordSet) : true;
  const offerOpen = usePasswordOfferOpen(passwordSet);
  const [watchWhileSignedIn] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.hash.replace(/^#/, "")).has("watch"));
  useEffect(() => {
    if (me?.role !== "owner") return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (!hash.has("watch")) return;
    hash.delete("watch");
    const rest = hash.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
  }, [me?.role]);
  if (!me) return <div className="landing min-h-dvh" aria-busy="true" data-gate="loading" />;
  if (me.role === "none") return <SignIn signupEnabled={signupEnabled} />;
  if (me.role === "error") {
    if (me.message === WATCH_ENDED_COPY) return <WatchEnded message={me.message} />;
    return (
      <div className="landing min-h-dvh signin-page" data-gate="error">
        <main className="signin-main">
          <p className="signin-note is-error" role="alert">
            {me.message}
          </p>
        </main>
      </div>
    );
  }
  if (me.role === "watch" && watchEnded) return <WatchEnded message={watchEnded} />;
  return (
    <>
      {watchWhileSignedIn && me.role === "owner" ? (
        <p className="hud-offline" role="status">
          You&apos;re signed in, so this shows your own apartment. Sign out to use that watch link.
        </p>
      ) : null}
      <WatchApp origin={origin} role={me.role} />
      {me.role === "owner" && offerOpen ? <PasswordOffer passwordSet={Boolean(me.passwordSet)} /> : null}
    </>
  );
}

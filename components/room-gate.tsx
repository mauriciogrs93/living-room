"use client";

import { useEffect, useState } from "react";
import { WatchApp } from "./watch-app";
import { SignIn } from "./account/sign-in";
import { useMe } from "./account/me";

/** v21 /room: the signed-in owner or a watch-link guest sees the apartment; everyone else, the sign-in screen. */
export function RoomGate({ origin = "" }: { origin?: string }) {
  const me = useMe();
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
  if (me.role === "none") return <SignIn />;
  if (me.role === "error") {
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
  return (
    <>
      {watchWhileSignedIn && me.role === "owner" ? (
        <p className="hud-offline" role="status">
          You&apos;re signed in, so this shows your own apartment. Sign out to use that watch link.
        </p>
      ) : null}
      <WatchApp origin={origin} role={me.role} />
    </>
  );
}

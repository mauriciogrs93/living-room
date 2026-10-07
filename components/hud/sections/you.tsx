"use client";

import { useEffect } from "react";
import { reopenPasswordOffer } from "@/components/account/password-offer-state";
import { YOU_SET_PASSWORD } from "@/lib/auth/strings";
import { markRepliesSeen, OwnerThread } from "@/components/room/owner-notes";

export function YouSection() {
  useEffect(() => {
    markRepliesSeen();
  });
  return (
    <div className="hud-stack">
      <button type="button" className="door-link" data-ctl="you-set-password" data-auth-control="you-set-password" onClick={() => reopenPasswordOffer()}>
        {YOU_SET_PASSWORD}
      </button>
      <OwnerThread />
    </div>
  );
}

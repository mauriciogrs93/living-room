"use client";

import { playFromCard, pressMutePill } from "@/components/room/ambience";
import { RADIO_CONTROLS, type RadioControl } from "@/lib/room/room-sound";
import { MUTE, PLAY, RADIO_OFF, UNMUTE } from "./strings";

/** The local Play, Unmute, and Mute buttons. The visible words stay the writer strings. */
export function RadioActionButtons({ action, owner, live }: { action: RadioControl; owner: boolean; live: boolean }) {
  return (
    <>
      {action === RADIO_CONTROLS.play && (live || !owner) ? (
        <button type="button" className="hudf-play is-resume" data-ctl="radio-resume" onClick={() => playFromCard()}>
          <span aria-hidden="true">▶</span>
          {PLAY}
        </button>
      ) : null}
      {action === RADIO_CONTROLS.unmute ? (
        <button type="button" className="hudf-play" data-ctl="radio-mute" onClick={pressMutePill}>
          {UNMUTE}
        </button>
      ) : null}
      {action === RADIO_CONTROLS.mute && !owner ? (
        <button type="button" className="hudf-play" data-ctl="radio-mute" onClick={pressMutePill}>
          {MUTE}
        </button>
      ) : null}
      {!owner && !live && action !== RADIO_CONTROLS.play ? <p className="is-info hudf-quiet">{RADIO_OFF}</p> : null}
    </>
  );
}

"use client";

import { useAmbience } from "@/components/room/ambience";
import { useAtmosphere } from "@/components/room/atmosphere";
import type { HudModel } from "../model";
import { tapRadio } from "../radio";

export function NowSection({ model }: { model: HudModel }) {
  const { label, clock, place } = useAtmosphere();
  const { muted, toggleMute, hearing } = useAmbience();
  const radio = model.snapshot?.radio;
  const where = place ? `${label} in ${place}` : label;
  const playing = Boolean(radio?.on);

  return (
    <div className="hud-stack">
      <p className="hud-kicker">Here</p>
      <p className="hud-line">
        {where}
        {clock ? ` · ${clock}` : ""}
      </p>
      <p className="hud-kicker">Radio</p>
      <p className="hud-line">{playing ? radio?.name || "On" : "Off"}</p>
      <div className="hud-row">
        <button type="button" className="hud-chip" onClick={() => tapRadio(playing || hearing ? "off" : "on")}>
          {playing || hearing ? "Pause" : "Play"}
        </button>
        <button type="button" className="hud-chip" onClick={() => tapRadio("next")}>
          Next
        </button>
      </div>
      <p className="hud-kicker">Room sound</p>
      <button type="button" className="hud-chip" data-mute="" aria-pressed={muted} onClick={toggleMute}>
        {muted ? "Sound off" : "Sound on"}
      </button>
    </div>
  );
}

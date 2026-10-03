"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Ambience } from "./room/ambience";
import { AtmosphereProvider, useAtmosphere } from "./room/atmosphere";
import { BookReader } from "./room/house-ui";
import { GlobalTape } from "./room/global-tape";
import { HouseFallback, RoomStageBoundary } from "./room/house-fallback";
import { DoorProvider, useDoorAccess, useKnockCount } from "./room/door-client";
import { OwnerMailProvider } from "./room/owner-notes";
import { useRoom } from "./use-room";
import { HudChrome } from "./hud/chrome";
import { useHudHash } from "./hud/hash";
import type { HudModel } from "./hud/model";
import { RadioBridge, tapRadio } from "./hud/radio";
import { sectionKnown } from "./hud/registry";
import { hudTokens } from "./hud/tokens";
import { WhisperLayer } from "./hud/whispers";
import { MAQUETTE } from "./room/maquette/config";
import type { DoorMeshProps } from "./room/maquette/door-mesh";

const RoomCanvas = dynamic(() => import("@/components/room/room-canvas").then((mod) => mod.RoomCanvas), {
  ssr: false,
  loading: () => <HouseFallback />,
});

export function WatchApp({ origin = "" }: { origin?: string }) {
  return (
    <AtmosphereProvider>
      <OwnerMailProvider>
        <DoorProvider>
          <RoomWatch origin={origin} />
        </DoorProvider>
      </OwnerMailProvider>
    </AtmosphereProvider>
  );
}

function RoomWatch({ origin = "" }: { origin?: string }) {
  const { snapshot, status } = useRoom();
  const { night } = useAtmosphere();
  const hud = useHudHash(sectionKnown);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [shot, setShot] = useState(false);
  const doorAccess = useDoorAccess();
  const ownerKnocks = useKnockCount();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Desktop width toggle (undecided by the Founder): open the room card on first load on desktop when the flag is on.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (MAQUETTE.desktopCardOpenByDefault && window.innerWidth >= 800 && !window.location.hash) hud.open("now");
  }, [hud]);

  // The camera frames the house into the space the card leaves; phone notes yield to an open sheet.
  useEffect(() => {
    const root = document.documentElement;
    if (hud.section) root.dataset.card = hud.section;
    else delete root.dataset.card;
    window.dispatchEvent(new Event("maquette-layout"));
  }, [hud.section]);

  function selectAgent(id: string | null) {
    if (!id) {
      setSelectedId(null);
      if (hud.section) hud.close();
      return;
    }
    setShot(false);
    setSelectedId((current) => (current === id ? null : id));
    hud.open("activity");
  }

  // 3D front door: derived from the public door field the room snapshot already carries (no extra requests).
  // Unlocked reads as "open"; pending knocks animate the leaf. Owners get the exact knock count from the Door
  // provider they already run, and tapping the door opens their Door tab.
  const publicDoor = snapshot?.door;
  const door: (DoorMeshProps & { knocks: number }) | null = publicDoor
    ? {
        locked: publicDoor.locked,
        open: !publicDoor.locked,
        knocking: publicDoor.knocking || (doorAccess && ownerKnocks > 0),
        knocks: doorAccess ? ownerKnocks : 0,
        onTap: doorAccess ? () => hud.open("door") : undefined,
      }
    : null;

  const model: HudModel = {
    snapshot,
    status,
    now,
    origin,
    selectedId,
    selectAgent,
    openBooks: () => setReaderOpen(true),
    diaryOpen,
    setDiaryOpen,
  };

  return (
    <Ambience snapshot={snapshot}>
      <RadioBridge snapshot={snapshot} />
      <div className={`room-root has-tape relative h-dvh w-full overflow-hidden${night ? " is-night" : ""}${shot ? " is-shot" : ""}${hud.section ? " has-card" : ""}`} style={hudTokens}>
        <GlobalTape />
        <div className="room-stage-slot absolute inset-0">
          {snapshot ? (
            <RoomStageBoundary fallback={<HouseFallback agents={snapshot.agents} />}>
              <RoomCanvas
                snapshot={snapshot}
                selectedId={selectedId}
                onSelectAgent={selectAgent}
                deck="min"
                door={door}
                onOpenBooks={() => setReaderOpen(true)}
                onTapRadio={() => tapRadio("on")}
                onTapDog={() => {
                  void fetch("/api/dog", { method: "POST" });
                }}
              />
            </RoomStageBoundary>
          ) : (
            <HouseFallback />
          )}
        </div>
        {/* drawing-sheet caption: desktop only, hidden while a card or the Tonight story is open (CSS) */}
        <aside className="sheet-caption" aria-hidden="true">
          <b>FIG. 1 · THE LIVING ROOM</b>
          <span>LR–01 · SECTION A–A · 1:50</span>
          <span className="sheet-scalebar">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="sheet-scale-num">
            <span>0</span>
            <span>1</span>
            <span>2 M</span>
          </span>
        </aside>
        {status === "offline" && <p className="hud-offline">Can’t reach the room. This page will keep trying.</p>}
        <WhisperLayer events={snapshot?.events ?? []} live={Boolean(snapshot)} />
        <HudChrome model={model} shot={shot} setShot={setShot} night={night} />
        {readerOpen && <BookReader onClose={() => setReaderOpen(false)} />}
      </div>
    </Ambience>
  );
}

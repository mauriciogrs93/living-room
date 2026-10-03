"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Ambience } from "./room/ambience";
import { AtmosphereProvider, useAtmosphere } from "./room/atmosphere";
import { BookReader } from "./room/house-ui";
import { GlobalTape } from "./room/global-tape";
import { HouseFallback, RoomStageBoundary } from "./room/house-fallback";
import { DoorProvider } from "./room/door-client";
import { OwnerMailProvider } from "./room/owner-notes";
import { useRoom } from "./use-room";
import { HudChrome } from "./hud/chrome";
import { useHudHash } from "./hud/hash";
import type { HudModel } from "./hud/model";
import { RadioBridge, tapRadio } from "./hud/radio";
import { sectionKnown } from "./hud/registry";
import { hudTokens } from "./hud/tokens";
import { WhisperLayer } from "./hud/whispers";

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

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
      <div className={`room-root has-tape relative h-dvh w-full overflow-hidden text-[#3A2A1E]${night ? " is-night" : ""}${shot ? " is-shot" : ""}`} style={hudTokens}>
        <GlobalTape />
        <div className="room-stage-slot absolute inset-0">
          {snapshot ? (
            <RoomStageBoundary fallback={<HouseFallback agents={snapshot.agents} />}>
              <RoomCanvas
                snapshot={snapshot}
                selectedId={selectedId}
                onSelectAgent={selectAgent}
                deck="min"
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
        {status === "offline" && <p className="hud-offline">Can’t reach the room. This page will keep trying.</p>}
        <WhisperLayer events={snapshot?.events ?? []} live={Boolean(snapshot)} />
        <HudChrome model={model} shot={shot} setShot={setShot} night={night} />
        {readerOpen && <BookReader onClose={() => setReaderOpen(false)} />}
      </div>
    </Ambience>
  );
}

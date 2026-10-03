"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const DeckContext = createContext({ bottom: 118 });

type Note = { id: number; text: string };

type FidgetValue = {
  lampFlip: boolean;
  tvFlip: boolean;
  curtainsOpen: boolean;
  kettleOn: boolean;
  cabinetOpen: boolean;
  fridgeUntil: number;
  plantNudge: number;
  bookOut: boolean;
  cushion: boolean;
  note: Note | null;
  lightOn: Record<string, boolean>;
  say: (text: string) => void;
  setLightOn: (id: string, on: boolean) => void;
  toggleLamp: () => void;
  toggleTv: () => void;
  toggleCurtains: () => void;
  toggleKettle: () => void;
  toggleCabinet: () => void;
  peekFridge: () => void;
  nudgePlant: () => void;
  toggleBook: () => void;
  puffCushion: () => void;
  clearLampFlip: () => void;
  clearTvFlip: () => void;
};

const FidgetContext = createContext<FidgetValue | null>(null);

export function useFidgets() {
  const value = useContext(FidgetContext);
  if (!value) throw new Error("Room interactions are missing.");
  return value;
}

export function FidgetProvider({ children }: { children: ReactNode }) {
  const [lampFlip, setLampFlip] = useState(false);
  const [tvFlip, setTvFlip] = useState(false);
  const [curtainsOpen, setCurtainsOpen] = useState(true);
  const [kettleOn, setKettleOn] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [fridgeUntil, setFridgeUntil] = useState(0);
  const [plantNudge, setPlantNudge] = useState(0);
  const [bookOut, setBookOut] = useState(false);
  const [cushion, setCushion] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [lightOn, setLights] = useState<Record<string, boolean>>({});

  const say = useCallback((text: string) => {
    setNote({ id: Date.now(), text });
  }, []);

  const setLightOn = useCallback((id: string, on: boolean) => {
    setLights((current) => (current[id] === on ? current : { ...current, [id]: on }));
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 1600);
    return () => clearTimeout(timer);
  }, [note]);

  const value = useMemo<FidgetValue>(
    () => ({
      lampFlip,
      tvFlip,
      curtainsOpen,
      kettleOn,
      cabinetOpen,
      fridgeUntil,
      plantNudge,
      bookOut,
      cushion,
      note,
      lightOn,
      say,
      setLightOn,
      toggleLamp: () => setLampFlip((current) => !current),
      toggleTv: () => setTvFlip((current) => !current),
      toggleCurtains: () => setCurtainsOpen((current) => !current),
      toggleKettle: () => setKettleOn((current) => !current),
      toggleCabinet: () => setCabinetOpen((current) => !current),
      peekFridge: () => setFridgeUntil(Date.now() + 2400),
      nudgePlant: () => setPlantNudge((current) => current + 1),
      toggleBook: () => setBookOut((current) => !current),
      puffCushion: () => setCushion((current) => !current),
      clearLampFlip: () => setLampFlip(false),
      clearTvFlip: () => setTvFlip(false),
    }),
    [lampFlip, tvFlip, curtainsOpen, kettleOn, cabinetOpen, fridgeUntil, plantNudge, bookOut, cushion, note, lightOn, say, setLightOn],
  );

  return <FidgetContext.Provider value={value}>{children}</FidgetContext.Provider>;
}

export function FidgetNote() {
  const { note } = useFidgets();
  if (!note) return null;
  return (
    <div className="fidget-note" role="status">
      {note.text}
    </div>
  );
}

import type { LiveSnapshot, RoomStatus } from "@/components/use-room";

export type HudModel = {
  snapshot: LiveSnapshot | null;
  status: RoomStatus;
  now: number;
  origin: string;
  selectedId: string | null;
  selectAgent: (id: string | null) => void;
  openBooks: () => void;
  diaryOpen: boolean;
  setDiaryOpen: (open: boolean) => void;
};

export type BadgeTone = "on" | "off" | "mail";

export type BadgeRead = {
  tone: BadgeTone;
  count?: number;
};

export type BadgeContext = {
  agents: number;
  unseen: number;
  owner: boolean;
};

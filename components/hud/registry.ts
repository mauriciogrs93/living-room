"use client";

import type { ComponentType } from "react";
import type { HudModel } from "./model";
import { ActivitySection } from "./sections/activity";
import { DoorSection } from "./sections/door";
import { InviteSection } from "./sections/invite";
import { NowSection } from "./sections/now";
import { YouSection } from "./sections/you";

export type HudSection = {
  id: string;
  title: string;
  icon: "sun" | "list" | "mail" | "door";
  order: number;
  ownerOnly?: boolean;
  /** v21: only the signed-in apartment owner (the account). */
  accountOnly?: boolean;
  render: ComponentType<{ model: HudModel }>;
};

/**
 * One line per section. A future Stats, Dog, or Weather detail is a new file
 * plus a row here. Badges live in ./badges.ts.
 */
export const HUD_SECTIONS: HudSection[] = [
  { id: "now", title: "Now", icon: "sun", order: 10, render: NowSection },
  { id: "activity", title: "Activity", icon: "list", order: 20, render: ActivitySection },
  { id: "you", title: "You", icon: "mail", order: 30, ownerOnly: true, render: YouSection },
  { id: "invite", title: "Invite", icon: "door", order: 5, accountOnly: true, render: InviteSection },
  { id: "door", title: "Door", icon: "door", order: 40, accountOnly: true, render: DoorSection },
];

export function visibleSections(owner: boolean, account = false) {
  return HUD_SECTIONS.filter((section) => (!section.ownerOnly || owner) && (!section.accountOnly || account)).sort((a, b) => a.order - b.order);
}

export function sectionKnown(id: string) {
  return HUD_SECTIONS.some((section) => section.id === id);
}

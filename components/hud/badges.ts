import type { BadgeContext, BadgeRead } from "./model";

export type HudBadgeModule = {
  id: string;
  order: number;
  ownerOnly?: boolean;
  read: (ctx: BadgeContext) => BadgeRead | null;
};

export const liveBadge: HudBadgeModule = {
  id: "live",
  order: 10,
  read: (ctx) => ({ tone: ctx.agents > 0 ? "on" : "off", count: ctx.agents }),
};

export const mailBadge: HudBadgeModule = {
  id: "mail",
  order: 20,
  ownerOnly: true,
  read: (ctx) => (ctx.owner && ctx.unseen > 0 ? { tone: "mail" } : null),
};

export const HUD_BADGES: HudBadgeModule[] = [liveBadge, mailBadge];

export function readBadges(ctx: BadgeContext) {
  return HUD_BADGES.filter((badge) => !badge.ownerOnly || ctx.owner)
    .sort((a, b) => a.order - b.order)
    .map((badge) => ({ id: badge.id, mark: badge.read(ctx) }))
    .filter((badge): badge is { id: string; mark: BadgeRead } => Boolean(badge.mark));
}

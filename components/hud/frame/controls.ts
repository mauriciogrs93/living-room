/**
 * Every rendered control. Info text is not listed: it is not a control.
 * effect: request:<path> | open:<card> | close | device:<key> | navigate | focus
 */
export type HudRole = "owner" | "watch";

export type HudControl = {
  roles: HudRole[];
  effect: string;
};

const both = ["owner", "watch"] as HudRole[];
const owner = ["owner"] as HudRole[];
const watch = ["watch"] as HudRole[];

export const HUD_CONTROLS: Record<string, HudControl> = {
  signout: { roles: owner, effect: "request:/api/auth/signout" },
  "you-signout": { roles: owner, effect: "request:/api/auth/signout" },
  leave: { roles: watch, effect: "request:/api/auth/signout" },
  "you-leave": { roles: watch, effect: "request:/api/auth/signout" },
  "here-count": { roles: both, effect: "open:here" },
  "here-tab": { roles: both, effect: "open:here" },
  "here-name": { roles: both, effect: "focus" },
  "tape-today": { roles: both, effect: "open:today" },
  "rail-today": { roles: both, effect: "open:today" },
  "rail-radio": { roles: both, effect: "open:radio" },
  "rail-tv": { roles: both, effect: "open:tv" },
  "rail-sky": { roles: both, effect: "open:sky" },
  "card-close": { roles: both, effect: "close" },
  "sheet-scrim": { roles: both, effect: "close" },
  "radio-play": { roles: owner, effect: "request:/api/radio {intent:on}" },
  "radio-stop": { roles: owner, effect: "request:/api/radio {intent:off}" },
  "radio-mute": { roles: watch, effect: "device:living-room-mute" },
  "radio-prev": { roles: owner, effect: "request:/api/radio {intent:prev}" },
  "radio-next": { roles: owner, effect: "request:/api/radio {intent:next}" },
  "tv-power": { roles: owner, effect: "request:/api/tap {id:tv}" },
  "tv-watch": { roles: both, effect: "device:watch-live" },
  "today-event": { roles: both, effect: "open:activity" },
  "sky-look": { roles: owner, effect: "request:/api/tap {id:window}" },
  "strip-task": { roles: both, effect: "open:activity" },
  "strip-chat": { roles: both, effect: "open:activity" },
  "nav-room": { roles: both, effect: "close" },
  "nav-activity": { roles: both, effect: "open:activity" },
  "nav-invite": { roles: owner, effect: "open:invite" },
  "nav-people": { roles: both, effect: "open:people" },
  "nav-you": { roles: both, effect: "open:you" },
  "pill-today": { roles: both, effect: "open:today" },
  "pill-radio": { roles: both, effect: "open:radio" },
  "pill-stop": { roles: owner, effect: "request:/api/radio {intent:off}" },
  "pill-mute": { roles: watch, effect: "device:living-room-mute" },
  "pill-handle": { roles: both, effect: "device:lr-hud-tuck" },
  "room-sound": { roles: both, effect: "device:living-room-mute" },
  "mute-pill": { roles: both, effect: "device:mute-pill" },
  "you-set-password": { roles: owner, effect: "open:password" },
  "offer-save": { roles: owner, effect: "request:/api/auth/update-password" },
  "offer-not-now": { roles: owner, effect: "device:lr-set-password-later" },
  "offer-cancel": { roles: owner, effect: "close" },
  "offer-show": { roles: owner, effect: "device:password-visibility" },
  "offer-show-current": { roles: owner, effect: "device:password-visibility" },
  "offer-close": { roles: owner, effect: "device:lr-set-password-later" },
  "offer-scrim": { roles: owner, effect: "device:lr-set-password-later" },
  "activity-close": { roles: both, effect: "focus" },
  "activity-diary": { roles: both, effect: "device:diary" },
  "activity-books": { roles: both, effect: "open:books" },
  "activity-agent": { roles: both, effect: "focus" },
  "activity-door": { roles: owner, effect: "navigate" },
  "invite-copy-line": { roles: owner, effect: "request:/api/apartment/invite" },
  "invite-copy-watch": { roles: owner, effect: "request:/api/apartment/invite" },
  "invite-revoke": { roles: owner, effect: "request:/api/apartment/watch-revoke" },
  "bring-agent": { roles: owner, effect: "device:clipboard" },
  "door-menu": { roles: owner, effect: "open:door-menu" },
  "door-resume": { roles: owner, effect: "request:/api/door" },
  "door-pause": { roles: owner, effect: "request:/api/door" },
  "door-invite": { roles: owner, effect: "request:/api/door" },
  "door-people": { roles: owner, effect: "open:door-people" },
  "door-trust": { roles: owner, effect: "request:/api/door" },
  "door-remove": { roles: owner, effect: "request:/api/door" },
  "door-untrust": { roles: owner, effect: "request:/api/door" },
  "door-unblock": { roles: owner, effect: "request:/api/door" },
  "note-ask": { roles: owner, effect: "focus" },
  "note-send": { roles: owner, effect: "request:/api/note" },
  "note-block": { roles: owner, effect: "request:/api/owner/leave" },
  "note-home": { roles: owner, effect: "request:/api/owner/leave" },
  "note-back": { roles: owner, effect: "close" },
  "book-close": { roles: both, effect: "close" },
  "book-open": { roles: both, effect: "open:book" },
  "book-prev": { roles: both, effect: "device:page" },
  "book-next": { roles: both, effect: "device:page" },
  "computer-screen": { roles: both, effect: "open:computer" },
  "computer-search": { roles: both, effect: "device:apartment-search" },
  "yours-packages": { roles: owner, effect: "open:yours-packages" },
  "yours-music": { roles: owner, effect: "open:yours-music" },
  "yours-city": { roles: owner, effect: "open:yours-city" },
};

for (let i = 0; i < 8; i += 1) {
  HUD_CONTROLS[`radio-row-${i}`] = { roles: owner, effect: `request:/api/radio {intent:tune,station:${i}}` };
  HUD_CONTROLS[`radio-row-watch-${i}`] = { roles: watch, effect: "device:owner-only-station" };
}
for (let n = 1; n <= 5; n += 1) {
  HUD_CONTROLS[`tv-chip-${n}`] = { roles: owner, effect: `request:/api/tap {id:tv,channel:${n}}` };
  HUD_CONTROLS[`tv-chip-watch-${n}`] = { roles: watch, effect: "device:owner-only-channel" };
}

/** Yours cards render only for the owner, and only when the flag is on. */
export const YOURS_CARDS = [
  { id: "yours-packages", title: "Packages" },
  { id: "yours-music", title: "My music" },
  { id: "yours-city", title: "My city" },
] as const;

export function yoursCards(enabled: boolean, role: HudRole) {
  if (!enabled || role !== "owner") return [];
  return YOURS_CARDS.map((card) => card.title);
}

export function yoursControls(enabled: boolean, role: HudRole) {
  if (!enabled || role !== "owner") return [];
  return [...YOURS_CARDS.map((card) => card.id), "card-close"];
}

/** Which house-card controls render. Additions off turns owner actions into info (not rendered as controls). */
export function houseControls(role: HudRole, additions: { radioTune: boolean; tvChannel: boolean }, stations: number) {
  const ids = ["card-close", "rail-today", "rail-radio", "rail-tv", "rail-sky"];
  if (role === "owner") {
    ids.push("radio-play", "radio-stop", "radio-next", "tv-power", "sky-look");
    if (additions.radioTune && stations >= 2) {
      ids.push("radio-prev");
      for (let i = 0; i < stations && i < 8; i += 1) ids.push(`radio-row-${i}`);
    }
    if (additions.tvChannel) for (let n = 1; n <= 5; n += 1) ids.push(`tv-chip-${n}`);
  } else {
    ids.push("radio-mute");
  }
  return ids;
}

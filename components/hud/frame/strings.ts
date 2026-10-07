/** Copy for the HUD frame. Word for word from the writer notes. */
export const TITLE_OWNER = "Your apartment";
export const TITLE_WATCH = "The apartment";

/** Watcher title. A real display name becomes "{name}'s apartment". Unknown, empty, or an email stays "The apartment". */
export function apartmentTitle(name?: string | null): string {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 40 || clean.includes("@")) return TITLE_WATCH;
  if (!/^[\p{L}][\p{L}\p{M}'’.-]*(?: [\p{L}][\p{L}\p{M}'’.-]*)*$/u.test(clean)) return TITLE_WATCH;
  return `${clean}'s apartment`;
}

const APARTMENT_SUFFIX = "'s apartment";

/** When a possessive title cannot fit, shorten the name and keep the suffix whole. */
export function fitApartmentTitle(title: string, maxChars = 80): string {
  if (!title.endsWith(APARTMENT_SUFFIX) || title.length <= maxChars) return title;
  const room = Math.max(1, maxChars - APARTMENT_SUFFIX.length);
  let name = title.slice(0, -APARTMENT_SUFFIX.length).slice(0, room).trimEnd();
  const cut = name.lastIndexOf(" ");
  if (cut > 0) name = name.slice(0, cut);
  return `${name || title.slice(0, 1)}${APARTMENT_SUFFIX}`;
}
export const BADGE_WATCH = "WATCHING · READ-ONLY";
export const HERE = "Here";
export const HERE_EMPTY = "No one's home right now.";

/** Watchers with an empty room get one quiet line. Owners, and any room with an agent, get none. */
export function hereEmptyCopy(role: string, agentCount = 0): string {
  return role === "watch" && agentCount === 0 ? HERE_EMPTY : "";
}
export const RADIO_OFF = "The radio is off.";
export const PLAY = "Play";
export const STOP = "Stop";
export const MUTE = "Mute";
export const UNMUTE = "Unmute";
export const PREVIOUS = "Previous station";
export const NEXT = "Next station";
export const PLAYING = "Playing";
export const PLAYS = (station: string) => `Plays ${station}`;
export const STREAM_FAIL = "Can't play this station right now.";
export const ACTION_FAIL = "That didn't go through. Try again.";
export const TV_OFF_WATCH = "The TV is off.";
export const TV_OFF = "Off";
export const TURN_ON = "Turn on";
export const TURN_OFF = "Turn off";
export const LOOK_OUTSIDE = "Look outside";
export const WATCH_LIVE = "Watch live";
export const PLAYS_FROM_YOUTUBE = "Plays from YouTube.";
export const SKY_FOLLOWS = "The sky follows the house.";
export const SEARCH_APARTMENT = "Search the apartment";
export const SEARCH_EMPTY = "Nothing in the apartment matches.";
export const TODAY_EMPTY = "Nothing new today.";
export const SUNSET = (time: string) => `Sunset at ${time}.`;
export const SUNRISE = (time: string) => `Sunrise at ${time}.`;
export const OPENS_NEW_TAB = "(opens in a new tab)";
export const ACTIVITY = "Activity";
export const SHOW_CONTROLS = "Show controls";
export const CLOSE = "Close";
export const ROOM_SOUND = "Room sound";
export const WATCH_YOU = "You're watching. Only the owner can change things here.";
export const OWNER_ONLY = "Only the owner can change things here.";
export const OWNER_STATION = "Only the owner can change the station.";
export const OWNER_CHANNEL = "Only the owner can change the channel.";
export const SOUND_ON = "On";
export const SOUND_OFF = "Off";
export const COMING_SOON = "Coming soon.";
export const HOUSE = "House";
export const DAY = "Day";
export const DUSK = "Dusk";
export const NIGHT = "Night";
export const NOTHING = "Nothing new today.";
export const OFFLINE = "Can't connect. Check your connection.";

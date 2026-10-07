# Next version: copy for the visual-only HUD frame (Writer, Oct 6 2026, 7:35 PM ET)

Research and docs only, no code touched. Built on Interactivity's wiring map (`interactivity.md`), Security's rules (`security.md`), Draft 3 (`/workspace/hud-frame/draft3/`) and the v21 ship code (`f7c3daa`).
Strings are word for word. `{x}` is a value filled in at runtime, rendered as plain text and capped (Security section 5). Phone labels on the rail, nav and pill stay at 8 characters or less.

## Rules for every string in this build
1. A line that names an outside service, or says what happens to someone's data, ships only once that thing is real. So in this build there is nothing about Open-Meteo, 17TRACK or Spotify, and no Yours privacy header.
2. A line that names what a button will do is shown only when we know it for sure. Otherwise it's hidden, never guessed (same rule as "Plays {station}").
3. Watchers never see a button they can't use. Instead of a button that returns a 403, they get a plain line of text saying what's going on.
4. Strings already in Draft 3's `hud.html` stay final, except the ones this file hides or replaces.

## Top bar
| Item | Owner | Watcher |
|---|---|---|
| Title | "Your apartment" | "{name}'s apartment" ({name} = display name, never the email) |
| Badge | "OWNER" | "WATCHING · READ-ONLY", with the button **"Leave"** (v21 says "Stop") |
| Counters | "{n} here" · "{n} watching" | "{n} here" (hide "watching" for watchers) |
| Place chip | "{place} · {time}" (replaces "18° Rain") | Same |

**Why "Leave" and not "Stop":** with the frame, the radio's big button and the tuck pill both say "Stop". If a second "Stop" ends the whole watch, a watcher who taps it thinking it stops the music gets thrown out. "Leave" says exactly what it does. This is a copy-only change in `components/watch-app.tsx`.

## Here tab and list
- Tab: "Here" (count beside it).
- Empty: "No one's home right now." (the existing v21 line).
- A name with no camera focus behind it is plain text, not a button.

## Radio card
| State | Owner | Watcher |
|---|---|---|
| Idle (house radio off) | Big button "Play". Under it "Plays {station}", hidden if unknown | No button. Line: "The radio is off." |
| Playing | Big button "Stop". Station name + "{city} · {genre}" | Big button "Mute" / "Unmute" (this device only) |
| Next | Icon button, label "Next station" | Hidden |
| Back (only with addition A) | Icon button, label "Previous station" | Hidden |
| Station rows | With A: tap to tune. Without A: plain text. The current row is marked; its accessible label is "Playing" | Plain text, current row marked |
| Latest line | "{agent} put on {station}. · {time}" | Same |
| Can't load the stream on this device | "Can't play this station right now." (owner also keeps "Next") | Same line, no button |

**Why "Mute" / "Unmute" for watchers, not "Sound on" / "Sound off":** a button that says "Sound off" could be telling you the sound is off or offering to turn it off. "Mute" can only mean one thing, it's short, and it can't be mistaken for the owner's Play/Stop, which changes the house for everyone. If the Founder prefers to keep v21's wording, "Sound on" / "Sound off" works, as long as it shows the action and not the state.

**Room sound (You panel, both roles):** a switch labelled "Room sound". A switch shows its own state, so on and off need no words. It's the same setting as Mute on the Radio card and the pill.

## TV card (5 house channels, no YouTube in this build)
| State | Owner | Watcher |
|---|---|---|
| Header | "TV · {channel}" when on, "TV" when off | Same |
| Picture panel | Channel name on the channel's colours. When off: "Off" | Same |
| Off | Big button "Turn on". Under it "Plays {channel}" if we know which channel it comes back on, otherwise hidden | Line: "The TV is off." |
| On | Big button "Turn off" | No button |
| Channel chips | With B: tap to switch. Without B: plain text, current chip marked ("Playing") | Plain text, current marked |
| Latest line | "{agent} switched to {channel}. · {time}" | Same |
| Hidden in this build | "Watch live", the thumbnail, "Plays from YouTube." | Same |

Resolved (Interactivity, 7:24 PM): the v21 ship code has no YouTube or iframe anywhere, so "Watch live" and "Plays from YouTube." stay hidden in this build.

## Sky card
- "{place} · {time}" and one word: "Day", "Dusk" or "Night".
- Window line: the current outside view, as v21 already writes it.
- Owner button: **"Look outside"**. Tapping it gets a new view and the line updates. Watchers get no button.
- Nothing about temperature or "your city" in this build.

## Today card
- One plain sentence per item. Sun line (only if `sunsetTime()` ships; otherwise hide it, never show placeholder times): "Sunset at {time}." before sunset, and "Sunrise at {time}." after it, in the house time the clock chip uses. Example: "Sunset at 6:30 PM."
- Headlines with a link open in a new tab. Their accessible label adds "(opens in a new tab)".
- Latest house event, which opens Activity.
- Empty: "Nothing new today."
- The red dot shows only for items that are new since the last open.

## Yours (Packages, My music, My city)
**I recommend hiding the whole group, header included,** which matches Interactivity. Three buttons that each open "Coming soon." are three taps that lead nowhere, and the header "Only you see this…" promises privacy for something that doesn't exist yet. Leave it out until the first one is real, and it shows up then with its final wording from `NOTES.md`.
If the Founder wants them visible anyway: each card has its title, the line "Coming soon.", a close button, and nothing else. There's no header line and no fields.

## Tuck pill
- Today segment: "Today".
- Radio segment: "Radio · {station}" (cut off with "…" if it's too long).
- Owner: "Stop" while playing. Watcher: "Mute" / "Unmute" while playing.
- Idle handle (icon only): accessible label "Show controls".

## Strips and bottom nav
- Task strip: the task text plus "1/3" (plain text). The whole strip opens Activity.
- Chat strip: hint "Activity".
- Nav: Room · Activity · Invite · People · You. Watchers have no Invite.
- People panel, owner: "Here", then v21's Door strings unchanged ("Trusted", "Blocked", "Recent visitors", "Pause invites" / "Resume invites", "Old invites stop working.", "Trusted agents come in without an invite.").
- People panel, watcher: "Here" only.
- You panel, watcher: "You're watching. Only the owner can change things here." Then the "Room sound" switch and "Leave".
- Activity, watcher: no "Bring your agent".

## Icon-only controls (accessible labels)
- Close: "Close".
- Rail buttons: their visible label ("Today", "Radio", "TV", "Sky").
- Pill handle: "Show controls".
- Next or back: "Next station" / "Previous station".

## Feedback and errors
- An owner action that fails: "That didn't go through. Try again."
- Offline: "Can't connect. Check your connection." (the existing line).
- A watcher who taps a 3D object gets one short toast: "Only the owner can change things here."
- A 403 from the server is never shown raw. If one ever reaches a watcher, show the toast line above.
- Optional, copy only: change Invite's revoke error to "Couldn't stop watching. Try again." so it matches the "Stop all watching" button. It was on the v22 list, and this build touches that panel anyway.

## Optional server strings (Engineer's call, not needed for this build)
v21 logs owner taps as "A viewer…" (e.g. "A viewer turned the television on. It's showing {channel}."). Since v21, only the owner can tap, so "A viewer" is now wrong, and agents and watchers read these lines. Better: "The owner turned on the TV. It's showing {channel}." / "The owner turned off the TV." / "The owner looked outside. {view}". This keeps names out of what agents see. It's in `lib/room/engine-viewer.ts`, a server file, so it needs Security's OK.

## Decisions for the Founder (via Exec)
1. Yours: hide it (my recommendation, and Interactivity's) or show "Coming soon." cards.
2. Watcher sound button: "Mute" / "Unmute" (my recommendation) or keep "Sound on" / "Sound off".
3. Watcher badge button: "Leave" instead of "Stop" (recommended).

## Locked by Exec (7:25 PM)
- Yours is hidden in this build, header included.
- Additions A and B are in, so the back button ("Previous station"), tappable station rows and tappable channel chips are real. Their "without A/B" plain-text fallbacks above no longer apply.
- Watchers get "Mute" / "Unmute", and the watch badge button is "Leave". YouTube stays hidden.

## Update 7:40 PM (Founder's 7:35 go lists "coming-soon cards that open and close")
If Yours ships as cards: Packages, My music and My city each open a card with only the title, "Coming soon." and the close button. The Yours header line ("Only you see this…") stays out until something real is in there.

## 404 (any unknown path, including made-up /watch/ paths)
Per Security: same page for every unknown path, never echoes the path, never hints whether a code exists.
- Title: "This page isn't here."
- Link: "Go to the Living Room" (to /room)

## Update 7:47 PM: TODO-WRITER gaps from the HUD brief (engineer-kb/hud/brief.md §9, §17)
- Watcher title while v21 has no display name (17.3): "The apartment". Switch to "{name}'s apartment" once a display name exists. Never the email.
- Radio tune 400 (§6 A): API error text "Pick a station from the list." is approved as-is. The HUD never shows it; the owner sees "That didn't go through. Try again."
- 404 split (17.5): agree. Made-up /watch/ paths: "This watch link isn't valid. Ask the owner for a new one." with the link "Go to the Living Room". Every other path: "This page isn't here." / "Go to the Living Room".
- Watcher Unmute starting the house station on their own device (17.19): wording stays "Mute" / "Unmute".
- Coming-soon cards behind the flag (17.1): title, "Coming soon." and close only, as in the 7:40 update.

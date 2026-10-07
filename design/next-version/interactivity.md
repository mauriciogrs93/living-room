# Next version: HUD frame wiring map (Interactivity), Oct 6 2026

Research and docs only, no code touched. Sources: Draft 3 (`/workspace/hud-frame/draft3/html/hud.html`, `NOTES.md`) and the v21 ship code (`/workspace/living-room-v21-ship`, commit `f7c3daa`).

## What "visual-only" means here
The new frame sits on top of what v21 can already do. There are no new outside services: no YouTube player, Spotify, 17TRACK, or Open-Meteo. Every control gets exactly one of these:
- **Real (shared)**: calls an existing v21 endpoint, changes the house for everyone, and shows up in Activity and what agents see.
- **Real (this device)**: works only on the viewer's screen (open a card, tuck, sound on/off). It never reaches the room or agents.
- **Info**: shows text and looks like text. No hover, no chevron, no pressed state. It is not a control, so it cannot be dead.
- **Hidden**: anything whose function doesn't exist yet is left out of the build, not shown greyed out.

## Five facts from the v21 code that change Draft 3
1. **Watchers are read-only.** Every write from a watch link gets a 403 with "This is a read-only watch link. Only the owner can change things here." So each control below has an owner column and a watcher column.
2. **Radio can only go on, off, and to the next station** (`/api/radio`, owner only, intents `on`, `off`, `next`). There is no previous and no "play this station." The station list is the house's saved list (up to 8 stations from Radio Browser).
3. **The TV plays the 5 house channels** (Meadow, Midnight News, Cartoon Hour, Rain, Supper Club) plus the headline tape. There is no YouTube. A viewer tap can only switch the power. Only agents can change the channel (`tv_channel`).
4. **There's no weather.** The sky follows the house clock and the real sunset at the house. The top-bar chip today reads "{place} · {time}".
5. **There's no People panel.** The existing panels are Now (Here, Radio, Room sound), Activity (In the house, Latest, diary, Bring your agent), Invite, Door (Trusted, Blocked, Recent visitors), and You (owner only).

## Two small server additions (Engineer to confirm), or the control is hidden
- **A.** `/api/radio` gets `{"intent":"prev"}` and `{"intent":"tune","station":<index>}`. Without them, hide the back button and make the station rows Info.
- **B.** `/api/tap` gets `{"id":"tv","channel":1-5}` for the owner. Without it, the channel chips are Info and show which channel is on.
Both are a few lines on top of existing logic (`currentStation` and the agent `tv_channel` code). Everything else below needs no new server work.

## Wiring map

### Top bar
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Apartment title ("Your apartment" / "{name}'s apartment") | Info | Info | No |
| OWNER badge | Info | Replaced by the existing "WATCHING · READ-ONLY" badge, Info | No |
| "2 here" counter | Opens the Here list (same as the Here tab) | Same | No |
| "1 watching" counter | Opens Invite, at the watch links | Info. Hide it if v21 has no live watcher count (Engineer to check) | No |
| Clock | Info (house time) | Info | No |
| Temperature "18° Rain" | **Hidden**. Use v21's "{place} · {time}" chip, as Info | Same | No |

### Left "Here" tab
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Here tab (count + chevron) | Opens the Here list: agents in the house, from the existing Now section. Tapping again or ✕ closes it | Same | No |
| A name in the list | Info, unless v21 already has camera focus on an agent (Engineer to check). If it does, tapping centres the camera on them | Same | No |

### Right column, House
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Today | Opens the Today card. Clears the red dot (last-open time stored on the device) | Same | No |
| Radio | Opens the Radio card. The eq bars show only while the house radio is on | Same | No |
| TV | Opens the TV card | Same | No |
| Sky | Opens the Sky card | Same | No |
| Rail button while its card is open | Closes the card (toggle). The dark ring marks the open one | Same | No |

### Right column, Yours (Packages, My music, My city)
All three need services that aren't in a visual-only build (17TRACK, Spotify, Open-Meteo). **Recommendation: hide the whole Yours group and its divider** until each one ships for real. That also gives the room more height.
The alternative, if the Founder wants them visible: each button opens a card with Writer's honest "not connected yet" line and only a ✕. That means no fields, no Track button, and no fake player. **Founder to decide (via Exec).**

### Radio card
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| ✕ | Closes the card. Sound keeps playing (closing never changes sound) | Same | No |
| Big Play (idle) | `/api/radio` `on`. Becomes Stop. Activity line: "{name} put on {station}." | Becomes "Unmute" / "Mute" (Writer, final), which is v21's existing room sound toggle and works on this device only | Owner: yes. Watcher: no |
| Big Stop (playing) | `/api/radio` `off` | Not shown. Watchers get "Mute" instead | Owner: yes |
| "Plays {station}" line (idle) | Info: `currentStation` is always known on the server, so it's never a guess. Hidden while playing | Same | No |
| Back button | Addition A, else **Hidden** | Hidden | Owner: yes |
| Forward button | `/api/radio` `next` (works today) | Hidden | Owner: yes |
| Station rows | Addition A: tap tunes to that row. Otherwise Info, with the current row marked | Info | Owner: yes |
| "Poppy put on Jazz24. · 6:41 PM" | Info (latest radio event) | Same | No |
| Scroll-hint chevron (phone) | Scrolls the body down to the next whole row. Hides at the end | Same | No |

### TV card
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Header "TV · {channel}" | Info | Info | No |
| Picture area | Draft 3's YouTube thumbnail and "Watch live" are **Hidden**. In their place, a flat panel in the channel's own colours (`color`, `accent`) with the channel name, which costs nothing | Same | No |
| Big button "Turn on" / "Turn off" (new strings, ask Writer) | `/api/tap` `tv` (power). Logs "A viewer turned the television on." | Hidden. Watchers see "On · {channel}" or "Off" as Info | Owner: yes |
| Channel chips (5 house channels) | Addition B: tap switches the channel. Otherwise Info, with the current chip marked | Info | Owner: yes |
| Short-phone swipe row (≤700 px tall) | Same chips in one scroll-snap row. Swiping scrolls, tapping does the above. No hidden chips beyond the 5 | Same | Owner: yes, when tapped |
| "Plays from YouTube." | **Hidden** until real TV ships | Hidden | No |
| Latest TV event line | Info | Info | No |

### Today card (from existing data)
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Sunset line, e.g. "Sunset at 6:52 PM." | Info (house sunset, already computed) | Same | No |
| Headline items (the gentle news list) | Open the story in a new tab when it has a link. Otherwise Info | Same | No |
| Latest house event | Opens Activity | Same | No |
| ✕ | Closes the card | Same | No |

### Sky card (from existing data)
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| "{place} · {time}" and Day / Dusk / Night | Info | Info | No |
| Window line (the current outside view) | Info | Info | No |
| "Look outside" (new string, ask Writer) | `/api/tap` `window`: new view, logged | Hidden | Owner: yes |
| ✕ | Closes the card | Same | No |

### Strips
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Task strip (whole strip) | Opens Activity. "1/3" is Info and rotates on the shared 1 s timer (every ~6 s), so it is not a separate pager button | Same | No |
| Chat strip (whole strip, "Activity ›") | Opens Activity | Same | No |

### Bottom nav
| Control | Owner | Watcher | Reaches room or agents? |
|---|---|---|---|
| Room | Closes any panel or card and goes back to the room | Same | No |
| Activity | Existing Activity panel (In the house, Latest, diary toggle, Bring your agent) | Same, without "Bring your agent" | Diary toggle: no |
| Invite | Existing Invite panel ("Invite an agent", "Let a person watch", end watch links) | **Hidden** (owner only today) | Yes (links) |
| People | New panel built only from existing data: the Here list, plus the Door panel's Trusted / Blocked / Recent visitors and pause or resume invites | Here list only | Door actions: yes |
| You | Existing You panel (notes, mail, sign out) plus the "Room sound" toggle | "Watching · read-only", Mute / Unmute, "Leave" (`/api/watch/end`, also on the watch badge, never labelled "Stop") | No |

### Tuck and untuck (all on this device only)
| Trigger | Result |
|---|---|
| About 8 s with no tap | Frame slides away with a CSS transform. The canvas resizes once after the slide. Never on a first visit, never with a card or panel open, never while a finger or keyboard focus is in the frame |
| Pill: Today segment | Untucks and opens the Today card |
| Pill: "Radio · {station}" segment | Untucks and opens the Radio card |
| Pill: Stop (44 px) | Owner: radio `off` (shared). Watcher: "Mute" for this device |
| Pill: chevron handle (idle) | Untucks |
| Tap on empty room | Untucks |
| Tap on a 3D object while tucked | Does that object's action (see below). Radio and TV also untuck, because they open a card |
| Keyboard (Tab or Esc) | Untucks. Esc also closes the open card |
| Reduced motion | No slide. The frame fades or swaps instantly |

### 3D objects (existing v21 actions, logged and seen by agents)
| Object | Owner tap | Watcher tap |
|---|---|---|
| Radio | Opens the Radio card with a ring on the radio (no direct toggle, so HUD and object behave the same) | Opens the read-only Radio card |
| TV | Opens the TV card with a ring (replaces v21's tap-to-toggle; power is now in the card) | Opens the read-only TV card |
| Window | Opens the Sky card (power-user path to "Look outside") | Opens the Sky card |
| Computer | Existing monitor card | Existing monitor card, read-only |
| Lamp, living light, kitchen light, fridge, kettle, stove, sink, wardrobe, plant, bookshelf, sofa, dog | Existing toggles or actions, unchanged | One short toast with the existing read-only line: "Only the owner can change things here." No silent taps |

## What agents see
Only shared actions reach `/api/look` and Activity: radio on, off, next, and tune; TV power and channel; window; and the object taps above. Opening cards, tucking, the red dot, and Room sound are on the device only and never logged.

## For Tester (tap-every-control checklist)
Run every row twice, once signed in as owner and once with a watch link. Pass means exactly the result in the right column. Fail means any control that has a hover or pressed state but does nothing, any 403 shown as a raw error, and any hidden item (Yours, YouTube line, back button without A, chips that look tappable without B) still visible.

## Decisions needed (via Exec)
1. Yours group: hide it (my recommendation) or show honest "not connected yet" cards.
2. Approve additions A and B (small), or ship with back, station rows, and channel chips as Info.
3. Settled: the watcher's radio button reads "Mute" / "Unmute", and the watch badge's exit reads "Leave", not "Stop" (Writer).

## YouTube check (7:25 PM)
The v21 ship code (`f7c3daa`, excluding docs) has no `youtube` and no `iframe` anywhere. Security's note that the TV's YouTube player is "already live" doesn't match the code, so "Watch live" and "Plays from YouTube." stay hidden.

## Locked by Exec (7:25 PM)
- Yours is hidden in this build, including its divider and header.
- Additions A and B are in scope (Engineer, with Security review). So the back button (`prev`), tapping a station row (`tune` + station), and the TV channel chips (`/api/tap` tv + channel) are **Real (shared)** for the owner. Watchers still see them as Info.
- Watcher sound control reads "Mute" / "Unmute". The watch badge exit reads "Leave". YouTube stays hidden.

## 12. Phone and tablet sheet (Founder rule via Designer, 7:41 PM)
On phone and tablet, cards and menus open as a sheet over the room, and the room never shrinks. How the sheet behaves:
- **Tap on the dim area:** closes the sheet and does nothing else. The dim area is a plain see-through colour with no blur (Performance). The tap must never reach a 3D object underneath, so no light, TV or toast fires from it.
- **Swipe down:** closes the sheet only from the header or grab handle, or when the body is already scrolled to the top. Otherwise a swipe down just scrolls the body. The TV's horizontal channel row never closes the sheet.
- **Bottom nav:** stays live while a sheet is open. Tapping another item swaps the sheet's contents and never stacks a second sheet. Tapping Room closes the sheet.
- **Sound:** closing the sheet (✕, dim area, swipe, Esc) never starts or stops sound.
- **Tuck:** the frame never tucks while a sheet is open, as before.
- **Focus:** opening a sheet moves focus into it. Closing it returns focus to the control that opened it. Esc closes it.
- **Desktop (1200 px and wider, or fine pointer / mouse):** the card floats over the room. Same rule as phone and tablet: the room never shrinks and the canvas never resizes. The card is not docked from 1024 (Designer's call, settled by Exec).

## Front door (7:49 PM)
For the owner, the front door opens People. For a watcher it opens the Here list, with no toast (Writer: seeing who's home changes nothing, so "Only the owner…" would read wrong). Either way the tap is never silent.

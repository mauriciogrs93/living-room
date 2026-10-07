# Draft 5b / 6 — HUD control plan (Living Room Designer)

Oct 6 2026 ~11:52 PM ET. Mock chrome target for Designer; Engineer wires behind it. Tone: plain, short, implementable.

**Layout law (Founder #1 + Whiteout ref):** the apartment image **is** the whole background (full bleed). HUD chrome floats on the edges over the room — never a docked card/plate that insets and shrinks the room. Opening any control = **0 canvas resize**. Ref: `ref-whiteout-survival-hud.jpg`.

---
---

## Layout amendment — Whiteout Survival (Founder Oct 6 ~11:54 PM ET)

**Ref:** `/workspace/hud-frame/draft5/ref-whiteout-survival-hud.jpg`

The apartment image is the **whole background** (full bleed edge-to-edge). HUD chrome **floats on the edges** over the room:
- Top: tape + stats / identity strip (semi-transparent or light edge chrome)
- Right (and optionally left): icon rails as discrete floating medals — **no shared solid column that steals stage**
- Bottom: icon nav + chat/ticker strip floating over the room
- Sheets/cards still overlay **over** the full room (phone scrim / desktop float); **0 canvas resize**

**Not:** a docked plaster plate / display-case card with the room inset inside a beige frame that shrinks when chrome grows.

Draft **5c** mocks implement this amendment. Earlier 5b “shared plaster plate” pass is superseded by this reference.

### Soft-scene plate amend (Founder Oct 7 ~12:00 AM ET)

**Plate:** `room-in-scene-portrait.jpg` — apartment **baked into** the maquette yard (neighbors included). One full-bleed image covers the viewport (`object-fit: cover`).

**Prefer** the unified soft scene over stacking a separate maquette backdrop + cream-keyed room cutaway. HUD chrome still floats on the edges (tape / top / HOUSE medals / bottom strips+nav). Sheets overlay the full scene with **0 canvas resize**.

**Mock:** `draft5/html5c/` · shots `out5c/` · SBS `draft5c-sbs-*.png` (BEFORE = 5b `before5c/`).




## Overlay rules

| Surface | Behavior |
|---|---|
| **Phone sheet** | Full-width card over room + scrim `rgba(43,45,49,.28)` (no blur). Top bar, Today tape, bottom nav stay above. Sheet covers stage only. **0 canvas resize.** |
| **Desktop float** | Floating card over stage right edge. **No scrim.** Stage width unchanged. **0 canvas resize.** |
| **Canvas** | Camera-fit / refit is **never** called when tape shows, sheet opens, or float docks. HUD is DOM-only (0 draw calls). |
| **One player** | At most one media surface live (YouTube **or** radio audio). Close / Stop / Turn off unloads — never hide-and-keep. |

---

## Security notes

**YouTube (approved path)**  
- Load iframe **only** after tap on **Watch live**.  
- Host: `www.youtube-nocookie.com` only.  
- **Close** unloads the embed (remove from DOM, not `display:none`).  
- Thumbnail: bundled or proxied — never `i.ytimg.com` on first paint.  
- No other YT/Google origins on first paint.  
- Watcher play is on-device only when house channel is on and stream is allowed.

**Needs Security pass before ship (flag — do not wire until cleared)**  
- **Radio streams** — third-party audio origins (Radio Browser metadata + station URLs; no SomaFM embed).  
- **Weather / Sky** — Open-Meteo (or NWS) house-region call; attribution; cache cadence.  
- **Google bar on computer** — any search / Google UI surface on the in-room screen (origins, CSP, no silent third-party cookies).

---

## Out of scope

**Yours** (Packages, My music / Spotify, My city geolocation) stays hidden unless Founder reopens. No 17TRACK, Spotify embed, or visitor geolocation in 5b/6.

---

## Must-haves (Founder)

### 1. Controls with the image (no room shrink)

- **What it looks like:** Room fills the stage case at all times. Sheets/floats sit **over** the room; chrome (tape, top bar, HOUSE rail, bottom nav) frames it. Scrim dims the room on phone; room geometry unchanged.
- **Where it lives:** Principle for **all** surfaces — top bar / tape / stage / rail / sheet / object / bottom.
- **Owner vs watcher:** Same layout law for both. Watcher never gets a docked inset that eats stage pixels.
- **What “works for real” means:** Measure stage CSS rect idle vs sheet-open: identical width×height. No `camera.fit` / canvas style size change on open/close. Phone idle ≈ 295×443; desktop float leaves stage width alone.

### 2. Icon HOUSE rail + bottom nav

- **What it looks like:** Right **HOUSE** rail: medal icons (Radio · TV · Sky · Today) + short labels, medals ≥46 px, stroke bold, label weight 600 — icon-first. Bottom nav: icon **above** label, active underline; labels **Room · Activity · Invite · People · You** (sentence case).
- **Where it lives:** Rail (right column) + bottom.
- **Owner vs watcher:** Owner: all five bottom tabs (Invite present). Watcher: no Invite; People = Here list only.
- **What “works for real” means:** Each HOUSE medal opens its sheet/float (same target as object tap). Bottom tabs navigate real routes/panels. Active underline tracks current tab. Hit ≥44×44. Live text-only nav is replaced by this chrome.

### 3. Today news tape

- **What it looks like:** Thin DOM strip at top of grid (`--ticker-h` 30 px phone / 32 px desktop). Kicker **Today** + CSS marquee of one-sentence items (same voice as Today card). Examples: `Sunset at 6:30 PM.` · `The space station passes over tonight.` · `Light rain overnight, clearing by morning.` Red dot on kicker only when Today has something new. Empty → hide tape entirely.
- **Where it lives:** Tape (own grid row above top bar / with top chrome — never inside stage).
- **Owner vs watcher:** Both see the same house Today feed. Tap kicker → Today sheet.
- **What “works for real” means:** Items from house Today feed (On this day / ISS / sunset / agent radio notes as approved). Linked headlines: accessible label adds `(opens in a new tab)`. No JS polling storm; CSS transform only; **no** canvas refit when tape appears. Ship hide-when-empty.

### 4. TV / YouTube Watch live

- **What it looks like:** Sheet/float: 16:9 dark player well, center play, scrub + times, title + channel. Play affordance: **Watch live**. Under player: **Plays from YouTube.** Badge: **Playing**. Header: `TV · {channel}` when on, `TV` when off. Owner power: **Turn on** / **Turn off**. House channel chips (colour dots); selected chip drives title + well colour. Close control: **Close** (unloads).
- **Where it lives:** Sheet (phone) / float (desktop); also object (3D TV tap opens same sheet).
- **Owner vs watcher:** Owner: Turn on/off, chips, Watch live. Watcher: no power/chips that change house; if channel on + stream allowed → **Watch live** on their device; else plain line (never a dead button). Off: `The TV is off.`
- **What “works for real” means:** Engineer wires YouTube IFrame behind chrome: load on **Watch live** only; `youtube-nocookie`; **Close** removes iframe; one-player rule with radio. Channel chips call house TV state (`/api/tap` channel). 3D TV mirrors channel colour card, not the embed.

### 5. Real radio streams

- **What it looks like:** Radio sheet: station rows (44 px) with play-mark circle; current row shows radio icon idle, **eq bars + PLAYING** while on. Owner: Back · big Play/Stop · Next; idle hint **Plays {station}**. Header **Radio**; line **Now playing · {station}** when on.
- **Where it lives:** Sheet / float; rail medal; object (3D radio).
- **Owner vs watcher:** Owner: Play/Stop/Back/Next/tune (house shared). Watcher: no write controls; idle `The radio is off.`; playing → **Mute** / **Unmute** (this device only). Rows text-only for watcher.
- **What “works for real” means:** Real stream URLs (Radio Browser / curated house list — not stub silence, not SomaFM embed). Play starts audio on tap only. Stop unloads audio element. Agent tune shows in Activity: `{agent} put on {station}.` **Security pass required** before production origins.

### 6. Google bar on the computer

- **What it looks like:** In-room computer screen UI shows a calm search bar (Geist, plaster/graphite — not a pasted Google logo mark in the HUD). Tap opens Computer sheet/float with the same bar + results area (as-if-real chrome in mock).
- **Where it lives:** Object (computer screen in stage) + sheet/float when opened from object or (if added) a soft entry — not a HOUSE rail medal unless Founder adds one.
- **Owner vs watcher:** Shared look on the 3D screen. Interaction: owner can drive house computer state if product keeps it shared; watchers get read-only / on-device search only per Security — default mock: both can open the sheet; only cleared path may issue queries.
- **What “works for real” means:** Engineer wires search behind the bar only after **Security pass** (CSP, origins, no first-paint Google cookies). Until then: chrome + local placeholder results in mock; no live Google call in prod.

### 7. Weather on the windows / Sky

- **What it looks like:** Sky sheet: title **Sky**; line `Rain · 18° · Sunset 6:52 PM`; sub-line **The sky follows the house.** Owner button **Look outside**. Windows in 3D show weather (rain streaks / sky grade / lighting) matching house feed — not a fake static day forever.
- **Where it lives:** Sheet / float; rail **Sky**; object (window tap → Sky). Weather look also on **stage** (windows / sky).
- **Owner vs watcher:** Both see house sky. **Look outside** owner-only (`/api/tap window`). No My city chip in 5b/6 (Yours out of scope).
- **What “works for real” means:** House-region weather + sun/moon (Open-Meteo or NWS + SunCalc) drive window look and Sky lines. Server poll 15–30 min; agents can react. **Security pass** on weather origin before ship.

---

## Delights (extras)

### 8. Device Mute (watcher radio / TV sound)

- **What it looks like:** Secondary control **Mute** / **Unmute** (48 px in sheet; 44 px segment on tuck pill when chrome tucked). No red-dot, no house-wide meaning.
- **Where it lives:** Sheet (Radio/TV when media playing) + bottom tuck pill for watcher.
- **Owner vs watcher:** **Watcher only** for device mute. Owner Stop / Turn off is house-wide (different control).
- **What “works for real” means:** Mutes local `<audio>` / YouTube player volume on this device; **zero** API write. Unmute restores. Never sends `/api/radio` stop.

### 9. Tap furniture / objects → same sheet as rail

- **What it looks like:** Tap radio / TV / window (and computer) opens the **identical** sheet/float as the matching HOUSE medal (same header, same controls). No separate “object mode.”
- **Where it lives:** Object (stage) → sheet / float.
- **Owner vs watcher:** Owner: full sheet controls. Watcher: same sheet chrome, read-only + Mute/Watch live rules; write taps toast **Only the owner can change things here.** (never silent / raw 403).
- **What “works for real” means:** One sheet component keyed by `radio | tv | sky | computer | today`; object pick and rail medal set the same key. Hit meshes ≥ tap-friendly; no direct toggle that bypasses the sheet.

### 10. Name tags + speech notes

- **What it looks like:** Spatial tags above figures (name); speech notes as calm bubbles (e.g. `Poppy: The rain's nice today.`). Clamp inside room **case** rect, ≥8 px from case edges; never under sheet, pill, or rail.
- **Where it lives:** Stage (spatial over figures); tap note → Activity.
- **Owner vs watcher:** Same for both (shared room).
- **What “works for real” means:** Placer clamps to case (not raw canvas); refit when sheet opens/tucks **without** resizing canvas. Untrusted speech rendered as text, length-capped. Tester: 390×844 and 390×664 with Radio/TV open.

### 11. Watching count (owner)

- **What it looks like:** Top-bar chip **N watching** (e.g. `1 watching`). Hidden when count is 0 or feed unavailable.
- **Where it lives:** Top bar.
- **Owner vs watcher:** **Owner only.** Watcher never sees watching count (has Leave + WATCHING · READ-ONLY instead).
- **What “works for real” means:** Live watcher count from server; tap opens Invite at watch links. Hide if backend has no count. Update ≤1 Hz.

### 12. Day / night + weather lighting

- **What it looks like:** Room lighting and grade follow house clock (day → warm evening → night bounce) and weather (overcast / rain dim). HUD frame may stay plaster in 5b/6; night **frame** tokens optional later.
- **Where it lives:** Stage (3D lights / sky / windows).
- **Owner vs watcher:** Shared house time and weather — same for both.
- **What “works for real” means:** House clock + weather feed drive existing Draft 6 lighting path; lamps warm near real sunset. No continuous sway that fights render-on-demand. HUD still 0 draw calls.

### 13. Activity strip

- **What it looks like:** One live line at thumb height (task strip), e.g. `Basil is reading in the den.` Optional `1/3` rotates on shared 1 s timer (~every 6 s). No section label. Tap anywhere on strip → Activity.
- **Where it lives:** Bottom (above bottom nav) / stage-adjacent strip band.
- **Owner vs watcher:** Both see shared activity line.
- **What “works for real” means:** Fed from real agent activity events; rotation uses the single shared 1 Hz timer; opens Activity tab/panel. Not decorative lorem after ship.

### 14. Radio EQ / Playing cue

- **What it looks like:** On the current station row while playing: small animated eq bars + mono **PLAYING** (≈9 px). Idle current row: radio icon only. Optional subtle eq cue on 3D radio when house radio is on (CSS/DOM or cheap material pulse — not a second audio meter network).
- **Where it lives:** Sheet (station rows); optional object cue on stage radio.
- **Owner vs watcher:** Both see PLAYING mark when house radio is on; only owner rows are buttons.
- **What “works for real” means:** Cue tied to real `playing` state + current station id. Eq is CSS animation (no WebAudio analyser required for v1). Clears on Stop / station change.

---

## Control → surface map (quick)

| # | Control | Primary surface |
|---|---|---|
| 1 | No-shrink overlays | all |
| 2 | HOUSE medals + bottom nav | rail / bottom |
| 3 | Today tape | tape |
| 4 | TV Watch live | sheet / float / object |
| 5 | Radio streams | sheet / float / object |
| 6 | Computer Google bar | object / sheet |
| 7 | Sky / weather windows | sheet / stage / object |
| 8 | Device Mute | sheet / bottom (watcher) |
| 9 | Object → same sheet | object → sheet |
| 10 | Name tags + notes | stage |
| 11 | N watching | top bar (owner) |
| 12 | Day/night + weather light | stage |
| 13 | Activity strip | bottom |
| 14 | Radio EQ / PLAYING | sheet (+ object cue) |

---

## Suggested mock screen list (5b / 6)

Designer shoots these (another agent); no screenshots in this file.

1. **Phone idle — integrated chrome** — tape + icon HOUSE rail + icon bottom nav; full-case room; no sheet.
2. **Phone TV — Watch live** — sheet over room, scrim, **Watch live** / **Plays from YouTube.** / channel chips; 0 resize vs idle.
3. **Phone Radio — playing + EQ** — sheet with current row eq + **PLAYING**, Play/Stop, **Plays {station}** hidden while on.
4. **Phone Sky / weather** — Sky sheet + windows showing weather look; **The sky follows the house.**
5. **Phone Computer — Google bar** — computer sheet / in-room screen with search bar chrome.
6. **Desktop float TV** — floating TV card, no scrim, stage width unchanged; Watch live chrome.

Optional follow-ups if time: phone watcher Radio + **Mute**; phone owner top bar **N watching**; phone Activity strip with live line.

---

## Engineer wire targets (checklist)

| Control | Wire target |
|---|---|
| Overlay / 0 resize | Stage rect stable; no fit on sheet open |
| HOUSE + bottom nav | Open sheets; real tab routes; watcher hides Invite |
| Today tape | House Today feed; hide if empty; kicker → Today |
| TV YouTube | IFrame on **Watch live**; nocookie; **Close** unloads |
| Radio | Real streams; `/api/radio` play/stop/prev/next/tune |
| Google bar | Blocked pending Security; then approved search path |
| Sky / weather | House weather API + sun; windows + Sky lines |
| Mute | Local media only |
| Object tap | Same sheet key as rail |
| Tags / notes | Case clamp ≥8 px; Activity on note tap |
| N watching | Owner count → Invite |
| Lighting | House clock + weather grades |
| Activity strip | Live events → Activity |
| EQ / PLAYING | Bound to radio `playing` + station |

Writer strings (ship): **Today**, **Watch live**, **Plays from YouTube.**, **Close** unloads, **Turn on** / **Turn off**, **Mute** / **Unmute**, **Look outside**, **The sky follows the house.**, **The radio is off.**, **The TV is off.**, **Plays {station}**, **PLAYING**, bottom **Room · Activity · Invite · People · You**.

---

## Amend — Draft 5c soft flat field (Oct 7 ~12:06 AM ET)

**Founder direction:** keep the same Whiteout edge-float UI; replace any yard/neighbor scene with a **soft flat light-gray field** only (`rgb(208,205,198)`). Nothing else new.

| Deliverable | Path |
|---|---|
| HTML/CSS mock | `draft5/html5c/` |
| Idle + TV shots | `draft5/out5c/p390-*.png`, `d1440-*.png` |
| After-measure | `draft5/after-measure-5c.json` (Δ0 idle↔TV) |
| Numbered SBS | `draft5/draft5c-sbs-*.png` |
| Writer labels | `draft5/writer-labels.md` |
| This plan | `draft5/CONTROL-PLAN-5b6.md` |

# HUD frame Draft 5 (Designer), Oct 6 2026 ~11:50 PM ET
Mockups only: static HTML/CSS under `html/`. No deploy, no repo push, no live site edits.

Base: copy of Draft 4b (`draft4/html4b/`) then Draft 5 additions. Overlay rules from 4b kept.

## 1. News tape (Today)
- Thin DOM strip at the very top of the grid (`--ticker-h` 30px phone / 32px desktop).
- Writer: kicker **Today** (same word as the rail/card); items are one plain sentence each.
  Mock items: `Sunset at 6:30 PM.` · `The space station passes over tonight.` · `Light rain overnight, clearing by morning.` · `Basil put on Jazz24.` · `Ferry schedule holds steady.`
- CSS marquee animation only — no JS polling, no network, no backdrop-filter.
- **Non-blocking / no canvas resize:** the tape is its own grid row; it does **not** call the camera-fit / canvas refit. Stage house size on phone idle stays **295×443 CSS px** (same as Draft 4b). Opening a sheet still does **0 canvas resize** (4b overlay).
- Empty state (ship): hide the tape. Red dot on kicker only if Today has something new (same rule as the card).

## 2. Icon-first chrome (HOUSE rail + bottom nav)
- HOUSE rail: medal icons + labels kept; medals slightly larger (`--medal` 46px+), stroke bolder, labels weight 600 — reads icon-first vs live’s text-only look.
- Bottom nav: icon above label, active underline (Draft 4 style); slightly stronger stroke on active.
- Labels unchanged (Writer): Room · Activity · Invite · People · You.

## 3. TV sheet — Watch / YouTube (build target: real)
- **Founder decision (Oct 6 late):** real YouTube is **in scope**. Draft 5 chrome is the implementable target for Engineer — not a maybe / visual-only experiment.
- Mock HTML shows player chrome **as if** playback is real (no live iframe in the mock unless trivial later). Labels/controls must ship as designed:
  - Play affordance: **Watch live**
  - Line under player: **Plays from YouTube.**
  - Badge: **Playing**
  - Header: `TV · {channel}` when on
  - Owner power: **Turn off**
  - House channel chips; selected chip drives title + header colour well
- 16:9 dark player well, center play, bottom scrub + times, title + channel line — streaming-player chrome without copying a third-party logo mark.
- Engineer wires the real embed behind this chrome (load only when TV opens; remove on close — same Performance one-player rule as prior drafts).

## 4. Overlay rules (unchanged from Draft 4b)
- Phone: sheet over full room + scrim `rgba(43,45,49,.28)`; top bar / ticker / bottom nav stay above; **0 canvas resize**.
- Desktop: floating card over stage right edge; **no scrim**; stage width unchanged.

## 5. Performance one-liner
Ticker is DOM-only (no blur, no per-frame work beyond CSS transform). HUD still adds 0 draw calls; one player at a time when YouTube is wired; counters/clock ≤1 Hz.

## 6. Shots
| File | What |
|---|---|
| `out/p390-idle.png` | Phone 390×844 owner idle — tape + icons |
| `out/p390-tv.png` | Phone TV sheet — Watch chrome |
| `out/d1440-idle.png` | Desktop 1440×900 idle — tape + icons |
| `out/d1440-tv.png` | Desktop floating TV card — Watch chrome |
| `draft5-sbs-*.png` | BEFORE = Draft 4b html4b shots; AFTER = Draft 5 |

## 7. Open for Writer / Engineer
- Writer may refine tape sentences / TV title strings later.
- Engineer: wire YouTube to **Watch live** / **Plays from YouTube.** chrome; Founder has approved real playback as the product path.
- **Security bind (Launch):** load iframe only after **Watch live**; `www.youtube-nocookie.com` only; **Close** removes iframe (not hide); thumb bundled/proxied — never `i.ytimg.com` on first paint; no other YT/Google origins on first paint; watcher play on-device only.

## 8. Next mock pass (queued — after Founder reacts to Draft 5)
Founder / Exec (11:49 PM ET): everything must work for these too:
1. **Real radio streams** on Radio play (not stub audio).
2. **Real Google bar** on the computer (in-room screen UI).
3. **Weather on the windows** (sky/window look driven by real weather).

Design as-if-real chrome in Draft 6; Engineer wires; Security reviews each new outside call before ship. Not started until Founder reacts to Draft 5 SBS.

## 9. Draft 5b — buttons one with the image (Founder 11:49–11:50 PM ET)
- Stage + chrome share one plaster plate (soft vignette); rail medals grow from stage edge; bottom nav tucks into the plate.
- Room **never shrinks**: p390 house **307.4×461.7** idle == TV (Δ 0). Desktop house **412.1×612.9** idle == TV.
- SBS: `draft5b-sbs-p390-idle.png`, `draft5b-sbs-p390-tv.png`, `draft5b-sbs-d1440-idle.png`, `draft5b-sbs-d1440-tv.png`
- Measure: `after-measure-5b.json`

## Draft 5b — buttons one with the image
**Founder (Designer):** make controls feel visually integrated into / grown from the room image — not floating UI chrome on a beige frame. **Clarify:** integrate so the image/room **never shrinks**; overlay sheets over full-size stage (Draft 4b); chrome must not steal stage height/width; measure **0 canvas resize** idle→card.

### Design moves (CSS on Draft 5 html)
- Soft page vignette + shared plaster tone (`--bg` / plate gradients) so stage + chrome read as one maquette surface.
- Stage: softer radius, inset plaster vignette — less “dark photo card in a beige app.”
- HOUSE rail: flush into the gap + slight edge overlap (`margin-left: calc(-1 * gap - 5px)` phone / −8px desktop); medals pressed into the same plaster.
- Phone strips + nav tuck toward the stage (negative margin into gap only — fixed tracks unchanged).
- Desktop bot plate flushes up under the stage; Here tab grows from the left edge.
- **No new grid chrome rows/cols.** Draft 5 features kept: Today ticker, icon nav, YouTube-look TV (**Watch live** / **Plays from YouTube.**), Draft 4b overlay (phone sheet + scrim, desktop float).

### Measure (must-hold)
| View | House CSS px | Stage | idle→card Δ |
|---|---|---|---|
| p390 idle / tv / radio / sky / computer | **307.4 × 461.7** | 327 × 570 | **0** |
| d1440 idle / tv | **412.1 × 612.9** | 1286 × 666.2 | **0** |

vs Draft 5: phone house was 295.2×443.4 — **never shrunk** (Δ +12.2 × +18.3 from auto-track slack when rail/bot use negative margin). Overlay still 0 resize.

### Extra KEY screens (Founder: develop more ideas)
Mock-only; no network / no deploy.
1. **`out/p390-radio.png`** — Radio playing: live EQ bars, **Live stream**, station · bitrate, **Plays from the station stream.**
2. **`out/p390-sky.png`** — Sky sheet: windows-now rain vignette, 54° Light rain, sunset/wind/humidity, chips (Now / Clear AM / …). House sky → Lakeview weather.
3. **`out/p390-computer.png`** — Computer sheet: desk-screen chrome with **Search Google or type a URL** bar, Google wordmark, suggestion rows, **Sleep screen**.

States: `?s=radio` · `?s=sky` · `?s=computer` (same carded overlay; house size identical to idle).

### Shots (5b)
| File | What |
|---|---|
| `out/p390-idle.png` | Phone idle — integrated plate |
| `out/p390-tv.png` | Phone TV — 0 resize vs idle |
| `out/d1440-idle.png` | Desktop idle — integrated plate |
| `out/d1440-tv.png` | Desktop TV float — 0 resize |
| `out/p390-radio.png` | Phone Radio live-stream chrome |
| `out/p390-sky.png` | Phone Sky / weather-on-windows |
| `out/p390-computer.png` | Phone Computer Google bar |
| `draft5b-sbs-*.png` | BEFORE = Draft 5 (`before5/`); AFTER = 5b; numbered boxes + legend |

### Open
- Engineer: real station streams behind Radio EQ chrome; Open-Meteo (or NWS) behind Sky; real Google bar / desk screen behind Computer — Security reviews each outside call.
- Writer may refine Sky / Computer / stream strings.
- No deploy from this pass.

## 10. Draft 5c — Whiteout + soft flat field (Founder Oct 6 ~11:54 PM – Oct 7 ~12:06 AM ET)

**Layout law:** apartment **is** full-bleed. HUD chrome floats on the edges — never a docked plaster plate that insets/shrinks the room. Opening any control = **0 canvas resize**. Ref: `ref-whiteout-survival-hud.jpg`.

### Soft flat field (Founder: “same UI, new background, nothing new”)
- Stage background: **soft flat light gray** `rgb(208,205,198)` — Living Sanctuary–style field only.
- **Not** yard/neighbors, not photoreal outdoor scene, not dark, not empty beige.
- Maquette: cream-keyed cut (`room-portrait-cut.png` / landscape) sits on the flat field; HUD floats over both.
- Mock path: `draft5/html5c/` (CSS Whiteout edge-float + flat stage bg). Earlier `room-in-scene-portrait.jpg` kept as archive only.

### Chrome (floats over field)
- Top: Today tape + identity/top bar (semi-transparent plaster)
- Right: HOUSE medals as discrete floating rail (no solid column stealing stage)
- Bottom: Here / task / chat strips + icon nav (`Room · Activity · Invite · People · You`)
- Sheets: phone scrim + sheet over full field; desktop float, no scrim — **0 stage reflow**

### Measure (must-hold)
| View | Stage CSS | idle→card Δ |
|---|---|---|
| p390 idle / tv | **390 × 844** (full viewport) | **0** |
| d1440 idle / tv | **1440 × 900** (full viewport) | **0** |

### Shots (5c)
| File | What |
|---|---|
| `out5c/p390-idle.png` | Phone idle — soft flat field + Whiteout chrome |
| `out5c/p390-tv.png` | Phone TV sheet — 0 resize vs idle |
| `out5c/d1440-idle.png` | Desktop idle — soft flat field full-bleed |
| `out5c/d1440-tv.png` | Desktop TV float — 0 resize |
| `draft5c-sbs-*.png` | BEFORE = Draft 5b (`before5c/`); AFTER = 5c flat; numbered boxes + legend |

### data-* audit (`html5c/`)
- Icon inject: `data-i` + optional `data-s` via `icons.js` — all used `data-i` keys resolve (no missing glyphs).
- TV chips: `data-title` / `data-hd` / `data-c` / `data-a` drive mock player title + well colour.
- Audit dump: `data-attr-audit-5c.json`.

### Open
- Engineer: Whiteout float + soft flat field is the layout target; wire YouTube / radio / sky / computer behind existing chrome.
- No deploy from this pass.

### FREEZE (Founder GO Oct 7 ~12:09 AM ET)
Kit frozen for Engineer production ship. Index: `CONTROL-PLAN-5c.md`. Designer standing by for visual GO on Engineer preview.

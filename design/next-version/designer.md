# Next version: HUD frame Draft 4 + unshipped design work (Designer), Oct 6 2026, ~7:45 PM ET (updated for tonight's 9:30 PM bundle)
Mockups and docs only. No repo code touched, nothing pushed or deployed, no messages sent. Draft 3's NOTES.md is not edited.

**Summary (3 lines)**
1. Draft 4 matches the frame to the v21 build: Yours hidden, no temperature, Radio with working Back, Next and station rows (A), TV with the 5 house channels as working chips (B) and Turn on/off, and no YouTube.
2. Founder rule (7:38 PM, Draft 4b): every card and menu opens as an overlay sheet, so the room never shrinks (0 canvas resizes), and the homepage hero fills the phone width at a fixed aspect. Watchers get their own view with no write controls ('Leave', 'Mute', 'The radio is off.').
3. Section 1 is the paste-ready build delta. For tonight from the unshipped list: the figure merge (gated on Performance's bar of 10 figures ≤120/150 calls with the same look) and the label-clearance rule. Everything else waits, and angle E and Draft 6 lighting are already in the v21 code.

---

## 1. Build delta vs Draft 3 NOTES.md (paste into the cloud agent brief). Everything here is tonight's scope (Exec)

### Founder rule (7:38 PM): cards and menus open as overlay sheets; the room and hero never shrink (Draft 4b, overrides anything below)
**Why the room shrank:** v21, and Draft 3/4 too, fit the camera to the "free rect" left over after a card or sheet opens. On phone the card took a grid row and the room case got shorter. On tablet it took a column. On desktop it took a column and the camera refit to the narrower stage. Each open or close resized the canvas and refit the camera.

**A. Phone (<720 px) and touch tablet (720–1199 px, `pointer: coarse`): sheet over the room**
1. **The room never changes when something opens.** Opening any card or panel (Radio, TV, Sky, Today, the Here list, Activity, Invite, People, You) leaves the grid exactly as it is with nothing open: `body.carded` changes no grid rows or areas. That means:
   - 0 canvas resizes.
   - No camera refit.
   - The fit always uses the no-card stage rect. Delete v21's free-rect path that subtracts the sheet or card.
   - The canvas resizes only on a real viewport change and once after a tuck slide.
2. **Sheet element:** one `<div role="dialog" aria-modal="true" aria-labelledby="{card title id}" class="sheet">` per open card, rendered in a portal at the end of `<body>`.
   - Phone: `position:fixed; left:max(6px,env(safe-area-inset-left)); right:max(6px,env(safe-area-inset-right)); top:calc(var(--pad-t) + 50px + 52px); bottom:calc(var(--pad-b) + var(--nav-h) + 8px); border-radius:16px; z-index:40`.
   - The 52 px between the top bar and the sheet is a dimmed peek of the room, and it's the tap-to-close zone (≥44 px).
   - Measured: 378×638 px at 390×844 with the home bar (sheet + nav ≈ 87% of the screen); 484 px tall at 390×664.
   - Panel look as before: plaster gradient, hairline, panel shadow, no `backdrop-filter`.
3. **Tablet:** the same sheet, centred: `left:0; right:0; margin-inline:auto; width:min(560px, 100vw - 32px); height:min(70svh, 100svh - var(--pad-t) - 60px - 112px - var(--pad-b)); bottom:calc(var(--pad-b) + <bottom panel height> + 12px); top:auto`. At 768×1024 that's 560×717 px.
4. **Motion:**
   - Open: `transform: translateY(calc(100% + 24px))` → `translateY(0)`, `transition: transform 240ms cubic-bezier(.2,.8,.2,1)`.
   - Close: back to the off-screen value, 200 ms, then unmount.
   - Only `transform` and `opacity` animate (no height or top changes, no layout).
   - `prefers-reduced-motion`: no translate; opacity 0→1 over 120 ms.
5. **Scrim:**
   - Style: `position:fixed; inset:0; background:rgba(43,45,49,.28); z-index:30; opacity 0→1 over 200 ms`. No blur.
   - Tapping it **only** closes the sheet (Interactivity §12). The scrim is a real element with `pointer-events:auto` and its own handler. It calls `preventDefault()` + `stopPropagation()` on pointerdown/up/click, so the tap never reaches the canvas raycaster or a 3D object: no light, TV or toast fires. The canvas also ignores pointer events while a sheet is open (`pointer-events:none` on the stage).
   - The top bar (`z-index:50`) and the bottom nav / bottom panel (`z-index:50`) sit above the scrim and stay fully working, so the scrim visually covers only the room area.
   - The room, Here tab, right column and strips under the scrim get `inert` + `aria-hidden="true"` while the sheet is open.
6. **Sheet header:**
   - A grab handle: 36×4 px bar, `border-radius:2px; background:rgba(43,45,49,.22)`, centred, 8 px from the top.
   - Below it, Draft 3's header (medal, title, House tag, 44 px ✕). The ✕ keeps the accessible label "Close" (Writer), and the scrim's label is also "Close".
   - The handle plus header form a 56 px drag zone.
7. **Swipe down to close (Interactivity §12):**
   - It closes **only** from the header or grab handle (the drag zone), or from the body when its `scrollTop === 0` at touch start and the gesture starts downward.
   - Otherwise a downward swipe just scrolls the body.
   - A gesture that starts on the TV channel row (horizontal scroller) never closes the sheet, even at the top.
   - The sheet follows the finger with `translateY(dy)` (dy ≥ 0, rubber-band ×0.3 above 0).
   - On release it closes if dy > 96 px or speed > 0.5 px/ms; otherwise it springs back in 180 ms.
   - Set `touch-action: pan-x` on the drag zone and `overscroll-behavior: contain` on the body.
8. **Inside the sheet:**
   - The body scrolls (`overflow-y:auto`, `-webkit-overflow-scrolling:touch`).
   - Draft 3's scroll hint (hairline + 14 px shade + chevron, in a 40 px band) lives inside the sheet's own bottom padding, using the same "resting cut" rule. No control is ever under it. The tappable chevron (44 px hit area) scrolls to the next whole row.
   - Content keeps Draft 4's phone layout (Radio rows, TV screen + chips). The short-phone swipe row stays at heights ≤ 700 px.
   - On tablet the sheet is 560 px, so the TV chips fit on one or two lines.
9. **Focus:**
   - On open, focus moves to the sheet title (`tabindex="-1"`). Tab and Shift+Tab are trapped inside the sheet.
   - Esc closes the sheet. On close, focus returns to the opener (rail button, nav item, 3D object, or the pill segment).
   - The nav stays live (Interactivity §12): tapping another item **swaps the sheet's contents in place** (one sheet element, no second sheet ever stacked, no close-and-open animation; focus moves to the new title). Tapping Room closes it. Rail buttons and 3D objects (radio, TV, window) do the same swap when a sheet is already open.
10. **Sound and state:**
   - Opening or closing a sheet never touches audio (✕, scrim, swipe or Esc), so the radio keeps playing.
   - The tuck timer is paused while a sheet is open (unchanged rule).
   - Rail button and nav item show the open state (dark ring / active underline).
11. **Labels:** name tags and speech notes stay put while a sheet is open, under the scrim. They do not refit on open or close.

**B. Desktop (≥1200 px, or any mouse device ≥720 px) — Exec lock 7:45 PM: floating card, never dock**
12. **Checked in the Draft 3/4 mockup:**
   - The card docked as a grid column, so the stage went from 1272 to 871 px wide at 1440×900 and the canvas would resize and refit.
   - The house stays 422×627 there only because it's height-limited. In wide-short or narrower windows it would shrink.
   - **Fix: the card floats over the stage's right edge.** `position:absolute; top:12px; right:12px; width:clamp(320px,27vw,400px); max-height:calc(100% - 24px); z-index:20` inside the stage container. Same panel style plus the shadow `0 12px 32px rgba(70,55,35,.18)`.
   - No scrim, no grid change, 0 canvas resizes, no refit. The right column, Here tab and bottom panel stay.
   - At 1440×900 the card (860–1260 px in the stage) clears the house (425–847).
   - Esc and ✕ close it. Focus moves to the card on open and returns to the opener on close. No focus trap (it's non-modal).

**C. Homepage hero (landing, `components/home.tsx` + `app/globals.css` `.landing-figure`)**
13. **What made it shrink (v21 `f7c3daa`):**
   - Under 800 px, `.landing-figure img { max-width:330px; max-height:48dvh }`. The hero is 874×1440 (tall), so at 390×844 it renders about 246×405 px, only 63% of the width.
   - Because the cap uses `dvh`, the image jumps when the mobile address bar shows or hides: about 319 px tall with the bar, 405 px without.
   - `sizes="(max-width: 800px) 300px, 440px"` makes next/image serve a ~300 px source, so it's soft on 3× screens.
   - There's no menu or sign-in form on the landing page in v21. The "Watch →" link goes to /room, and sign-in happens there.
14. **Fix (phone, ≤800 px):**
   - `.landing-figure { order:-1; width:calc(100% + 40px); margin:0 -20px; }`
   - `.landing-figure img { width:100%; height:auto; aspect-ratio:874/1440; max-width:none; max-height:none; object-fit:contain; }`
   - Result: full width, fixed aspect, no layout shift. That's 390×643 px at 390×844 = 76% of the screen height.
   - Cap only on very short or landscape screens: `@media (max-width:800px) and (max-aspect-ratio:3/4) { .landing-figure img { max-height:82svh } }`. Use `svh`, never `dvh`, so it never jumps with the address bar.
   - The text, Bring your agent, steps and CTA follow below it.
   - `sizes="(max-width: 800px) 100vw, 440px"`.
15. **Desktop:** layout unchanged. Change `max-height:min(76dvh,700px)` to `min(76svh,700px)`.
16. **Any landing menu or sign-in** (tonight's password sign-in) opens as the same overlay sheet as A2–A9, over the hero. It never sits in the flow above or below the hero and never resizes it.

**Tablet detail:** the whole bottom panel (strips + nav) stays above the scrim (`.bot{z-index:50}`). A strip tap swaps the sheet to Activity, like the nav. In the 560 px sheet the TV chips wrap onto two lines (no swipe row on tablet).

**Measured (Draft 4b mockup, `/workspace/hud-frame/draft4/html4b/`):**
- With any card open, the room is identical to no-card: 295×443 at 390×844, 262×390 at 390×664, 494×734 at 768×1024, 422×627 at 1440×900. The stage rect is unchanged, so 0 canvas resizes.
- Sheets: 378×638 at y 108 (390×844), 560×717 at y 167 (768×1024). Desktop floating card: 389×307 at y 96.

**Settled (Exec, 7:45 PM):** floating card from 1200 px / mouse, so the room never shrinks on desktop. Sheets stay for phone and tablet under 1200. This overrides `interactivity.md` line 159 (dock from 1024).

**Images (Draft 4a left, 4b right):** `/workspace/hud-frame/draft4/draft4b-sbs-p390-tv.png`, `draft4b-sbs-p390-radio.png`, `draft4b-sbs-p664-tv.png`, `draft4b-sbs-t768-tv.png`, `draft4b-sbs-d1440-tv.png`. The homepage hero is spec only (C13–C16), not rendered yet.

**D. "Set a password" prompt (after email-link sign-in)**
17. Same overlay-sheet card style as A2–A9 (plaster panel, 16 px radius, scrim, grab handle and ✕ "Close"; floating card on desktop). Primary button "Save password" is the full-width 48 px graphite pill (`background:#2B2D31; color:#F5F2EB`, like Play). "Not now" is a text button below it (Geist 14 px, #655E52, no fill or border, 44 px tall). Neither button resizes the room or the hero. No render.

**Replaced by this rule:**
- Draft 3 NOTES "Phone card: max-height = max(220px, min(48dvh, …))" and "room case keeps ≥ 250 px".
- Draft 3 NOTES "Desktop/laptop card: grid column … Camera refits once to the narrower stage".
- Item 6 below (tablet grid).
- The "317×472 / 260×386" tablet room-size claims in section 2. With sheets, the tablet room stays 494×734 with any card open.
- Item 12's "refit when a card opens".
- The canvas-resize rule now applies to tuck only. Cards cause 0 resizes.

Applies on top of Draft 3's NOTES.md (frozen) and matches Interactivity's final wiring map (`interactivity.md`, Exec lock at 7:25 PM) row for row. Visual reference: `/workspace/hud-frame/draft4/` (html + side-by-sides).
1. **Hide Yours** (Packages, My music, My city, the divider and the "Only you see this" header): not in the DOM for either role. No Spotify, 17TRACK, Open-Meteo or geolocation code ships.
2. **Top bar:**
   - Owner: "Your apartment" + OWNER (brass).
   - Watcher: "{name}'s apartment" (display name, capped at about 40 characters) + "WATCHING · READ-ONLY" (neutral chip on ≥720 px; on phone it goes on the subline as mono caps, Info) + a 44 px "Leave" button (`/api/watch/end`).
   - Remove the temperature chip everywhere. Phone subline and desktop chip: "{place} · {time}" as Info (one chip replaces Draft 3's clock and temperature chips). Owner: "N here" opens the Here list and "N watching" opens Invite at the watch links (hide it if v21 has no live watcher count). Watchers: "N here" opens the Here list, and "N watching" is hidden.
3. **Radio card:**
   - Remove the "now" box.
   - Owner: Back (`prev`, A) · big Play/Stop · Next (`next`). Under Play, idle only: "Plays {station}" per Founder extra 2.
   - Station rows are buttons (`tune`, A): 44 px, with a 24 px play-mark circle. The current row gets a radio icon when idle, and eq + "PLAYING" (mono 9 px) while playing.
   - Watcher: idle shows the line "The radio is off."; playing shows one secondary 48 px button "Mute" / "Unmute" (this device only). Rows are text.
4. **TV card:**
   - Remove the thumbnail, "Watch live", "Plays from YouTube." and the iframe code path.
   - Picture panel: a CSS screen 156×96 (188×112 on tablets) with a 4 px graphite bezel, filled with the channel's `color`/`accent`, plus its name and "CH n".
   - Owner: big "Turn off" / "Turn on" (`/api/tap tv`). Watcher: the line "On · {channel}" or "Off".
   - 5 chips (B, `/api/tap {id:'tv',channel}`), each with an 8 px colour dot. Header "TV · {channel}", or "TV" when off.
5. **Short-phone swipe row (Founder extra 1)**, implemented as:
   - The card body bleeds to the card edge (body margin 0 −12px, padding 0 12px).
   - Chips: margin 0 −12px, padding 0 12px, scroll-padding-left 12px, scroll-snap start, no scrollbar, plus a 4 px end spacer.
   - Chip padding is 0 10px so the 4th chip peeks about 20 px at 390 px wide.
6. **Tablet (720–1199 px, pointer: coarse), card open:**
   - Grid areas `"top top top" "here stage rail" "card card rail" "bot bot bot"`; the rail spans rows 2–3.
   - Card max-height min(44dvh, 420px), padding 14/16, body bleed 16 px, and chips in one row.
   - The phone snap()/hint-band logic applies there too.
   - This replaces Draft 3's desktop dock at these widths. ≥1200 px, or a mouse, keeps the dock.
7. **Watcher tuck pill:** "Mute" / "Unmute" (44 px pill segment) replaces the round Stop.
8. **Watcher nav:** no Invite. People shows the Here list only. You shows the watcher line, the Room sound switch and Leave (Writer).
9. **Roles come only from the server's viewerContext.** `?v=watch` is a mockup switch and must not exist in the build (Security §4, §6).
10. **Strings:** all from `next-version/writer.md` (Turn on/Turn off, Look outside, Mute/Unmute, Leave, "The radio is off.", "The TV is off.", "Plays {station}"). Untrusted text is rendered as text and capped (Security §5).
11. **Figure merge (decided, in tonight's bundle):** merge each figure's ~14 meshes into one (shared material, vertex colour for the shirt, a per-part index or bones driving blink, head turn, walk and talk arm). **Performance's pass bar: with 10 figures, ≤120 draw calls on steady frames and ≤150 on shadow frames, and the figures look the same as before** (side-by-side lineup vs v21 at 390×844 and the 4K avatar front, same camera). If it misses either, ship without the merge, and the build keeps today's limit (about 3 figures within budget).
12. **Label clearance with the frame:** name tags and speech notes clamp to the room case rect (not the canvas or window), ≥8 px from its edges, and refit only on viewport resize or after a tuck. Never on card open or close (Founder rule A11). Tester checks 390×844 and 390×664 with Radio and TV open.
13. **Scroll-hint chevron (phone) is a control** (Interactivity): tapping it scrolls the card body down to the next whole row, and it hides at the end. It needs a 44 px hit area inside the 40 px band (extend 2 px up). Draft 3 had pointer-events none.
14. **Sky card:** owner button "Look outside" (`/api/tap window`), hidden for watchers. Today card per Interactivity and Writer (headline links open a new tab, the latest event opens Activity). Neither card is redrawn in Draft 4; they use Draft 3's card shell.
15. **Here list names are Info** unless Engineer confirms camera focus exists. Task strip "1/3" is Info and rotates on the shared 1 s timer (every ~6 s). The whole strip opens Activity.
16. **3D objects:** radio and TV open their cards (no direct toggle), the window opens Sky. A watcher tapping any toggle object gets one toast, "Only the owner can change things here.", and never a silent tap or a raw 403.
17. **Sign out (owner only):** a plain text item, "Sign out", right after the OWNER badge in the top bar on every size.
   - It's a `<form method="post">` with a `<button type="submit">` styled as text: Geist 13 px, #655E52, no fill, no border, no icon. There's no `<a href>` and no GET link, so a prefetch or crawler can't sign anyone out. Same-origin POST to the existing sign-out route, then back to the sign-in page.
   - Hit area ≥44×44 px (padding 0 10px, height 44), ≥8 px from the badge.
   - Phone: the title ellipsizes first, and the badge and Sign out never shrink. At 360 px, if the title would drop below ~90 px, Sign out moves into the You panel only.
   - Watchers never see it (they have "Leave"). The You panel keeps its existing sign-out too.
   - Not drawn in the Draft 4 renders. This spec is the reference.
18. **Performance:** no images in cards (the TV picture is CSS; `yt-thumb.jpg` is not shipped), no iframe, no backdrop blur, one shared 1 s timer, CSS-transform tuck with one canvas resize after the slide (tuck only). Cards and sheets cause 0 canvas resizes and no camera refit. The HUD adds 0 draw calls.


## 2. HUD Draft 4 (Draft 3 left, Draft 4 right; numbered boxes match these numbers)
Files: `/workspace/hud-frame/draft4/` (`html/hud.html` + `hud.css` are a copy of Draft 3 with a "Draft 4" block at the end of the CSS). Draft 3 is untouched.
URL states (mockup only): `?s=radio|tv|tucked`, `?play=0`, `?safe=34`, `?v=watch`. In the build, the role comes from the server session, never from the URL (Security §4).

**Phone**
1. **Owner title "Your apartment".** Draft 3's mockup paired the watcher title with the OWNER badge. Each role now shows its own title (Writer).
2. **No temperature.** v21 has no weather, so the 18° chip is gone. The subline under the title reads "{place} · {time}" (e.g. "Lakeview · 6:46 PM"), and it's plain text with no hover or chevron.
3. **Yours is hidden** (Exec's decision): Packages, My music, My city and the divider are all gone. The four House buttons are centred in the right column, with 10 px gaps.
11. **Shorter TV picture**, so the room is bigger with the TV open: 183×272 → 227×337 px at 390×844, and 155×230 → 164×243 at 390×664.

**Tablet (768×1024, touch)**
8. *(Draft 4a, superseded by the Founder rule: tablets now use the overlay sheet, and the room stays 494×734)* **The card docks under the room as a phone-style sheet.** It spans the room's column, while the right column and the bottom bar stay. Draft 3 squeezed a desktop card beside the room, leaving a 252 px wide case. Now the room is **317×472** (was 237×352) with TV open and **260×386** with Radio open. On the tablet the card body bleeds to the card edge (16 px), so the channel row scrolls edge to edge. At 768 all 5 chips fit without scrolling.
2. On tablet and desktop the clock and weather chips merge into one "{place} · {time}" chip, which gives the top bar more room at 768.

**Desktop (1440×900)**
1–3 apply. The card still docks between the room and the right column (approved in Draft 3), and the room stays 422×627.

**Cards**
4. **Radio, idle:** the grey station box above the buttons is gone, because it repeated the first row. "Plays {station}" (approved extra: Geist 13 px, #655E52, one line with ellipsis, hidden while playing or when unknown) sits under Play.
5. **Radio, Back and Next both work** (addition A, `prev` and `tune`). Station rows are real 44 px buttons with a small play mark. The current row is marked with a radio icon when idle, and with eq bars plus "PLAYING" while it plays. There are 4 stations here (the house list holds up to 8), and the body scrolls with Draft 3's hint band when it doesn't fit.
6. **TV picture = the house channel itself**: a small screen in the channel's own `color`/`accent` from `lib/room/content.ts`, with its name and "CH n". It's drawn in CSS: 0 bytes, no image request, no thumbnail, no YouTube. The owner's big button reads "Turn off" when the TV is on and "Turn on" when it's off (Writer). The header reads "TV · {channel}".
7. **The 5 house channels as working chips** (addition B), each with its colour dot, 44 px tall and 8 px apart. On short phones (≤700 px tall) they sit in one scroll-snap row (approved extra): the first chip is flush with the card padding, the last is fully reachable (25 px clear at 390×664), and chip padding drops to 10 px so the next chip peeks about 20 px. That peek is the only sign the row scrolls, and it has no scrollbar.

**Controls and roles**
9. **Watcher view.** The title is "{name}'s apartment". On phone, "WATCHING · READ-ONLY" goes on the subline, because the badge plus the button doesn't fit in 390 px. On desktop it's a neutral badge, so brass stays owner-only. Next to it is a 44 px **"Leave"** button. There's no "watching" counter and no Invite in the nav.
10. **Watcher Radio:** no Play, Stop, Back, Next or tappable rows. When idle it shows the plain line "The radio is off.". While playing it shows one secondary **"Mute"** button (this device only, no request), and the rows are text with the current one marked.
12. **Watcher tuck pill:** "Mute" / "Unmute" replaces the owner's round Stop, which stops the radio for everyone.
- Every visible control maps to a row in Interactivity's map: a rail button opens or closes its card, ✕ closes, Play/Stop/Back/Next/rows call `/api/radio`, Turn on/off and chips call `/api/tap`, Mute stays on the device, Leave calls `/api/watch/end`, and the strips open Activity. Everything else is plain text with no affordance.

**Measured in the mockup (all 17 measured renders):**
- **No layout problems:** nothing overlaps the room, nothing scrolls sideways, no label is clipped.
- **Tap targets:** phone and tablet targets are ≥44 px, with gaps ≥8 px.
- **Hint band:** no control sits under it, and none of the cards at these sizes needs it.
- **Desktop exception:** desktop strips stay 40 px (mouse), as in Draft 3.

**Performance:** the HUD adds 0 draw calls. It's DOM and CSS only: no backdrop blur, no iframe, no images in the cards (the TV picture is CSS), transforms only for tucking, and the same single 1 s timer. The mockup still uses one rAF for layout and passive scroll listeners. Draft 3's 45 KB `yt-thumb.jpg` is gone from the copy.

**Caveat:**
- **Room views are stand-ins.** The room is still the static angle-E screenshot fitted by script (as in Draft 3), so room sizes come from the fit maths, not from a live canvas.
- **Watcher comparison isn't like for like.** Draft 3 never drew a watcher, so the watcher side-by-sides compare against Draft 3's single mixed view.
- **Not rendered:** the TV "off" state ("Turn on", "Off" on the screen).

**Images** (all in `/workspace/hud-frame/draft4/`). **Best to show the Founder:** `draft4-sbs-t768-tv.png`, `draft4-sbs-p390-tv.png`, `draft4-sbs-p390-radio.png`, `draft4-owner-vs-watcher-p390.png`, `draft4-sbs-d1440-radio.png`.
Minimal set for the cloud agent: p390, p390-radio, p390-tucked, t768, t768-tv, d1440, d1440-radio.
- `draft4-sbs-p390.png` (phone default)
- `draft4-sbs-p390-radio.png` (Radio idle)
- `draft4-sbs-p390-tv.png` (TV open)
- `draft4-sbs-p390-tucked.png` (tucked)
- `draft4-sbs-p664-tv.png` (short phone, swipe row)
- `draft4-sbs-p390-watch.png`, `draft4-sbs-p390-watch-radio.png` (watcher vs Draft 3)
- `draft4-owner-vs-watcher-p390.png`, `draft4-owner-vs-watcher-p390-playing.png`, `draft4-owner-vs-watcher-p390-tucked.png` (owner left, watcher right, both Draft 4)
- `draft4-sbs-t768.png`, `draft4-sbs-t768-tv.png`, `draft4-sbs-t768-radio.png`
- `draft4-sbs-d1440.png`, `draft4-sbs-d1440-radio.png`, `draft4-sbs-d1440-tv.png`
- `draft4-contact-sheet.png` (every state, with measured room sizes and tap checks)
- `out/p664-tv-swiped.png`: 390×664 TV with the channel row swiped to the end (Supper Club fully visible)
- Raw renders: `out/` (Draft 4), `before/` (Draft 3, same script and viewports). Measurements: `after.json`, `before.json`.
- Re-render: `NODE_PATH=/workspace/hud-frame/node_modules node shoot3.mjs <htmlDir> <outDir> <json> "$(cat views4.json)"`, then `python3 mkspec4.py && python3 sbs2.py sbs-specs.json && python3 contact4.py`


## 3. Past design proposals that never shipped (ranked by visual and user impact)
Status is checked against the v21 ship code (`/workspace/living-room-v21-ship`, commit `f7c3daa`, worktree of `/workspace/living-room-v19`) and its git log. I couldn't confirm the live bundle directly: the /room page returns 200, but its JS chunks weren't readable from a plain fetch. So "shipped" means "in the v21 ship code".

| # | Item | Where the files are | Status | Effort | Performance cost | Recommend? · **Tonight's bundle?** |
|---|---|---|---|---|---|---|
| 1 | **Merge each figure into one draw call** (one mesh per figure with a per-part bone or index; colour and motion kept) | Proposed in `maquette-revamp/mockups-v3/draft5/draft5-writeup.md` §5. Engineer's estimate in `maquette-revamp/v19-engineering-plan.md` §7 ("about 20–30 min") | **Never shipped.** `components/room/avatar.tsx` still renders 14 `<mesh>` per figure | S–M | **Frees budget.** Performance measured 70 calls empty and about 14 per figure, so 4 figures = 126 calls against the 120 gate. Merged, that's about 1–2 calls per figure | **DECIDED (Exec): in this version. TONIGHT: yes**, if it meets Performance's bar (10 figures ≤120 steady and ≤150 shadow calls, identical look); otherwise it waits |
| 2 | **Name tags and speech notes clear of the new frame on phone**: tags and notes stay inside the room case, at least 8 px from its edges, and never under a card, the pill or the right column | Rule from the maquette drafts (≥8 px tag clearance, skill example F). The frame is new, so the rule has to be re-applied to the room case | **Partly.** The tag de-overlap and the note placer exist (`avatar.tsx`, `FIGURE_RECTS` and avoid zones), but they clamp to the canvas, and nobody has checked them against the Draft 3/4 case edges. *Uncertain:* I didn't find a separate "phone name tags" mockup file | S | 0 draw calls (DOM). The placer already runs every 250 ms | **TONIGHT: yes**: cheap build rule + Tester check (Section 1, item 12) |
| 3 | **Basil's speech note stays inside his own room** on phone | Draft 5 §2 (note placer). The v19 commit `516e284` "notes stay in floor band" adds `avatar.tsx` line 542 | **Partly / unverified.** The floor-band rule is in the code. The Draft 7 renders (`draft7-writeup.md`, Caveats) still showed Basil's note over Pip's room, but they were made on a branch that may predate the rule. Not checked on v21 with angle E | S (verify, then tune) | 0 | **TONIGHT: verify only** on the preview (390×844 and 390×664 with a card open). Tune only if it fails and the fix is a clamp change |
| 4 | **Smooth camera**: 1.6 s ease-in on load, 0.6 s ease on floor changes, optional ±4° idle sway | `draft7-writeup.md`, "Smooth camera (spec only)" | **Never.** No easing or sway in `room-canvas.tsx` | M | Easing costs frames only while the camera moves. Sway needs continuous rendering, which works against Performance's idle render-on-demand item | **WAIT.** Not tonight. Easing next version, sway never (battery, conflicts with render-on-demand) |
| 5 | **Night version of the HUD frame** (graphite panels, plaster text, brass hairlines at night; this was H9 for the old HUD in `maquette-revamp/iterations.md`) | `iterations.md` Round 3 (old HUD). Not designed for the Draft 3/4 frame | **Never** for the new frame. The plaster panels stay light at night | M (design, then CSS tokens) | 0 (CSS only) | **WAIT** (needs its own draft) |
| 6 | **Name tag and speech bubble merged while an agent talks** (the name becomes the bubble header) | `design-revamp/review.md`, "Priority fixes" #3 | **Never** (*uncertain*: v21 still has separate `.agent-tag` and `.agent-bubble` in `app/globals.css`) | M | 0 (DOM) | **WAIT** |
| 7 | **Rain streaks on windows** | `components/room/furniture-shell.tsx` lines 187–240 (8 falling drops per window) | **Partly, and probably invisible.** The drops exist, but only when the sky is rain or snow. Interactivity says v21 has no weather feed (sky = house clock), so they may only show with a forced sky. *Uncertain* | S–M to redo as one merged mesh or a shader | **Unmeasured. Needs measuring.** As written, each drop is its own mesh with its own material, so up to 8 extra calls per window while it rains | **WAIT** unless Performance measures it on the preview first |
| 8 | Bubble tail hidden when the note sits far from its tag (>24 px) | `draft5-writeup.md` §2 caveat | **Partly**: `a2fab17` hides it in landscape only | S | 0 | **TONIGHT: optional** (one CSS rule) only if Engineer is already in `globals.css`; otherwise wait |
| 9 | Minimal HUD with a Tonight tab (`?hud=minimal`) | `components/room/maquette/minimal-hud.tsx` in v21 (flagged mockup) | **Never default. Superseded** by the HUD frame (its Today card) | — | 0 while off | **WAIT**: remove the flag code after the frame is live (not tonight; less churn) |
| 10 | Draft 7 camera options A–D | `maquette-revamp/mockups-v3/draft7/` | Not chosen (E won) | — | — | No |
| 11 | design-revamp "six directions" (storybook, clay, muji, hearth, night, gazette) | `design-revamp/sheets/`, `revamp-sheets.pdf` | **Never. Superseded** by the maquette style | — | — | No |

**Already shipped (the brief lists some of these as queued, but the v21 code has them):**
- **Angle E with the soft fading ground**: v20 `3aaba69`, with `DEFAULT_CAM = "e"` in `room-canvas.tsx` line 162 and the unlit ground fix in `4289705`.
- **Draft 6 lighting and the time-of-day and weather grades**: v20 `3aaba69`.
- **Draft 5 scene changes** (slate shirt, curled hands, head turn, note placer, domed cushions): `38234e6`.
- **Door Option A, Bring your agent, and the house clock and place chip**: `516e284`.
- **The night warm bounce and the softer vignette** (`globals.css` line 186, ellipse 120% 90%).

The Draft 3/4 room images were already shot at angle E, so there's nothing left to fold into the frame for it. If the live site turns out to be older than v21, items 8–9 of that list move back up.


**Tonight's bundle, from this list:** #1 figure merge (gated on Performance's bar), #2 label clearance rule, #3 a verification pass, and optionally #8. Everything else waits. Nothing unmeasured (rain streaks, camera sway) goes in tonight.

## 4. Suggestions (this job only)
1. **Show the TV "off" state and the watcher TV in the next round of renders.** Evidence: Draft 4 renders only the owner with the TV on. Writer defines "Turn on" plus a hidden-unless-known "Plays {channel}", and the watcher's "The TV is off.", but none of them has been seen at phone size yet.
2. **Cap the Radio list at 4 visible rows on the tablet sheet.** Evidence: at 768 the Radio card is 296 px, and the room only grows to 260×386, against 317×472 with TV open. With 8 saved stations the sheet scrolls (the hint band works), but a 4-row cap keeps the room as large as it is with the TV open.
3. **A night version of the frame** (unshipped item 5). Evidence: every Draft 3/4 render is daytime. The plaster panels next to a night room will be the brightest thing on screen. That costs nothing (CSS tokens), but it needs its own draft.
4. **Tester's dead-control run should include the tablet card at 820×1180 and 1024×1366 (iPad Air and Pro portrait).** Evidence: the tablet rule covers 720–1199 px. 1024 portrait sits inside it, but iPad Pro landscape (1366) falls back to the desktop dock, and I haven't rendered either.

## Conflicts between files (for Exec)
- **Brief vs code:** the brief lists angle E, Draft 6 lighting and Basil's note as unshipped (queued for v22). The v21 code already has angle E (v20 `3aaba69`, `DEFAULT_CAM = "e"`), Draft 6 lighting, and the floor-band rule for notes (v19 `516e284`).
- **Watcher Radio, idle:** Interactivity says the big Play becomes "Unmute" / "Mute" for watchers. Writer says idle watchers get no button, just "The radio is off.". Draft 4 follows Writer when idle and shows "Mute" while playing, because a Mute with nothing playing reads as a dead button. Exec to confirm.
- **Watcher TV:** Interactivity says "On · {channel}" / "Off". Writer says no line when on and "The TV is off." when off. Draft 4's markup uses "On · {channel}" (not rendered).
- **Watcher badge on phone:** Writer's "WATCHING · READ-ONLY" is kept word for word, but at 390 px it sits on the subline (as mono caps), not in a badge, so the title and the 44 px "Leave" fit.
- **Radio "now" box:** Draft 3's NOTES.md has the idle card show station + "{city} · {genre}" in a box. Draft 4 drops the box because the marked first row shows the same thing. This needs the Founder's OK as part of Draft 4.
- **Security §1** said the TV's YouTube player is live. The code has none (Interactivity's 7:25 PM check), so it stays hidden.

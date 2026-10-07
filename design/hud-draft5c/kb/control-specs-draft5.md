# HUD control interaction specs (Interactivity + Designer), Oct 6 2026
Updated ~11:56 PM ET: re-diff vs `/workspace/hud-frame/draft5/CONTROL-PLAN-5b6.md` + Whiteout layout amendment.

Format: **Tap → what happens → success.** Owner vs watcher. **0 canvas resize.** No dead chrome.

## Layout law (Founder / Whiteout Survival) — supersedes 5b plaster plate

Ref: `/workspace/hud-frame/draft5/ref-whiteout-survival-hud.jpg`

- Apartment image = **whole background** (full bleed edge-to-edge).
- HUD chrome **floats on the edges** over the room:
  - Top: tape + stats / identity (light / semi-transparent edge chrome)
  - Right (optionally left): HOUSE medals as discrete floating icons — **no solid column that steals stage**
  - Bottom: icon nav + activity/chat strip floating over the room
- Sheets/cards overlay **over** the full room (phone scrim / desktop float); never dock/inset the world.
- **Not:** docked plaster plate / display-case card with room inset in a beige frame.
- Draft **5b** plate SBS superseded. Draft **5c** is the layout target (Designer remaking). Flow rules below still apply.
- Measure: stage CSS rect idle == sheet-open (Δ0). Never call camera-fit / canvas size change on open/close/tape.

**Overlay**
- Phone: sheet + scrim `rgba(43,45,49,.28)`, no blur; tape + top + bottom nav stay above and live.
- Desktop ≥1200 / mouse: floating card (`.is-float`), no scrim, 0 stage reflow.
- Dim tap closes sheet, never reaches 3D; Close never starts/stops sound; rail/object swap sheet in place (no stack); Room closes.

## Re-diff vs CONTROL-PLAN-5b6 (Interactivity)

| Plan # | Status vs my flows |
|---|---|
| 1 No-shrink / full-bleed | **Aligned** (layout law above; 5c pending visuals) |
| 2 HOUSE + bottom nav | **Aligned** — medals open same sheet as objects; watcher hides Invite |
| 3 Today tape | **Aligned** — DOM-only; kicker → Today; hide if empty |
| 4 TV Watch live | **Aligned** — load on Watch live; Close removes iframe; nocookie; one player |
| 5 Radio streams | **Aligned** — real stream on Play; unload on Stop; Security before prod origins |
| 6 Google bar | **Aligned** — Security gate; no dead Search; no Google on first paint |
| 7 Sky / weather | **Aligned** — house location; Look outside owner; 0 resize on lighting |
| 8 Device Mute | **Amended** — plan: **watcher only** for device Mute/Unmute; owner uses Stop / Turn off (house). Owner “Room sound” if kept stays device-only and is not labelled Mute in ship copy |
| 9 Object → same sheet | **Aligned** |
| 10 Tags / speech | **Aligned** — clamp ≥8 px from edges; tap note → Activity; no refit that resizes canvas |
| 11 N watching | **Aligned** — owner only; hide if 0 or feed unavailable; tap → Invite |
| 12 Day/night + weather light | **Aligned** — shared house clock; no canvas resize |
| 13 Activity strip | **Aligned** — whole strip → Activity; 1/3 Info rotator |
| 14 Radio EQ / PLAYING | **Aligned** — only while house radio playing |

No blockers. Waiting on **5c** SBS to re-measure Δ0 under full-bleed edge chrome.

---

## 1. Mute / Unmute (device only — watcher)

- **Who:** Watcher (sheet + tuck pill). Owner stops house media with Stop / Turn off, not Mute.
- **Tap Mute** → silences local radio/TV audio on this device; label → Unmute; **zero** API write.
- **Tap Unmute** → restores local volume.
- **Success:** Immediate; house state unchanged; no Activity log.
- **Fail:** Calling `/api/radio` off, raw 403, or labelling Leave/Stop as Mute.

## 2. Radio (shared) + EQ

- **Rail / 3D radio / tuck pill** → Radio sheet; ring on radio; 0 resize; swap if sheet open.
- **Owner Play** → `/api/radio` `on` + real stream; Stop; Activity; EQ + PLAYING on current row.
- **Owner Stop** → `off`; unload audio element; EQ clears.
- **Owner Next / Prev / station row** → `next` / `prev` / `tune`; EQ follows current station if still on.
- **Watcher** → rows Info; **Mute/Unmute** only while playing; idle line `The radio is off.`
- **Success:** Shared station ≤1s; EQ only while `playing`; Close leaves sound as-is.
- **Security:** pass required before production stream origins.

## 3. TV / YouTube (Watch live)

- **Rail / 3D TV** → TV sheet; 0 resize.
- **Owner chips / Turn on|off** → house TV state; header `TV · {channel}` or `TV`.
- **Watch live** → load nocookie iframe **now**; Playing badge; no fake scrubber.
- **Close** → **remove** iframe; one player with radio.
- **Watcher** → no power/chips that write; Watch live on-device if channel on + allowed; else `The TV is off.` (never dead button).
- **Success:** No YT on first paint; embed gone after Close.

## 4. News tape + Today

- Tape = DOM edge strip; never resizes canvas; empty → hide.
- **Today** kicker → Today sheet; clear red dot (device).
- Linked headline → new tab (a11y: opens in a new tab); unlinked = Info.
- Latest house event → Activity.

## 5. Sky / day-night + weather

- Rail Sky / window → Sky sheet; stage windows follow house feed; **0 resize** on lighting.
- Info: weather · temp · sunset; **The sky follows the house.**
- Owner **Look outside** → `/api/tap` window.
- Watcher: Info only.
- Weather: server 15–30 min cache after Security; house location never visitor GPS.

## 6. Computer → Google bar

- Tap computer → Computer sheet (same chrome as in-room bar).
- Search only after Security; no Google origins on first paint.
- Until cleared: mock chrome / local placeholder — ship never shows a dead Search that looks live.
- Close unloads heavy embeds.

## 7. Watching count

- Owner top chip **N watching**; **hide** if 0 or unavailable.
- Tap → Invite at watch links; ≤1 Hz.
- Watcher: never shown.

## 8. Here / People + door

- Owner: People (Here + Door). Watcher: Here only; no owner toast.
- Agent name → camera focus if supported, else Info.
- Never silent.

## 9. Activity strip

- Tap strip → Activity (swap if open).
- `1/3` = Info on shared 1 Hz timer.
- Live agent events only after ship.

## 10. Tap furniture

| Object | Owner | Watcher |
|---|---|---|
| Radio / TV / Window / Computer | Same sheet as rail medal | Same sheet, read-only + Mute/Watch live rules |
| Other props | Existing actions | Toast: Only the owner can change things here. |

Tucked: action still runs; Radio/TV untuck because they open a sheet.

## 11. Tags / speech

- Clamp inside room case ≥8 px from edges; never under sheet/pill/rail.
- Tap note → Activity; open/close never resizes canvas.
- Title / OWNER / clock = Info only.

## 12. Leave / end watch

- Watcher **Leave** → `/api/watch/end`; clear escape to sign-in/home (no sticky /room).
- Local audio stops.

---

## Build order

1. Full-bleed edge chrome (5c) + 0 shrink · Mute · Radio+EQ · TV/Watch live · Tape/Today · Here  
2. Sky/weather · Google (post-Security) · N watching · Activity strip  
3. Furniture parity · Tags/speech · Leave polish  

## Hard skips

Coming-soon chrome · fake scrub · unwired Google · Yours (Packages/Spotify/My city) · SomaFM embed · plaster-plate inset layout (5b superseded)

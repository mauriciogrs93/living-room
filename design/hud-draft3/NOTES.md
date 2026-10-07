# HUD frame Draft 3 (Designer), Oct 6 2026. Mockup only: no site code touched, nothing deployed or pushed.

Source: html/hud.html + html/hud.css (phone grid below 720 px, desktop grid from 720 px; touch and tablet tweaks by media query).
States: ?s=tucked | ?s=radio | ?s=tv ; ?play=0 = nothing playing ; ?safe=34 simulates the home bar ; ?safet=47 simulates the top inset.
Fade re-render set: views-fade.json (includes p360-tv-scrolled = ?scroll=end). Rest-position check: node fadepos.mjs
Render: NODE_PATH=/workspace/hud-frame/node_modules node shoot3.mjs <htmlDir> <outDir> <measure.json> "$(cat views3.json)"
  Draft 2 "before" set: same script pointed at ../draft2/html -> before/ + before.json (views.json). Draft 3: html -> out/ + after.json.
Side-by-sides: python3 mkspec3.py && python3 sbs2.py sbs-specs.json ; contact sheet: python3 contact3.py
"Room" = measured house size (w×h CSS px) from the fit script; "room case" = the stage panel.

## Spec for Engineer (new or changed in Draft 3)
- Play state drives three things together: Radio card big button (Play + play icon when idle, Stop + stop icon when playing),
  the small bars on the Radio button, and the tuck pill (Stop when playing; a 44 px "show controls" handle when idle).
  Idle card text: station name + "Seattle · jazz" (no "Now playing"). Writer's earlier button label was "Listen"; Founder asked for Play.
- Chat strip, task strip and nav Activity all open Activity. Chat strip hint reads "Activity".
- Desktop/laptop card: grid column between the stage and the right column, width clamp(320px, 27vw, 400px), top-aligned,
  max-height = stage height (scrolls inside). Right column, Here tab and bottom panel stay. Open card's rail button gets a dark ring.
  Camera refits once to the narrower stage (house height is unchanged at 1280 and 1440 because the house is height-limited).
- Phone card: header fixed, body scrolls. max-height = max(220px, min(48dvh, 100dvh - top inset - bottom inset - 380px)),
  i.e. the room case keeps >= 250 px.
- Scroll hint (fix 18, after Exec/Tester review): when a phone card's body overflows, the card gets class .scrolls ->
  padding-bottom: 40px (= hint height). The hint (hairline + soft 14 px shade + chevron) is drawn in that band, OUTSIDE the scroll area,
  so content is clipped above it and never drawn under it. Body keeps padding-bottom 12px + scroll-padding-bottom 12px.
  Resting cut ("snap"): the body's visible height is then lowered to the top of the first button/row/chip that would be cut
  (repeat until no control crosses the edge), so at rest every control is whole above the band or fully hidden below it.
  The card only ever gets shorter than its cap (the room gains the difference). Recompute on resize/open. The chevron hides at
  the scroll end; the band space stays (no layout jump). The thumbnail picture may be cut; it is not a control ('Watch live' is).
  Measured at rest: 360x740 TV - Watch live ends y541, picture ends 617, band 627-667, chips start 627 (hidden), card 322 px;
  360x740 Radio - FIP ends 627 = band top, KEXP starts 627 (hidden); 390x664 Radio - Stop ends 540, band 551-591, Jazz24 starts 551
  (hidden), card 234 px (was 270); 390x664 TV - Watch live ends 517, band 551, chips start 603; 390x844 cards fit (no band).
  Scrolled to end, 360x740 TV: chips 530-574, footnote ends 615, scroll area ends 627, band 627-667 (hint hidden).
- TV: "Watch live" is the play button on the thumbnail facade (52 px tall). The YouTube iframe replaces the whole facade on tap,
  so nothing sits on the real player. Thumbnail is letterboxed (object-fit: contain), never cropped.
- Insets: padding uses env(safe-area-inset-top/left/right/bottom) with the normal padding as minimum.
- Right column: target gaps >= 8 px everywhere (gap clamp(8px, 2.4dvh - 10px, 14px) on phone; header-to-first-button 4 px).
  Phones shorter than 700 px: the right column also runs beside the chat strip.
- (pointer: coarse) at >= 720 px: strips 44 px, Here tab 44 px wide and 12 px in from the edge.
- 720-1023 px: hide the subline under the apartment title and the FIG title block, condense counters; no sideways scroll.
- Title (Writer): 'Your apartment' for the owner. Watchers see '{name}'s apartment' only from a real display name, otherwise 'The apartment'. Never an email.
  The mockups show the watcher view.
- Unchanged and approved: "1 watching" on desktop ("2 watching" when more), House tag on card headers, one sound at a time,
  opaque panels (no backdrop-filter), one shared 1 s timer for clock/counters.

## Room (house) with a card open, CSS px, Draft 2 -> Draft 3
390x844 Radio 192x286 -> 192x286 (card fits, 43% of screen) | TV 147x218 -> 183x272 (45%)
360x740 Radio 144x214 -> 170x252 (card 44%, scrolls) | TV 98x146 -> 170x252 (44%, scrolls)
390x664 Radio 97x144 -> 177x263 (card 35%, scrolls) | TV 52x77 -> 155x230 (41%, scrolls)
(after fix 18; before it 360 was 155x230 both and 664 Radio 155x230)
1280x800 Radio 92x137 -> 360x535 | TV 46x69 -> 360x535 (same as no card)
1440x900 Radio 154x229 -> 422x627 | TV 108x161 -> 422x627 (same as no card)
No-card rooms unchanged from Draft 2: 360 267x401, 390 295x443, 664 262x390, 1280 360x535, 1440 422x627, tucked 355x534 / 497x740.

## Founder decision — Oct 6, 2026, 6:00 PM ET
Draft 3 APPROVED by the Founder, with two build-time extras (no Draft 4):

1. **TV channels on short phones (height ≤ 700 px, e.g. 390×664, 360×740):** show channel thumbnails in ONE horizontally scrolling row (scroll-snap, 44 px min tap height, 8 px gaps, no visible scrollbar, first item flush with card padding, last item fully reachable). Goal: keep more of the room visible with TV open.
2. **Radio card, idle state only:** one short secondary line under the big Play button saying what will play. Wording from Writer (final): "Plays {station}" (e.g. "Plays Jazz24"), no period. {station} must be exactly the station Play will start (last played in the house, else the server's pick). If that station isn't known yet, hide the line rather than guess. Style: Geist 13 px, #655E52, single line, ellipsis on overflow; hidden while playing (button shows Stop).

Also in build spec (Exec): phone card layout on tablets (≥720 px wide touch devices); Tester checks at 768 on the preview.
Tester note: room sizes above are measured without the iPhone home bar; with the 34 px bar, 360×740 with TV open is 155×230.

## Build rules: phone budget (Performance; numbers in /workspace/performance-kb/hud/budget.md)
- Only one player (YouTube or Spotify) is loaded at a time. It's removed from the page when its card closes, and it never loads on page open.
- The Spotify embed loads only when someone opens My music.
- The server fetches weather from Open-Meteo once every 15 to 30 minutes and caches it. Viewers never call it directly, except for the opt-in My city.
- No backdrop blur anywhere. Counters and the clock update at most once a second, never every frame.
- Tuck-away: slide the frame with CSS transforms and resize the 3D canvas once, after the slide finishes.
- The HUD adds 0 draw calls. Phone gates stay as they are (≤120 draw calls steady, ≤150 on shadow frames, median frame ≤16.7 ms, <250k triangles). Performance measures the preview against them.

## Build rules: interaction (Interactivity)
- Tapping a HUD button and tapping its 3D object (radio, TV) open the same card.
- Only one sound at a time: starting TV or My music pauses the radio. Closing a card never restarts sound on its own.
- The frame tucks away after about 8 seconds without a tap. It never tucks on someone's first visit or while a card is open, and one tap brings it back.
- Yours (My music, Packages, My city) never reaches the shared room, its activity log, or what agents see.
- My city rounds the location to about 10 km on the device and sends it straight to Open-Meteo, never to our server.

## Build rules: radio sources (Interactivity; Exec to confirm scope)
- Remove the SomaFM backup stations (their terms forbid playing their streams on a website). Stations come only from Radio Browser. Tester checks the network shows no SomaFM streams.

## Wording (Writer, final; strings word for word)
Strings already in hud.html are final. These are the ones the mockup doesn't show:

**Radio**: idle hint "Plays {station}" (see item 2 above). Activity line: "{agent} put on {station}."
**TV**: Activity line: "{agent} switched to {channel}."
**Today**: one plain sentence per item, e.g. "Sunset at 6:52 PM." Red dot only for an item that's new since the last open.
**Apartment title**: "Your apartment" for the owner, "{name}'s apartment" for watchers.

**Yours drawer header**: "Only you see this. The room and its agents don't."

**My city** (shown before the browser's own location prompt)
- Title: "Show your city's weather?"
- Body: "We'll send your approximate location to Open-Meteo, a weather service, to get your weather. We don't keep it, and the room and its agents never see it." (This is only true because the device rounds the location and calls Open-Meteo directly. If that ever changes, the body must change too.)
- Buttons: "Use my location" / "Not now"
- Declined or blocked: "No problem. The sky follows the house."
- When on, the Sky card chip says "Your city · {temp} {condition}" (e.g. "Your city · 18° Clear") and has a "Turn off" button.

**Packages**
- Signed out: "Sign in to track packages."
- Field label "Tracking number", placeholder "Paste a tracking number", button "Track"
- Note under the field: "We check it with 17TRACK, a tracking service. Only you see it."
- Statuses: "On the way" · "Arriving today" · "Delivered" · "Can't find this number yet. Check it, or try again later."
- Remove: "Stop tracking". A red dot with a count shows packages arriving today.
- Retention (Security, decided Oct 6): we keep a number until 7 days after it shows "Delivered", or 60 days after it was added if it never shows delivered, whichever comes first. "Stop tracking" deletes it at once. A daily server job does the deleting, and every deletion also tells 17TRACK to stop tracking and delete the number on their side. Add "We delete it 7 days after delivery." to the note only once that job is live and tested.
- Storage (Security): numbers go in their own owner-only table in the apartment schema (row-level security on, service role only, keyed by apartment). They never go in the shared room state, the activity log, the agent APIs, `/api/state` or `/api/events`, and never to a watch session. Server logs show only the last 4 characters.
- 17TRACK calls (Security): from our server only, with the API key in a server env var and never in the browser. Only the number and carrier are sent, with no name, email or address. If we use 17TRACK's push updates, check their signature and drop unknown numbers. Owner-only POST, same-origin, `no-store`, with a cap on numbers added (e.g. 20 a day and 50 active per apartment) to protect the 17TRACK quota.

**My music**
- Body: "Play Spotify here, just for you. Sign in to Spotify in the player to hear full songs. Otherwise you'll hear previews."
- Note: "The room and its agents can't see what you play."
- Optional field: "Paste a Spotify playlist link"

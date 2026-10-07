# Next version: security and privacy notes (Security, Oct 6 2026, 7:30 PM ET)

Scope: Designer's Draft 3 HUD frame, built visual-only but wired to features that already exist, plus the unshipped visual items.
Source: /workspace/hud-frame/draft3/NOTES.md and html/. I don't have the full unshipped list (it's in Experience Room), so section 6 gives the rule for those items.
Verdict: no blockers. A visual-only build is low risk if the rules below hold. A diff that breaks one of them comes back to me before preview.

## 1. No new outside calls in this build
- This build adds no new third-party origins. Already-live sources keep working exactly as they do now: Radio Browser streams, and the TV's YouTube player.
- The build must not call Open-Meteo, 17TRACK or Spotify, must not load a Spotify embed, and must not call `navigator.geolocation`. The browser's location prompt must never appear.
- YouTube loads only after a tap on "Watch live", and only from `www.youtube-nocookie.com`. Closing the card removes the iframe. The facade thumbnail is either bundled or fetched through our own server. Loading it from `i.ytimg.com` would send every viewer's IP to Google on page open.
- Fonts (Geist, Geist Mono) are self-hosted, and no Google Fonts or other CDN fonts are used.
- Check on the preview (Tester or Performance): on page open and with every card opened, the network shows only our own origin, our Supabase, Radio Browser streams, and YouTube after the tap. The list must have no SomaFM, Open-Meteo, Spotify or 17TRACK.

## 2. Yours drawer (My music, Packages, My city)
- In this build all three show the title plus "Coming soon." with no fields and no buttons, per Writer and the no-dead-buttons rule. So the build has no tracking-number field, no location button and no playlist field.
- The Yours drawer reads nothing from room state and writes nothing to it, to `/api/*` or to the activity log. Nothing personal goes in localStorage. UI prefs such as tucked or open are fine.
- Watchers (people on a watch link) see no Yours drawer at all, or an empty one. They never see anything of the owner's.
- When it's built for real later, it follows the rules already in NOTES.md for Packages (storage, retention, 17TRACK) and My music (the embed loads only when opened).

## 3. My city rounding (later build; nothing in this one)
- The device rounds the location before anything leaves it, to 1 decimal place of latitude and longitude (about 11 km, finer east–west far from the equator, which is fine). The browser calls Open-Meteo directly with only those two numbers plus the units it needs, never with an ID or the apartment.
- Our server never receives the location: no route, no logs, no room state. If anything is stored, it's only the rounded value on the device, and "Turn off" deletes it.
- Writer's prompt text is only true while all of this holds. If the flow ever goes through our server, the wording has to change and I re-review.

## 4. Owner and watcher views
- Owner vs watcher comes from the server's session (`viewerContext`), never from a URL parameter or client flag.
- A watcher sees no write controls at all: no Copy for an invite or watch link, no Trust, and nothing that changes the room. The server already rejects every write from a watch session with a 403. Hiding the controls keeps the no-dead-buttons rule, because a button that only ever gets a 403 is a dead button.
- In "{name}'s apartment", `{name}` is the display name only, never the email. It's rendered as text and capped at about 40 characters.

## 5. Untrusted text in the new UI
- Agent names, station names (from Radio Browser, a third party), channel names and Activity lines ("{agent} put on {station}.") are untrusted. They're rendered as text through React with no `dangerouslySetInnerHTML`, capped in length, and stripped of control and bidi-override characters.
- The same goes for "Plays {station}" and the Today lines.

## 6. Mockup parameters and unshipped items
- `?s=`, `?play=`, `?safe=`, `?safet=` and `?scroll=` are for screenshots. Accept only the listed values and ignore everything else. Never reflect them into the page, and `?play` must never start sound by itself. Ideally they're active only on previews.
- Unshipped visual items: anything that only changes rendering (CSS, three.js scene, figures, assets, copy) needs nothing from me. Anything that touches an API route, auth, cookies, the state shape, a migration or env vars needs my review first.
- The 404 for made-up `/watch/` paths should be the plain Next.js 404. It must not echo the path back and must not say whether a code exists.

## 7. Cloud agent build
- Production secrets: none. New env vars: none. New API routes or migrations: none. No test hooks (like the old `app/api/test-admin`).
- Expected diff: components, CSS, static assets and copy only. Any change under `app/api/`, `lib/apartments/`, `app/auth/` or `supabase/` gets flagged for my review.
- Placeholder data uses invented names and places only, never real people, emails or addresses.

## 8. Optional now, non-blocking
- This frame fixes the list of outside origins, so it's a good time to ship a CSP in Report-Only mode (backlog item). The list would be `frame-src` youtube-nocookie.com, `media-src https:` (Radio Browser streams come from many hosts), and `img-src` self, data: and our Supabase. It gets enforced in a later version.

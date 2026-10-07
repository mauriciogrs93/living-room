# Next version: tap-every-control checklist for the HUD frame (Tester), Oct 6 2026
Draft. Sources: Interactivity's wiring map (`interactivity.md`), Writer's copy (`writer.md`), `NOTES.md`, and my `hud-frame/build-checklist.md` (checks 1–14 still apply). Production exploratory pass: pending until Engineer says v21 is live. It will be read-only, with no new accounts, and get its own section here.

## Gate (the Founder's rule)
Any dead or do-nothing control means **BLOCK**. Every row runs **3 sizes × 2 roles = 6 times**:
- Sizes: phone 390×844 (plus a 390×664 short-phone pass for the swipe row), tablet 768×1024, desktop 1440×900.
- Roles: **owner** (test account on the preview) and **watcher** (fresh watch link).

## How "dead" is detected (automatic, for every tappable thing, not just the list)
1. Enumerate every element that looks tappable: `button`, `a`, `[role=button|tab|link]`, `[tabindex]`, or computed `cursor:pointer`, or a hover/pressed style.
2. Tap each one at its centre, using a real touch on phone and tablet and a mouse click on desktop. Within 1.5 s, record each of these that happens:
   - a DOM change in the frame
   - a network request (with path and body)
   - a focus or URL change
   - an audio state change
   - a 3D camera or object change
3. **DEAD** means none of those happened. **BLOCK.**
4. **Mismatch** means something happened, but not what the wiring map's row says. **BLOCK.**
5. **Fake affordance** means an element the map calls Info has a pointer cursor, a hover or pressed state, or a chevron. **BLOCK.**
6. **Hidden leak** means a Hidden item is in the DOM and visible. **BLOCK.** The Hidden items are: Yours (if the Founder hides it), temperature, YouTube thumbnail, "Watch live", "Plays from YouTube.", the Back button without addition A, tappable-looking station rows without A, and tappable-looking channel chips without B.
7. Every tap also checks that the target is at least 44×44 px and that no other control overlaps it (reusing the Draft 3 checks).

## Per-row checks (owner and watcher)
| Area | Controls | Pass condition |
|---|---|---|
| Top bar | title, badge, "N here", "N watching", clock, place·time chip | "N here" opens the Here list. "N watching" opens Invite at the watch links for the owner, and is Info for the watcher. The rest are Info, with no affordance |
| Here tab | tab, ✕, each name | Opens and closes. A name centres the camera only if Engineer confirms that's supported; otherwise it's Info |
| Rail (House) | Today, Radio, TV, Sky, plus a second tap on the open one | Each opens its own card, a second tap closes it, the ring sits on the open one. Today clears its red dot, and the dot stays cleared after a reload (stored on the device) |
| Rail (Yours) | Packages, My music, My city | Must be absent (hidden by decision) |
| Radio card | ✕, Play/Stop, "Plays {station}", Forward, Back (A), station rows (A), latest line, scroll chevron | Owner: Play sends `/api/radio on`, the button flips to Stop, and the Activity line appears. Stop sends `off`. Forward sends `next` and the station changes. "Plays {station}" equals the station that starts, 10 of 10 times. Watcher: Mute/Unmute affects this device only and sends no request. ✕ never changes sound |
| TV card | ✕, Turn on/Turn off, chips (B), short-phone swipe row, latest line | Owner: power sends `/api/tap tv` and the room TV changes. Chips switch the channel only with B; otherwise Info with the current one marked. The swipe row scrolls, its snap points line up with the chips, there are exactly 5 chips, and none sit partly under the fade. Watcher: an "On · {ch}" / "Off" line as Info, no button |
| Today card | sunset, headlines, latest event, ✕ | A headline with a link opens a new tab; one without is Info. The latest event opens Activity |
| Sky card | place·time, window line, Look outside, ✕ | Owner: Look outside sends `/api/tap window`, the view changes, and it's logged. Watcher: no button |
| Strips | task strip, chat strip | Both open Activity. "1/3" is Info and rotates about every 6 s |
| Bottom nav | Room, Activity, Invite, People, You | Room closes everything. Activity, People and You open their panels. Invite is absent for the watcher. The watcher's You panel has Room sound plus "Leave", and Leave ends the session |
| Tuck | 8 s idle, pill Today, pill Radio, pill Stop, chevron, empty-room tap, 3D tap while tucked, Tab, Esc, reduced motion | Tucks at 8 ± 1 s. It never tucks on a first visit, with a card or panel open, or while focus is in the frame. Each untuck path does what its row says. The canvas `resize` fires exactly once per slide. With reduced motion, there's no transform transition |
| 3D objects | radio, TV, window, computer, plus 12 toggles (lamp … dog) | Radio, TV and window open the same card as their HUD button. Owner toggles work as in v21. Each watcher tap gives one toast, "Only the owner can change things here." No silent taps, and no raw 403 or JSON shown anywhere |

## Shared vs this-device (leak check)
- **Shared** actions must show up in Activity and in an agent's `/api/look` within 5 s: radio on/off/next/tune, TV power/channel, window, and object toggles.
- **Device-only** actions must never show up in Activity or `/api/look`: opening cards, tuck, the red dot, Mute, and Room sound.

## Timing (recorded, flagged above the limit)
- Time from tap to first visible feedback: at most 100 ms for a card opening, and at most 200 ms for a shared action's pressed state.
- Time for a shared action to show in Activity: at most 3 s on the preview.
- Each tap's result is logged with timestamps to `living-room-playtest/hud-build/taps.jsonl`, with a screenshot per size and role.

## Output
One table per size and role, with each control marked PASS, DEAD, MISMATCH, FAKE or LEAK, plus screenshots. The verdict is AGREE only if all 6 runs show 0 DEAD, 0 MISMATCH, 0 FAKE and 0 LEAK.

## Decisions locked by Exec (7:25 PM)
- Yours is **hidden**: Packages, My music, My city and their divider must be absent, or it's a LEAK.
- Additions A and B are **in**:
  - Back sends `/api/radio prev`.
  - A station row sends `tune` to its index, and the station that plays must match the row.
  - A chip sends `/api/tap tv channel` to that channel, and the TV picture plus "TV · {channel}" must match.
  - A watcher tapping a station row or chip gets an Info result: no request is sent and nothing looks tappable.
- Watcher wording is "Mute / Unmute" and "Leave". YouTube stays hidden.
- Merging the figures is in this version, so I'll also re-run the figure tap and selection checks.

## Still open
1. Whether v21 has a live watcher count (if not, "N watching" is hidden) and camera focus for names in the Here list (Engineer).

## v21.1 password sign-in (added 7:36 PM, for the ~9:00 PM preview)
Run on phone 390, tablet 768 and desktop 1440. Every button and link on the sign-in screen goes through the same dead-control detector.
1. Correct email and password: lands in your apartment, with the masked email next to Sign out. Record the time from tapping the button to the room loading.
2. Wrong password, and an email with no account: one plain line that doesn't reveal whether the account exists. No raw error or JSON. The page stays put and the email field keeps what was typed.
3. Empty or badly formatted fields: the button either can't be pressed or shows a clear line. It never fails silently.
4. Reloading, opening a new tab, and closing and reopening the browser context all keep you signed in. `/api/me` returns role owner each time.
5. Sign out: lands on the sign-in gate. `/api/state` then returns 403, and reloading doesn't bring the session back.
6. Signed-out direct `/room` and a watch link still behave as in v21 (gate, then watcher read-only).
7. Every other link on the screen (forgot password, sign-up, magic link) either works end to end or isn't there.
8. Password field: shows dots, has `autocomplete=current-password`, and a show/hide toggle if one exists. No password ever appears in the URL, the logs, or my screenshots.
9. Repeated wrong attempts: there's a rate limit with a clear line, and no 500 errors. I'll make at most 6 attempts on the preview.

10. Wording: every sign-in, failure, rate-limit, forgot/reset and sign-out line must match `/workspace/next-version/writer-auth.md` word for word (HUD and 404 wording per `writer.md`). Any mismatch is a MISMATCH.

## Added 7:40 PM: sign in with an email link, then set a password (the Founder's first sign-in after go-live)
Rule: I send zero sign-in emails (the email quota is used up). On the preview, the email-link step goes through the preview-only test hook, which creates the session server-side without sending anything. If that hook isn't in v21.1, this path can't be tested on the preview. I'll say so in my report as UNTESTED, not PASS.
11. Signing in with an email link opens "Set a password" right away (not the recovery page's "Set a new password"). The body reads exactly "Next time, sign in with your email and password." and the buttons read "Save password" and "Not now".
12. Save password shows "Password saved." The line about other devices appears only if the other session really is signed out (I check with a second browser context).
13. Not now really closes the offer, and it stays closed after a reload. The "Set a password" link in the owner's You panel brings it back.
14. After saving: sign out, then sign in with the password, which lands in the owner's apartment. The old password (the one in tester-account.txt) is rejected with the generic line. Afterward I restore the file's password, or tell Engineer it changed. The new password is never shown in chat.

## Added 7:40 PM: cards open as sheets over the room (Designer's rule)
15. At 390 and 768, opening any card or menu leaves the room canvas exactly the same size (clientWidth/Height and drawing-buffer size the same, with the card open and closed). The card slides up as a sheet over the room.
16. Tapping the dim area above the sheet closes it, swiping down closes it, and Close closes it. The bottom nav stays visible and tappable the whole time. Esc closes it at 1440.
17. The homepage hero apartment at 390: its canvas size doesn't change while the page loads, scrolls, or when any menu opens.

## Added 7:41 PM
18. Interactivity point 12: tapping the dim area directly over a lamp, the TV or the radio closes only the sheet. The object doesn't change, and there's no `/api/tap` or `/api/radio` request. Swiping down closes the sheet only from the handle, or when its content is already scrolled to the top. Tapping a bottom-nav item swaps the sheet's contents and never stacks a second sheet (exactly one sheet in the DOM).
19. Forgot password isn't in v21.1. There's no forgot or reset link anywhere. A failed sign-in shows exactly "That email and password don't match. Try again." (per writer-auth.md). This replaces item 7's forgot-password case.
20. The dim area behind the sheet has no blur: its computed backdrop-filter and filter are none at all three sizes.

## Updated 7:45 PM: how to check "Set a password" on the preview
Engineer: no test hook for this. Sign in with the password in tester-account.txt. The account has a password but the password-set flag is unset, so the offer appears for real after sign-in. Tap Save password and Not now. After Not now, open You and tap "Set a password" to bring it back. Only the real email-link → offer step is UNTESTED (Founder walks that at about 9:45 PM ET). Automated tests cover email link → /auth/callback → offer with no Continue page. Still send zero auth emails.

## Added 7:49 PM
21. Watcher taps the front door: it opens the Here list with no toast (agreed 7:49 PM). It sends zero write requests, and the owner's door still opens People.
22. Watcher Unmute really plays the radio on that device (an audio element is playing with an https source from the server snapshot), and Mute stops it. Neither sends a shared request.
23. Watcher title with no display name reads exactly "The apartment", never an email.
24. A made-up `/watch/<random>` link shows "This watch link isn't valid. Ask the owner for a new one." plus a working "Go to the Living Room" link. Any other unknown path shows "This page isn't here." plus the same link. Neither page repeats the path back.

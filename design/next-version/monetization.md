# Next version: where the HUD frame could later hold a revenue hook (Monetization)

Tue Oct 6, 2026, ~7:30 PM ET. Notes only. Nothing to build now. Based on the approved HUD Draft 3 (`/workspace/hud-frame/draft3/NOTES.md`, `html/hud.html`), the Draft 5 writeup, my KB (`/workspace/monetization-kb/`, esp. `subtle-monetization-ideas.md`) and Performance's findings (`/workspace/performance-kb/findings.md`).

## Ground rules for any hook in the frame
- **No new rail button, badge or tab.** The rail stays Today / Radio / TV / Sky (House) and My music / Packages / My city (Yours). A hook lives one tap deep inside a card that already exists.
- **Keep the Yours drawer free of anything for sale.** Its header promises "Only you see this. The room and its agents don't." Selling there would undercut that promise.
- **Keep the Radio and TV cards free of anything for sale.** They play third-party streams (Radio Browser stations, YouTube), and whether those can sit next to a paid product hasn't been checked. SomaFM is already being removed over its terms.
- **The HUD adds 0 draw calls** (Performance's rule). A hook is text in a card. If it has a 3D object, that object goes through the normal phone budget.
- **Prices sit only in the card.** Never on the frame, and never as a badge, countdown or pop-up. The red dot keeps its one meaning: "new since last open".

## Hook 1 (watchers): a "gift to the room" line in the Today card
- **Where:** the Today card already lists plain one-sentence items (e.g. "Sunset at 6:52 PM."). When a piece has been gifted, Today shows one item in the same voice, Writer's line: "{name} gave the house a {piece}." (e.g. "Mika gave the house a brass reading lamp.") Tapping the item opens the piece's existing title-block card, and only there is there a single quiet line, Writer's line: "Give the house one like this · $6" (the $6 is my ESTIMATE, not a decided price).
- **The 3D object:** the gifted piece sits on the shelf in the house, with nothing floating (Physicist). Following Interactivity's rule, tapping the object and tapping the Today item open the same card.
- **Why here:** it's the only shared, room-wide card that isn't third-party media, and it already speaks in short news lines. A gift reads as something that happened in the house, not as an ad. This is "The Shelf", my top pick in `subtle-monetization-ideas.md`: buyers are the people already watching, so there's no seller cold start.
- **Phone budget (Performance, Oct 6):** each gifted piece is a new 3D object, adding at least 1 draw call. So each piece is a single mesh with one material, with a cap of **5 on the shelf at once**. Physicist confirmed the bookshelf has five free slots, one per shelf, each fitting a footprint up to 12 × 12 cm with no overhang. That is about +5 draw calls (ESTIMATE, single-material pieces), and Performance should confirm the headroom at 3 agents. Older gifts rotate off the shelf and stay listed in the Today card.
- **Sequencing (room consensus, Oct 6):** Performance estimates 3 agents at about 112 draw calls (from measured 70 empty and 126 with 4). Five pieces would bring that to about 117 of 120, which is too tight. **So build the gift shelf after the figure merge, not before.** The pieces don't cast shadows, because they already sit in the shelf board's shadow (Physicist). Any fake contact shadows are either one combined mesh for all five or skipped.
- **Rules:** at most 1 gift item a day in Today, with no red dot for gift items unless genuinely new. Watchers never see a list of prices or a store view.

## Hook 2 (owner only): "Your house is full", PARKED until seats can be sold
- **Where:** owner-side only, inside the Door tab's People view (Draft 5 Option A: **Invite an agent** + **People**). It appears only when the apartment hits its agent limit. Watchers never see it.
- **Why here:** the moment of need (an owner wants one more agent and can't) is the only time an upgrade helps rather than nags. It builds on the owner-controlled door.
- **What it can offer (revised Oct 6):** since v21 every owner already has a private apartment (Writer), so "private room" is not a valid offer. The only real product here is **a bigger house** (more agent seats). Performance measured that 4 figures take a phone to 126 draw calls on steady frames on v20, against a limit of 120. So that can't be sold until each figure is merged into 1–2 draw calls (Designer's Draft 5 suggestion, ~0.5–1 day, ESTIMATE).
- **Until then:** the line is just "Your house is full." (Writer) with nothing for sale. Once the figure merge lands and is measured, the second line names "a bigger house", and Writer words it then.

## Before either hook can go live (blockers, unchanged from my brief)
1. Vercel Hobby forbids commercial use (donations to us are OK). Any price means Vercel Pro ($20/mo) first. With Supabase Pro ($25/mo), the fixed base is $45/mo.
2. Payments go through a Stripe Payment Link the Founder creates himself (2.9% + 30¢ per charge, so items should cost ≥ $5).
3. Fix the "Poppy" trust bypass and the invite-code bug before selling anything behind the door (re-check whether v21 already fixed them).
4. The Founder's go on everything. Nothing here is approved.

## Spots I'd keep clear of revenue for good
The tuck pill, the "N here / N watching" counters, the apartment title, the Activity strip, the Sky card and My city. They're the calm, and the only elements every visitor sees.

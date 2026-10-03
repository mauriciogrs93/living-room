# Living Room: "Architectural Maquette" redesign (site-maquette)

This folder is a copy of the live v15 source (`/workspace/living-room-vercel-v15`, local git baseline commit `5e48734`) with the maquette v2 design (prototype-designer/) ported into the real Next.js app. **Nothing has been deployed or pushed.** The original v15 folder, the Vercel project and the live site are unchanged.

Every feature is still here: agents and their motion, live data feeds (state polling/SSE, news, weather, radio), tap cards, the Tonight ribbon and card, the TV ticker, day/night, the landing page, the WebGL-fail fallback house, owner notes, the bookshelf reader, the computer desk, the dog, `?floor=` close-ups, and every route and API. No server, API, `lib/` or engine code was changed.

## What changed

### 3D room (react-three-fiber)
- **Flat material palette, no bitmaps.** Plaster, birch, oak, linen, steel, brass, terracotta and graphite (`PAL` in `components/room/maquette/config.ts`). Each piece is built from cached rounded boxes, cylinders and extrusions, with one PMREM room environment so the metals read. `textures.ts` (canvas textures) is deleted.
- **Lighting rig.** Warm sun with soft PCF shadows (radius 3, or 5 at night), a cool hemisphere fill and a front fill. At night each lit room gets a warm bounce light, and the lamps, monitor, pendant and stove glow. Contact shadows are baked per floor plus the plinth, and re-bake when furniture moves. Every storey also has merged ambient-occlusion strips. Static meshes are merged per piece and per storey to cut draw calls.
- **No walnut frame, beams or roof.** The house is a plaster section on a birch plinth: three open storeys, extruded walls with window openings, edge rails and real stair flights.
- **Perspective camera** (fov 28, yaw 34° desktop / 32° phone, pitch 30°). It fits the house into whatever space the HUD leaves free: below the ribbon, beside the card on desktop, above the sheet on phone. It refits when a card or Tonight opens. `?floor=kitchen|living|bedroom` frames one floor and hides the floors above it.
- **Plaster figures**, with one muted colour per agent: the registered colour is reduced to OKLCH chroma ≤ 0.055 and lightness 0.58–0.70 (`maquette/color.ts`). Charm tweaks: blinking eyes, a per-agent head tilt, a talking arm, mitten hands, a knee joint, shins that reach the floor when seated, a nap pose for the dog, and a focus ring.
- **One TV ticker.** It is projected (matrix3d homography) onto the lower band of the TV glass, clipped and faded at both ends. The duplicate ticker is gone.
- **"Living Room Home" label removed.** The monitor's typed line now shows in the computer card (tap the monitor; the hit area is 56×44).

### HUD and pages
- **Fonts: Geist and Geist Mono**, self-hosted as Latin variable woff2 subsets through `next/font/local` (`app/fonts/`, SIL OFL; licence in `app/fonts/OFL.txt`). The site no longer depends on Google Fonts at build time or at runtime. Outfit and Fraunces are gone, and their CSS variables are aliased to Geist.
- **HUD restyle.** Plaster cards, 1px hairlines, 3–4px radius, soft two-layer shadows and steel `#2D3136` text. Mono uppercase labels; 44px buttons; tabs without icons. Terracotta appears only once, on the live dot of the "N HERE" corner button (the landing page uses it once too, on its live dot). The room card is a drawing title block (LR–01 / SECTION A–A / 1:50).
- **Name tags** are mono labels with a muted swatch and a hairline leader (18px; 32px when seated). Each sits inside a 44px-tall padded hit area. Speech notes are drawing-note cards with their own leader. Emoji are removed from tags, the activity list and the fallback house.
- **Tonight.** A plaster ribbon (32px on phone, meta hidden there). The card is plaster with steel text at 80% / 70% opacity. This **fixes the v15 contrast bug** where the summary and meta were near-white on a light card. The card has READ STORY / NEXT / CLOSE buttons, and on phone it hides the summary so the house keeps the screen.
- **Night "N here" button bug fixed.** Colour tokens moved out of the inline `style` on `.room-root` into CSS (`app/hud.css`), so `.is-night` always wins.
- **plan.md §4 layout fixes** (the Founder approved the defaults): the camera frames the free rect; on phone the speech note gives way to an open sheet or to Tonight; the drawing-sheet caption and scale bar show on desktop only, and only when the whole house is shown with no card open; the phone sheet is capped at 38dvh with a grip; labels are clamped and de-overlapped under the ribbon and above the sheet.
- **Landing page.** Rebuilt as a drawing sheet: mono header, Geist headline, the one-sentence copy box, three numbered steps, a steel CTA showing the live count, and a hero figure. The hero (`public/maquette-hero.webp`) was **rendered from this built site**.
- **Fallback house** (when WebGL can't start). A flat CSS maquette section: plaster storeys, a birch plinth, oak and linen blocks, figures in each agent's muted colour with mono name tags. Night variant included. It doesn't import three.js.
- **Favicon** (`app/icon.svg`): a plaster tile showing the three-storey section in steel line, a birch plinth and a single terracotta dot.

## Files

Changed (vs `5e48734`):
`app/globals.css`, `app/hud.css`, `app/icon.svg`, `app/layout.tsx`, `components/home.tsx`, `components/one-liner.tsx`, `components/watch-app.tsx`, `components/hud/chrome.tsx`, `components/hud/tokens.ts`, `components/hud/sections/activity.tsx`, `components/hud/sections/now.tsx`, `components/room/atmosphere.tsx`, `components/room/avatar.tsx`, `components/room/computer-desk.tsx`, `components/room/furniture-dog.tsx`, `components/room/furniture-kit.tsx`, `components/room/furniture-pieces.tsx`, `components/room/furniture-shell.tsx`, `components/room/global-tape.tsx`, `components/room/house-fallback.tsx`, `components/room/house-ui.tsx`, `components/room/interact.tsx`, `components/room/owner-notes.tsx`, `components/room/room-canvas.tsx`, `components/room/tv-tape.tsx`

New:
`components/room/maquette/config.ts` (look knobs and the desktop toggle), `maquette/kit.ts` (materials, geometry cache, merging), `maquette/shell.ts` (house shell), `maquette/pieces.ts` (furniture and figure builders), `maquette/color.ts` (muted agent colours, dependency-free), `app/fonts/Geist.woff2`, `app/fonts/GeistMono.woff2`, `app/fonts/OFL.txt`, `public/maquette-hero.webp`, `MAQUETTE-CHANGES.md`

Deleted:
`components/room/textures.ts`, `components/room/furniture-extra.tsx`, `components/room/furniture-stairs.tsx` (folded into the new builders)

No dependency changes: `package.json` and `package-lock.json` are untouched.

## Desktop-width toggle (undecided)
The default matches v2: on desktop the room card starts closed, the house uses the full width, and the drawing-sheet caption sits in the corner. To open the card (Now tab) on first desktop load and frame the house beside it, do either of these:
- set the build-time env var `NEXT_PUBLIC_MAQUETTE_DESKTOP_CARD=1` (in the Vercel project, or inline: `NEXT_PUBLIC_MAQUETTE_DESKTOP_CARD=1 npm run build`), or
- change `desktopCardOpenByDefault` in `components/room/maquette/config.ts`.

Both variants were built and screenshotted (`site-maquette-shots/desktop-day.png` and `checks/desktop-day-card-default-ON.png`). A URL hash (`#now`, `#activity`) still overrides the default.

## Build and local run
```bash
cd /workspace/maquette-revamp/site-maquette
npm install          # only if node_modules is missing
npm run build        # Next 16.3.8 / Turbopack: compiled and type-checked clean
PORT=3901 npm run start
```

## How to deploy (for the Founder's approval only; NOT run)
The live site is the Vercel project **`living-room`** (https://living-room-psi.vercel.app). Its Redis environment variables live in the project, so nothing about them changes. The safest route is a preview first, then production:
```bash
cd /workspace/maquette-revamp/site-maquette
npx vercel link --yes --project living-room   # one-time: writes .vercel/ in this folder only
npx vercel deploy                              # preview URL to check on a real phone
npx vercel deploy --prod                       # production, once the preview is approved
```
To roll back, promote the previous production deployment in the Vercel dashboard (or `npx vercel rollback`).

## Verification done (headless Chrome + SwiftShader against the built `next start` server, 3 local test agents)
- Screenshots: `site-maquette-shots/` (desktop day/night, phone day/night, phone card, phone Tonight, landing desktop and phone) and `site-maquette-shots/checks/` (activity card, follow-an-agent, bookshelf reader, computer card, `?floor=living`, phone `?floor=bedroom` at night, the WebGL-off fallback house on desktop and on phone at night, the desktop card-open toggle, the favicon).
- No console errors and no page errors on any page. The only failed requests are Next's RSC prefetches, aborted when the headless tab closes.
- Checked by script: tag follow → card highlights the agent; READ THE SHELF opens the reader; the monitor hit area is 56×44 and toggles the computer card on and off; tags are 26px with a −9px/−6px `::after`, making the hit area 44px; exactly one `.news-tape`; no "Living Room Home" text; Tonight opens from the ribbon; the hash opens the card; the toggle opens the card on desktop.
- `npx tsc --noEmit`: clean. ESLint: 28 findings against 16 at baseline. The 12 new ones are all `react-hooks/immutability`: the React Compiler lint flagging three.js objects mutated inside `useFrame` (the standard R3F pattern, and the same pattern as the 2 baseline findings in `room-canvas.tsx`). The React Compiler isn't enabled in this app, so they have no runtime effect.

## Known gaps
- **No real-device testing.** Everything was rendered in headless Chrome with software WebGL. The draw-call and frame-time budget on mid-range phones hasn't been measured; there's a `tightDevice` path (lower DPR, 1024 shadow map), but it hasn't been profiled on hardware.
- **3D object taps** (lamp, fridge, kettle, stove, sink, wardrobe, dog, radio, books) keep the v15 handlers and the R3F hit meshes, but the headless run could only exercise DOM-level taps. Canvas taps weren't clicked in automation.
- **No `NEXT_PUBLIC_LOOK` rollback switch.** Rolling back means redeploying v15 (or promoting the previous deployment).
- **Phone floor mode is width-limited:** `?floor=` on phone frames the floor's full width, so it isn't much closer than the whole-house view. The v15 focus-pan onto a selected agent in floor mode was dropped.
- **Monitor orientation:** the monitor faces the engine's two desk seats, which are behind the desk, so from the camera you see its graphite back. The typed line is read in the computer card, not on the glass.
- **Overlap checker:** the plan's automated label/HUD overlap checker wasn't extended to the real site; labels use the runtime clamp and de-overlap instead.
- Lint findings as above. Real-browser accessibility (screen reader, keyboard order) hasn't been audited beyond 44px targets, focus rings and roles.

# Draft 5c — Engineer freeze kit (Founder GO Oct 7 ~12:09 AM ET)

**Ship target:** Whiteout Survival edge-float HUD + soft flat light-gray field behind the maquette. Same controls as 5b/5c mock — nothing else new. **0 canvas resize** idle↔sheet.

**Frozen at:** Oct 7, 2026 ~12:09 AM ET. Do not wait on Designer for more assets unless Founder asks.

## Paths (all under `/workspace/hud-frame/draft5/`)

| Deliverable | Path |
|---|---|
| HTML/CSS mock + `data-*` hooks | `html5c/` (`hud.html`, `hud.css`, `icons.js`, room cuts / flatbg plates, fonts) |
| Control plan (behavior + wiring) | `CONTROL-PLAN-5b6.md` (full) + this freeze index |
| After-measure (390/1440 idle+TV) | `after-measure-5c.json` — stage Δ **0** both breakpoints |
| Numbered SBS (phone + desktop, idle + TV) | `draft5c-sbs-p390-idle.png`, `draft5c-sbs-p390-tv.png`, `draft5c-sbs-d1440-idle.png`, `draft5c-sbs-d1440-tv.png` |
| Writer ship strings | `writer-labels.md` |
| Notes / changelog §10 | `NOTES.md` |
| `data-*` audit | `data-attr-audit-5c.json` |
| Whiteout ref | `ref-whiteout-survival-hud.jpg` |
| Target shots | `out5c/p390-idle.png`, `out5c/p390-tv.png`, `out5c/d1440-idle.png`, `out5c/d1440-tv.png` |

## Layout law (must hold on preview)
1. Soft flat field `rgb(208,205,198)` — not yard/neighbors, not photoreal, not dark, not docked inset plate.
2. Apartment full-bleed; HUD floats on edges only (tape, top, HOUSE rail, bottom strips + icon nav).
3. Phone sheets: slide up over room; apartment size unchanged (Δ0). Desktop: float card, no scrim.
4. Every control wired — no dead buttons. Tester taps all before go.

## Measure snapshot (frozen)
- p390 idle/tv: stage **390×844**, house **280.8×523.3**, Δ0
- d1440 idle/tv: stage **1440×900**, house **547.2×702**, Δ0

## Out of kit / not blocking
- Bundled YT thumb (nice-to-have)
- Figma-only, PSD, video, every-micro-state SBS — skip

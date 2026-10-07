# Performance: next version (phone budget), 2026-10-06 ~7:25 PM ET
Read-only notes. Numbers are measured on this computer (SwiftShader: call counts, triangles and bytes are exact; frame times are not meaningful). Sources: /workspace/performance-kb/findings.md, v20-result.md, hud/budget.md.

## Phone gates (unchanged)
≤120 draw calls steady, ≤150 on shadow frames, median frame ≤16.7 ms, <250k triangles.

## HUD frame, visual-only
- The frame is DOM only, so it adds 0 draw calls. Rules from NOTES.md still apply: no backdrop blur, players load only on tap, one player at a time, removed on close, counters and clock update at most once a second, tuck slides with CSS transforms and the canvas resizes once after the slide.
- Draft 4b check (7:45 PM): no backdrop-filter or blur, no iframe, no outside URLs, TV thumbnail removed, one rAF for layout only, passive scroll. Cards are overlay sheets, so opening one causes 0 canvas resizes. AGREE on the mockup; the build preview gets measured separately.
- v21 has no YouTube (Interactivity checked f7c3daa), and "Watch live" stays hidden, so this build ships no TV thumbnail at all. If one comes later: the mockup's yt-thumb.jpg is 45 KB. Ship it as a small WebP or AVIF at card size, loaded lazily when the TV card opens, not at page load.
- If YouTube is live later: the embed costs 1143 KB, 985 KB of JS and about 10 MB of memory per tap, against about 2 KB for a thumbnail. That's why it must load on tap only.

## Cost of unshipped items I've measured
1. Agent figures (v22 item 8, figure merge): the room is 70 calls empty, and each figure adds about 14. Four figures measured 126 steady and 140 on shadow frames, so the 120 gate already breaks at 4 agents. Merging or instancing the figures is the one item that buys real room. Any new 3D object (gifted pieces, a package box, new props) adds at least 1 call each, and more with several materials.
2. Idle frames (v22 item 13): the scene renders every frame even when nothing moves. Rendering on demand cuts GPU work, heat and battery for idle watchers. It adds no cost.
3. Anything adding real-time shadows, post-processing or transparent layers (for example rain streaks) needs its own measurement on the preview. I have no numbers for those yet, so I'm not estimating.

## Plan for the build preview
Same probe as v20 (scripts/v20-gl.mjs) at 390×844, DPR capped at 2. Check calls and triangles with 0 and 4 figures, with each card open and with the frame tucked. Network check on open: no player and no outside requests until a tap. Count canvas resizes per tuck (expect 1). AGREE or BLOCK against the gates above.

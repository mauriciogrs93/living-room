# HUD frame Draft 4 (Designer, Oct 6 2026). Mockup only, nothing deployed. Draft 3 untouched.
Write-up, ranked unshipped list and build delta: /workspace/next-version/designer.md
html/: copy of draft3/html + "Draft 4" CSS block; yt-thumb.jpg removed. URL states: ?s=radio|tv|tucked ?play=0 ?safe=34 ?v=watch (mockup only).
Render: NODE_PATH=/workspace/hud-frame/node_modules node shoot3.mjs $PWD/html $PWD/out after.json "$(cat views4.json)"
Before (Draft 3): same command with /workspace/hud-frame/draft3/html -> before/ + before.json
Side-by-sides: python3 mkspec4.py && python3 sbs2.py sbs-specs.json ; contact sheet: python3 contact4.py

# Standing end-step: tip bundle (every cloud coding run)

Required last step before you finish:

1. `git bundle create <name>.bundle <all ship branches>` — full history, not a range.
2. `git bundle verify <name>.bundle`
3. Record `git rev-parse HEAD` (and each branch tip) in the report.
4. Attach `<name>.bundle` as an artifact (Engineer clones it on the box; Origin fetch may lack credentials).

This stays even when Vercel↔Origin is connected.

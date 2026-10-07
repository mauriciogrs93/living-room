/**
 * Design-only figure line-up (?debug=1&lineup=1|4|10).
 * The probe only repositions agents already in the snapshot. It never creates figures.
 * VERCEL_ENV==="production" is hard-off, and so is NODE_ENV==="production" unless this is a
 * Vercel preview. next.config inlines NEXT_PUBLIC_FIGURE_LINEUP and VERCEL_ENV, so a
 * production bundle returns 0 before it reads the query. Preview stays on.
 */
export function lineupEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NEXT_PUBLIC_FIGURE_LINEUP === "off") return false;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") return false;
  return true;
}

export function lineupCount(search: string): number {
  if (!lineupEnabled()) return 0;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("debug") !== "1") return 0;
  const raw = params.get("lineup");
  if (raw === "1") return 3;
  if (raw === "4" || raw === "10") return Number(raw);
  return 0;
}

/** How many figures the lineup will draw. An empty room stays empty. */
export function lineupDraws(agentCount: number, search: string): number {
  const asked = lineupCount(search);
  if (asked <= 0 || agentCount <= 0) return 0;
  return Math.min(agentCount, asked);
}

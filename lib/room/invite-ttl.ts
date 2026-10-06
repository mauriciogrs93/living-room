/**
 * How long an UNUSED invite works. This is the one place to change it:
 * v21: 60_000 = 1 minute, counted from the owner's Copy tap (each tap mints a fresh code; nothing rotates).
 * v20 was 600_000 (10 minutes).
 * skill.md derives its wording ("about a minute" / "about 10 minutes") from this value.
 * A used invite is unaffected: the agent keeps its 24-hour guest pass (GUEST_PASS_MS in door.ts).
 * Watch links (lib/apartments/resolve.ts) live the same minute.
 */
export const INVITE_TTL_MS = 60_000;

/** Plain words for INVITE_TTL_MS, used by skill.md. */
export function inviteLifeWords(ms: number = INVITE_TTL_MS) {
  const minutes = Math.round(ms / 60_000);
  if (minutes <= 1) return "about a minute";
  return `about ${minutes} minutes`;
}

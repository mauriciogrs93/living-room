/**
 * v20: the line the OWNER copies. Minted fresh by POST /api/door {action:"invite"} (owner only).
 * The invite is a separate value the agent sends in its register body. Never a URL query.
 * Writer copy (v20), word for word.
 */
export function inviteLine(origin: string, code: string) {
  const base = origin.replace(/\/$/, "");
  return `Read ${base}/skill.md and join the Living Room with invite ${code}. Use it now; it works once.`;
}

/** v20: what non-owners see where the join line used to be. No code, no placeholder, no Copy button. */
export const PUBLIC_JOIN_COPY = "Rooms are private. Ask the owner for an invite line.";

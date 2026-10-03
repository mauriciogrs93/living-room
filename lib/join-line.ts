export function joinLine(origin: string) {
  const base = origin.replace(/\/$/, "");
  return `Read ${base}/skill.md and follow the instructions to join the Living Room.`;
}

/** v19: the invite is a separate value the agent sends in its register body. Never a URL query. */
export function inviteLine(origin: string, code: string) {
  const base = origin.replace(/\/$/, "");
  return `Read ${base}/skill.md and join the Living Room with invite ${code}.`;
}

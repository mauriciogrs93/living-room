export function joinLine(origin: string) {
  const base = origin.replace(/\/$/, "");
  return `Read ${base}/skill.md and follow the instructions to join the Living Room.`;
}

export function inviteLine(origin: string, code: string) {
  const base = origin.replace(/\/$/, "");
  return `Read ${base}/skill.md?invite=${code} and follow the instructions…`;
}

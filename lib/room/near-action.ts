import { SELF_ACTIONS, VERBS } from "./engine-host";

/** Closest known action, for a did-you-mean hint. */
export function didYouMean(action: string): string | null {
  const needle = action.trim().toLowerCase();
  if (!needle) return null;
  const keys = [...new Set([...Object.keys(VERBS), ...SELF_ACTIONS])];
  let best = "";
  let score = 99;
  for (const key of keys) {
    let next = edit(needle, key);
    if (key.startsWith(needle) || needle.startsWith(key)) next = Math.min(next, 1);
    if (next < score) {
      score = next;
      best = key;
    }
  }
  if (!best || score === 0 || score > 5) return null;
  return best;
}

function edit(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[] = new Array(rows * cols);
  for (let i = 0; i < rows; i += 1) grid[i * cols] = i;
  for (let j = 0; j < cols; j += 1) grid[j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i * cols + j] = Math.min(grid[(i - 1) * cols + j]! + 1, grid[i * cols + j - 1]! + 1, grid[(i - 1) * cols + j - 1]! + cost);
    }
  }
  return grid[rows * cols - 1] ?? 99;
}

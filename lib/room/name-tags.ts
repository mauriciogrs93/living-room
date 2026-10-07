/** Screen-space name tags. Plain text only. Collision runs on caller-owned buffers. */

export const NAME_CAP = 40;
export const TAG_W = 132;
export const TAG_H = 28;
export const TAG_GAP = 6;
export const AWAY_LABEL = "Away";

const MARKUP = /<[^>]*>/g;
const CONTROLS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const NUDGE_X = [0, 146, -146, 0, 0, 146, -146];
const NUDGE_Y = [0, 0, 0, -40, 40, -40, -40];

export type TagPoint = {
  id: string;
  x: number;
  y: number;
  depth: number;
  name: string;
  idle: boolean;
  color: string;
};

export type TagRect = { l: number; t: number; r: number; b: number };

export type TagOut = {
  id: string;
  x: number;
  y: number;
  text: string;
  label: string;
  more: number;
  color: string;
  /** Newline-separated plain names held in a +N stack. */
  who: string;
  /** Newline-separated agent ids for that stack. */
  ids: string;
  /** Newline-separated swatch colors for that stack. */
  dots: string;
  /** Newline-separated 1/0 flags, parallel to who. 1 means that person is away. */
  away: string;
};

/** Registered spelling, with markup, control characters, and bidi marks removed. */
export function plainName(raw: string): string {
  return raw.replace(MARKUP, "").replace(/[<>]/g, "").replace(CONTROLS, "").replace(/\s+/g, " ").trim().slice(0, NAME_CAP);
}

/** Activity join row. The name is plain text. A missing name does not leave a bare "just walked in". */
export function walkedInLine(name: string): string {
  const clean = plainName(name);
  return clean ? `${clean} walked in.` : "Someone walked in.";
}

/** Idle agents keep the registered name and add Away. Everyone else shows the name. */
export function tagCopy(name: string, idle: boolean): { text: string; label: string } {
  const clean = plainName(name);
  if (idle) {
    const text = clean ? `${clean} · ${AWAY_LABEL}` : AWAY_LABEL;
    return { text, label: text };
  }
  return { text: clean, label: clean };
}

/**
 * +N row. The visible string and the accessible name are this same value.
 * Built from plainName, with " · Away" appended as plain text.
 */
export function stackRowCopy(name: string, idle: boolean): string {
  const clean = plainName(name) || "Someone";
  if (!idle) return clean;
  return `${clean} · ${AWAY_LABEL}`;
}

/** Join toast and task line. "just walked in" never reaches the screen. */
export function joinToast(text: string): string {
  const match = /^(.*?)(?:\s+)?just walked in\.?$/.exec(text.trim());
  if (!match) return text;
  return walkedInLine(match[1] ?? "");
}

/** Accessible name for a collapsed stack: "3 more: Ada, Bea". */
export function stackLabel(count: number, names: string[]): string {
  const clean = names.map((name) => plainName(name)).filter(Boolean);
  return clean.length ? `${count} more: ${clean.join(", ")}` : `${count} more`;
}

function overlaps(ax: number, ay: number, bx: number, by: number) {
  return ax < bx + TAG_W + TAG_GAP && ax + TAG_W + TAG_GAP > bx && ay < by + TAG_H + TAG_GAP && ay + TAG_H + TAG_GAP > by;
}

function hitsBlock(x: number, y: number, blocks: TagRect[], blockCount: number) {
  const r = x + TAG_W;
  const b = y + TAG_H;
  for (let i = 0; i < blockCount; i += 1) {
    const box = blocks[i]!;
    if (x < box.r && r > box.l && y < box.b && b > box.t) return true;
  }
  return false;
}

function inside(x: number, y: number, view: TagRect) {
  return x >= view.l && y >= view.t && x + TAG_W <= view.r && y + TAG_H <= view.b;
}

/** Pull a tag fully into the view so the scene edge cannot clip it. */
function clearOfEdge(x: number, y: number, view: TagRect) {
  const maxX = Math.max(view.l, view.r - TAG_W);
  const maxY = Math.max(view.t, view.b - TAG_H);
  return {
    x: Math.round(Math.min(maxX, Math.max(view.l, x))),
    y: Math.round(Math.min(maxY, Math.max(view.t, y))),
  };
}

function fits(x: number, y: number, blocks: TagRect[], blockCount: number, view: TagRect, out: TagOut[], placed: number) {
  if (!inside(x, y, view) || hitsBlock(x, y, blocks, blockCount)) return false;
  for (let i = 0; i < placed; i += 1) if (overlaps(x, y, out[i]!.x, out[i]!.y)) return false;
  return true;
}

/**
 * Nearest tags win. The rest collapse into one "+N" tag.
 * Tags that would land in a HUD block are omitted (they are clipped, not counted).
 * `order` and `out` are caller-owned. Returns how many tags were written.
 */
export function placeTags(
  points: TagPoint[],
  count: number,
  blocks: TagRect[],
  blockCount: number,
  view: TagRect,
  order: Uint16Array,
  out: TagOut[],
): number {
  const n = Math.min(count, order.length, out.length, points.length);
  for (let i = 0; i < n; i += 1) order[i] = i;
  for (let i = 1; i < n; i += 1) {
    const id = order[i]!;
    let j = i;
    while (j > 0 && points[order[j - 1]!]!.depth > points[id]!.depth) {
      order[j] = order[j - 1]!;
      j -= 1;
    }
    order[j] = id;
  }
  let placed = 0;
  let collapsed = 0;
  let ax = 0;
  let ay = 0;
  const pileId: string[] = [];
  const pileName: string[] = [];
  const pileColor: string[] = [];
  const pileAway: string[] = [];
  const hold = (id: string, name: string, x: number, y: number, color: string, idle: boolean) => {
    if (collapsed === 0) {
      ax = x;
      ay = y;
    }
    pileId.push(id);
    pileName.push(plainName(name) || "Someone");
    pileColor.push(color || "#8d99a6");
    pileAway.push(idle ? "1" : "0");
    collapsed += 1;
  };
  for (let k = 0; k < n; k += 1) {
    const point = points[order[k]!]!;
    const rawX = Math.round(point.x - TAG_W / 2);
    const rawY = Math.round(point.y - TAG_H - 10);
    if (point.x < view.l - 20 || point.x > view.r + 20 || point.y < view.t - 20 || point.y > view.b + 20) continue;
    const nudged = clearOfEdge(rawX, rawY, view);
    const x = nudged.x;
    const y = nudged.y;
    if (hitsBlock(x, y, blocks, blockCount)) continue;
    if (!inside(x, y, view) || !fits(x, y, blocks, blockCount, view, out, placed)) {
      hold(point.id, point.name, x, y, point.color, point.idle);
      continue;
    }
    const copy = tagCopy(point.name, point.idle);
    const slot = out[placed]!;
    slot.id = point.id;
    slot.x = x;
    slot.y = y;
    slot.text = copy.text;
    slot.label = copy.label;
    slot.more = 0;
    slot.color = point.color;
    slot.who = "";
    slot.ids = "";
    slot.dots = "";
    slot.away = "";
    placed += 1;
  }
  if (collapsed > 0 && placed < out.length) {
    let home = -1;
    for (let pass = 0; pass < 4 && home < 0; pass += 1) {
      for (let i = 0; i < NUDGE_X.length; i += 1) {
        const x = ax + NUDGE_X[i]!;
        const y = ay + NUDGE_Y[i]!;
        if (fits(x, y, blocks, blockCount, view, out, placed)) {
          home = i;
          ax = x;
          ay = y;
          break;
        }
      }
      if (home >= 0 || placed === 0) break;
      const dropped = out[placed - 1]!;
      const source = points.find((item) => item.id === dropped.id);
      hold(dropped.id, source?.name || dropped.text, dropped.x, dropped.y, dropped.color, Boolean(source?.idle));
      placed -= 1;
    }
    if (home >= 0) {
      const homeBox = clearOfEdge(ax, ay, view);
      const slot = out[placed]!;
      slot.id = "+";
      slot.x = homeBox.x;
      slot.y = homeBox.y;
      slot.text = `+${collapsed}`;
      slot.label = stackLabel(collapsed, pileName);
      slot.more = collapsed;
      slot.color = "";
      slot.who = pileName.join("\n");
      slot.ids = pileId.join("\n");
      slot.dots = pileColor.join("\n");
      slot.away = pileAway.join("\n");
      placed += 1;
    }
  }
  return placed;
}

export const STACK_ROW = 44;
/** Close control plus the list's own padding. Five rows plus this is the cap. */
export const STACK_PAD = 36;

export type StackBand = { top: number; bottom: number };

/**
 * The +N list opens upward. Its bottom edge sits on the pill.
 * Height is five rows, or the free space above the pill, whichever is smaller.
 * A band whose bottom is still above the pill (toast, chat, tabs, the title) leaves an 8px gap.
 */
export function stackListBox(pillTop: number, ceiling: number, bands: StackBand[] = []) {
  const five = 5 * STACK_ROW + STACK_PAD;
  let limit = ceiling;
  for (const band of bands) {
    if (band.bottom <= pillTop + 0.5 && band.bottom + 8 > limit) limit = band.bottom + 8;
  }
  const above = Math.max(0, pillTop - limit);
  const maxHeight = Math.min(five, above);
  return { maxHeight, top: pillTop - maxHeight, bottom: pillTop };
}

export type MeasuredTag = { x: number; y: number; w: number; h: number; ax: number; ay: number };

const SIDE_X = [0, 1, -1, 0, 0, 1, -1, 2, -2, 0, 1, -1];
const SIDE_Y = [0, 0, 0, -1, 1, -1, 1, 0, 0, -2, -2, -2];

function boxHits(x: number, y: number, w: number, h: number, blocks: TagRect[], blockCount: number) {
  const r = x + w;
  const b = y + h;
  for (let i = 0; i < blockCount; i += 1) {
    const box = blocks[i]!;
    if (x < box.r && r > box.l && y < box.b && b > box.t) return true;
  }
  return false;
}

function boxHitsPlaced(x: number, y: number, w: number, h: number, placed: MeasuredTag[]) {
  for (const prev of placed) {
    if (x < prev.x + prev.w + TAG_GAP && x + w + TAG_GAP > prev.x && y < prev.y + prev.h + TAG_GAP && y + h + TAG_GAP > prev.y) return true;
  }
  return false;
}

/**
 * Move each measured tag so the full label sits inside the view and off the
 * obstacles (stair flights). The caller has already read every width.
 */
export function fitTagBoxes(boxes: MeasuredTag[], view: TagRect, blocks: TagRect[], blockCount: number): { x: number; y: number }[] {
  const seated: MeasuredTag[] = [];
  const out: { x: number; y: number }[] = [];
  for (const box of boxes) {
    const w = Math.max(1, box.w);
    const h = Math.max(1, box.h);
    const maxX = Math.max(view.l, view.r - w);
    const maxY = Math.max(view.t, view.b - h);
    let chosen = {
      x: Math.round(Math.min(maxX, Math.max(view.l, box.x))),
      y: Math.round(Math.min(maxY, Math.max(view.t, box.y))),
    };
    for (let i = 0; i < SIDE_X.length; i += 1) {
      const side = SIDE_X[i]!;
      const rawX = side === 0 ? box.x : side < 0 ? box.ax + side * (w + 8) : box.ax + 8 + (side - 1) * (w + 8);
      const rawY = box.y + SIDE_Y[i]! * (h + 8);
      const x = Math.round(Math.min(maxX, Math.max(view.l, rawX)));
      const y = Math.round(Math.min(maxY, Math.max(view.t, rawY)));
      if (x + w > view.r + 0.5 || y + h > view.b + 0.5) continue;
      if (boxHits(x, y, w, h, blocks, blockCount)) continue;
      if (boxHitsPlaced(x, y, w, h, seated)) continue;
      chosen = { x, y };
      break;
    }
    seated.push({ x: chosen.x, y: chosen.y, w, h, ax: box.ax, ay: box.ay });
    out.push(chosen);
  }
  return out;
}

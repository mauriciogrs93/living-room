export type ScreenPoint = { x: number; y: number };

let points: Record<string, ScreenPoint> = {};

export function publishAnchors(next: Record<string, ScreenPoint>) {
  points = next;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1") {
    (window as unknown as { __anchors?: Record<string, ScreenPoint> }).__anchors = next;
  }
}

export function readAnchors() {
  return points;
}

/** Prefer the smoothed on-screen label when the actor has one. */
export function anchorPoint(key: string): ScreenPoint | null {
  if (typeof document !== "undefined" && key.startsWith("agent:")) {
    const id = key.slice("agent:".length);
    const el = document.querySelector<HTMLElement>(`[data-hud-anchor="${CSS.escape(id)}"]`);
    const root = document.querySelector(".room-root");
    if (el && root) {
      const rect = el.getBoundingClientRect();
      const host = root.getBoundingClientRect();
      return { x: rect.left - host.left + rect.width / 2, y: rect.top - host.top };
    }
  }
  return points[key] ?? null;
}

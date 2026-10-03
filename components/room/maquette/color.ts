/**
 * Registered agent colour -> one muted accent (Founder confirmed): OKLCH chroma <= 0.055, lightness 0.58-0.70.
 * Dependency-free so the HUD and the CSS fallback house can use it without pulling three.js into the main bundle.
 */
function toLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function toSrgb(c: number) {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0x8e / 255, 0x9a / 255, 0xab / 255];
  const h = m[1].length === 3 ? m[1].replace(/./g, (ch) => ch + ch) : m[1];
  const n = Number.parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Muted accent as LINEAR sRGB components (what three.js stores internally). */
export function mutedLinear(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  let L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.min(Math.hypot(A, B), 0.055);
  const h = Math.atan2(B, A);
  L = Math.min(0.7, Math.max(0.58, L));
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);
  const l2 = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m2 = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s2 = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return [
    4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
  ];
}

/** Muted accent as a CSS hex (tag swatches, HUD rows, fallback house). */
export function mutedHex(hex: string) {
  return `#${mutedLinear(hex)
    .map((c) => Math.round(toSrgb(c) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

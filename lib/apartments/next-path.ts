/**
 * v21 r2: a `next` parameter may only name a path on this site ("/room", "/room?x=1#y"). Anything else
 * (another origin, "//host", "/\host", a scheme, control characters, an over-long value) falls back.
 */
export function safeNext(raw: string | null | undefined, fallback = "/room") {
  if (typeof raw !== "string" || !raw || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const probe = "https://next.invalid";
    const url = new URL(raw, probe);
    if (url.origin !== probe) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

const BIDI = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Untrusted room text: plain, capped, no control or bidi-override characters. */
export function cleanHud(raw: unknown, max: number) {
  if (typeof raw !== "string") return "";
  return raw.replace(BIDI, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function httpsUrl(raw: unknown) {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function httpLink(raw: unknown) {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

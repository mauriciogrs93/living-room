"use client";

/**
 * v19: the owner key never stays in the URL or localStorage.
 * The ?owner= (or #owner=) link is posted once to /api/owner/session, which sets an HttpOnly cookie,
 * then the parameter is stripped from the address bar. Owner calls carry the cookie, not the key.
 */
export type OwnerSession = { signedIn: boolean; door: boolean };

const KEY_RE = /^own_[0-9a-f]{36}$/;
let pending: Promise<OwnerSession> | null = null;

function takeKeyFromPage() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("owner") ?? "";
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const fromHash = hash.get("owner") ?? "";
  let stored = "";
  try {
    stored = localStorage.getItem("living-room-owner") ?? "";
    localStorage.removeItem("living-room-owner");
  } catch {
    stored = "";
  }
  if (url.searchParams.has("owner") || hash.has("owner")) {
    url.searchParams.delete("owner");
    hash.delete("owner");
    const rest = hash.toString();
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${rest ? `#${rest}` : ""}`);
  }
  return [fromHash, fromQuery, stored].find((key) => KEY_RE.test(key)) ?? "";
}

async function start(): Promise<OwnerSession> {
  const key = takeKeyFromPage();
  try {
    if (key) {
      await fetch("/api/owner/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerKey: key }),
      });
    }
    const res = await fetch("/api/owner/session", { cache: "no-store" });
    const body = (await res.json()) as Partial<OwnerSession>;
    return { signedIn: Boolean(body.signedIn), door: Boolean(body.door) };
  } catch {
    return { signedIn: false, door: false };
  }
}

export function ownerSession(): Promise<OwnerSession> {
  pending ??= start();
  return pending;
}

export async function forgetOwnerSession() {
  pending = Promise.resolve({ signedIn: false, door: false });
  try {
    await fetch("/api/owner/session", { method: "DELETE" });
  } catch {
    /* the cookie expires on its own */
  }
}

import { createHash } from "node:crypto";
import { EMAIL_RE } from "@/lib/apartments/auth";

/** Trimmed, lower-case address, or null when it is empty or not a plausible email. */
export function normalEmail(raw: unknown) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

/** Per-address rate-limit key. The address itself is not the key. */
export function emailLimitKey(email: string) {
  return createHash("sha256").update(`lr-email|${email}`).digest("hex").slice(0, 24);
}

/** Shared by the sign-in card and the auth routes. No symbols required. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordIssue = "empty" | "short" | "long" | "ok";

export function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

/** Empty, under 12 characters, or over 72 UTF-8 bytes. */
export function passwordIssue(value: unknown): PasswordIssue {
  if (typeof value !== "string" || value.length === 0) return "empty";
  if (value.length < PASSWORD_MIN) return "short";
  if (utf8Bytes(value) > PASSWORD_MAX_BYTES) return "long";
  return "ok";
}

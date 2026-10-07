/**
 * Server-only. Sign-up is on only when PASSWORD_SIGNUP_ENABLED is exactly "1".
 * Unset, empty, or any other value is off. This is not a NEXT_PUBLIC variable:
 * the browser receives a boolean prop, never the env name.
 */
export function passwordSignupEnabled() {
  return process.env.PASSWORD_SIGNUP_ENABLED === "1";
}

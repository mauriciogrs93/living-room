/**
 * v21 rate limits, in one place. Global limits live in the store's rate_limits table under the nil
 * apartment (directory().globalHit), so they hold across serverless instances. Every limited answer is
 * 429 with Retry-After (seconds). IP keys are salted hashes, never raw addresses.
 */
export type Limit = { limit: number; windowMs: number };

const MIN = 60_000;
const HOUR = 60 * MIN;

export const LIMITS = {
  /** Sign-in emails per IP (any address). Counted before the address is checked, so junk counts too. */
  otpPerIp: { limit: 5, windowMs: 10 * MIN },
  /** Sign-in emails per address (hashed). */
  otpPerEmail: { limit: 3, windowMs: 10 * MIN },
  /** Sign-in emails across the whole site (new and returning accounts): the signup ceiling. */
  otpGlobal: { limit: 60, windowMs: HOUR },
  /** New apartments per IP, and across the site. */
  createPerIp: { limit: 3, windowMs: HOUR },
  createGlobal: { limit: 30, windowMs: HOUR },
  /** Door attempts: registers per IP (any apartment), and failed invites per IP (see INVITE_FAIL_*). */
  registerPerIp: { limit: 8, windowMs: MIN },
  /** Invite button presses per IP (the owner's own mints are also capped per apartment inside the door write). */
  invitePerIp: { limit: 20, windowMs: MIN },
  /** Watch-link redemptions per IP (good or bad). */
  watchPerIp: { limit: 10, windowMs: 10 * MIN },
  /** Password sign-in attempts per IP and per email (Security: 5 per 15 minutes), counted before Supabase. */
  passwordPerIp: { limit: 5, windowMs: 15 * MIN },
  passwordPerEmail: { limit: 5, windowMs: 15 * MIN },
  /** Password sign-up. The route is 404 while PASSWORD_SIGNUP_ENABLED is false, before these run. */
  signupPerIp: { limit: 5, windowMs: HOUR },
  signupPerEmail: { limit: 5, windowMs: 15 * MIN },
  signupGlobal: { limit: 60, windowMs: HOUR },
  /** Set / change password. */
  passwordUpdatePerIp: { limit: 5, windowMs: 15 * MIN },
} satisfies Record<string, Limit>;

/** Seconds for a Retry-After header (at least 1). */
export function retryAfterSeconds(ms: number) {
  return String(Math.max(1, Math.ceil(ms / 1000)));
}

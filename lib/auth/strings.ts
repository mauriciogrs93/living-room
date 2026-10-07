/**
 * Writer's auth copy (v21.1). Change wording here.
 * Forgot-password lines are kept for a later cut and are not rendered.
 * There is no /auth/confirm page, so its lines are not in this module.
 */
export const INTRO = "One account, one private apartment. Only you and people you send a watch link can see it.";
export const LABEL_EMAIL = "Email";
export const LABEL_PASSWORD = "Password";
export const SHOW = "Show";
export const HIDE = "Hide";
export const SHOW_PASSWORD = "Show password";
export const HIDE_PASSWORD = "Hide password";
export const SIGN_IN = "Sign in";
export const SIGNING_IN = "Signing in…";
/** Unused this cut. Security: do not render a forgot-password control. */
export const FORGOT_PASSWORD = "Forgot password?";
export const OR_DIVIDER = "or";
export const MAGIC_LINK = "Email me a sign-in link";
export const MAGIC_SENT = "Check your email and tap the link. Open it in this browser.";
export const MAGIC_SPAM = "It comes from Supabase. Not there? Check spam.";
export const SEND_AGAIN = "Send it again";
export const DIFFERENT_EMAIL = "Use a different email";
export const CREATE_LINK = "New here? Create an account";
/** Forgot password is hidden, so the reset clause stays off. */
export const SIGN_IN_MISMATCH = "That email and password don't match. Try again.";
export const TOO_MANY = "Too many tries. Wait 15 minutes, then try again.";
export const ENTER_EMAIL = "Enter your email.";
export const ENTER_PASSWORD = "Enter your password.";
export const NO_CONNECTION = "Can't connect. Check your connection.";
export const UNAVAILABLE = "Sign-in isn't available right now. Try again soon.";

export const CREATE_TITLE = "Create an account";
export const PASSWORD_HINT = "At least 12 characters.";
export const CREATE_ACCOUNT = "Create account";
export const CREATING = "Creating…";
export const CREATE_CHECK_EMAIL = "Check your email to confirm your account, then sign in here.";
export const ALREADY_HAVE = "Already have an account? Sign in";

/** Unused this cut (no forgot-password flow). */
export const RESET_TITLE = "Reset your password";
export const RESET_BODY = "We'll email you a link to set a new one.";
export const SEND_RESET = "Send reset link";
export const SENDING = "Sending…";
export const RESET_SENT = "If there's an account for that email, a reset link is on its way. Open it in this browser.";
export const BACK_TO_SIGN_IN = "Back to sign in";
export const EMAIL_LIMIT_COPY = "Too many emails for now. Try again in an hour.";

export const SIGNIN_EXPIRED = "That sign-in link has expired or was already used. Send a new one.";
export const SIGNIN_INVALID = "That sign-in link isn't complete. Send a new one.";

export const OFFER_TITLE = "Set a password";
export const OFFER_BODY = "Next time, sign in with your email and password.";
export const NOT_NOW = "Not now";
export const SET_TITLE = "Set a new password";
export const NEW_PASSWORD = "New password";
export const CURRENT_PASSWORD = "Current password";
/** You panel and change card, once a password exists. */
export const YOU_CHANGE_PASSWORD = "Change password";
export const CHANGE_TITLE = "Change password";
export const CANCEL = "Cancel";
export const SAVE_PASSWORD = "Save password";
export const SAVING = "Saving…";
/** This save revokes other sessions, so Writer's extra sentence is included. */
export const PASSWORD_SAVED = "Password saved. You're signed out on your other devices.";
export const TOO_SHORT = "Use at least 12 characters.";
export const TOO_LONG = "That password is too long.";
export const SAVE_FAILED = "Couldn't save your password. Try again.";
export const YOU_SET_PASSWORD = "Set a password";

export const SIGN_OUT = "Sign out";
export const SIGNED_OUT = "You're signed out.";
export const SIGN_OUT_FAILED = "Couldn't sign out. Try again.";
export const WATCH_LEAVE = "Leave";
export const OWNER_BADGE = "OWNER";

export const SIGNIN_NOTES: Record<string, string> = {
  expired: SIGNIN_EXPIRED,
  invalid: SIGNIN_INVALID,
  unavailable: UNAVAILABLE,
  out: SIGNED_OUT,
  "out-failed": SIGN_OUT_FAILED,
};

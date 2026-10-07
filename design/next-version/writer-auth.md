# v21.1 sign-in copy (Writer, Oct 6 2026, 7:40 PM ET). Strings word for word.
Layout follows Designer (fields on top, "Forgot password?" under the password field, divider, magic link as the secondary button). Rules follow Security (one generic sign-in error, 12+ characters, sign-up switched off in production).
Existing v21 strings marked (v21) stay exactly as they are.

## Sign-in page
- Intro (v21): "One account, one private apartment. Only you and people you send a watch link can see it."
- Field labels: "Email", "Password"
- Show-password toggle: "Show" / "Hide" (accessible label "Show password" / "Hide password")
- Primary button: "Sign in". While waiting: "Signing in…"
- Link under the password field: "Forgot password?"
- Divider: "or"
- Secondary button (v21): "Email me a sign-in link". The rest of the v21 magic-link flow is unchanged: "Check your email and tap the link. Open it in this browser." / "It comes from Supabase. Not there? Check spam." / "Send it again" / "Use a different email"
- Sign-up link (show ONLY when the sign-up switch is on, otherwise it isn't rendered at all): "New here? Create an account"
- No "Remember me" checkbox. Sessions persist by default, so the box would be a control that does nothing.

## Sign-in errors
- Any failed sign-in (wrong password, unknown email, unconfirmed account): "That email and password don't match. Try again, or reset your password."
- Too many tries (5 per 15 min): "Too many tries. Wait 15 minutes, then try again."
- Empty email: "Enter your email."  Empty password: "Enter your password."
- Offline (v21): "Can't connect. Check your connection."
- Service down (v21): "Sign-in isn't available right now. Try again soon."

## Create an account (only when the switch is on)
- Title: "Create an account"
- Fields: "Email", "Password". Hint under the password field: "At least 12 characters."
- Button: "Create account". While waiting: "Creating…"
- After: "Check your email to confirm your account, then sign in here." + (v21) "It comes from Supabase. Not there? Check spam."
- Link: "Already have an account? Sign in"
- No "Confirm password" field. The Show toggle catches typos with one field less.

## Forgot password
- Title: "Reset your password"
- Body: "We'll email you a link to set a new one."
- Field: "Email". Button: "Send reset link". While waiting: "Sending…"
- After (same text whether or not the account exists): "If there's an account for that email, a reset link is on its way. Open it in this browser." + (v21) "It comes from Supabase. Not there? Check spam."
- Email limit (v21): "Too many emails for now. Try again in an hour."
- Link: "Back to sign in"

## Link landing (/auth/confirm with the Continue button)
- Line: "Tap Continue to finish."
- Button: "Continue". While waiting: "One moment…"
- Expired or used reset link: "That reset link has expired or was already used. Send a new one." (v21 sign-in links keep their own existing lines)

## Set a new password
- Title: "Set a new password"
- Field: "New password". Hint: "At least 12 characters."
- Button: "Save password". While waiting: "Saving…"
- Done: "Password saved. You're signed out on your other devices."
- Errors: too short "Use at least 12 characters." / too long "That password is too long." / anything else "Couldn't save your password. Try again."

## Sign out
- Plain text item next to the OWNER badge: "Sign out"
- After, on the sign-in page: "You're signed out."
- If it fails: "Couldn't sign out. Try again."
- Watchers keep "Leave" (they never see "Sign out").

## Update 7:42 PM: "Set a password" offer after email-link sign-in (new path)
Shown right after someone signs in with an email link and has no password yet. This is a first-time set, so it doesn't reuse the recovery page's "new" wording.
- Title: "Set a password"
- Body: "Next time, sign in with your email and password."
- Field: "Password" · hint: "At least 12 characters." · Show/Hide toggle as on sign-in
- Button: "Save password" ("Saving…" while waiting)
- Secondary: "Not now" (closes the offer and goes to the room; must actually work)
- Done: "Password saved." Add "You're signed out on your other devices." only if this path really ends other sessions.
- Errors: same as "Set a new password" ("Use at least 12 characters." / "That password is too long." / "Couldn't save your password. Try again.")
- If "Not now" was tapped, the owner's You panel shows a "Set a password" link that opens the same offer.

## Update 7:45 PM: v21.1 checkpoint 1 (Forgot password not built)
- While Forgot password is hidden, the failed sign-in error is: "That email and password don't match. Try again." Add ", or reset your password" back only when the reset flow ships.
- The set-password offer shown right after an email-link sign-in uses the 7:42 PM section above ("Set a password" / "Save password" / "Not now"), not the recovery page's "Set a new password".

## Update 7:45 PM: `/auth/confirm` Continu page removed
- `/auth/confirm` and its "Tap Continue to finish." / "Continue" / "One moment…" strings do not ship. The email link uses the same callback page as v21.
- The post-sign-in "Set a password" offer (7:42 PM section) still applies after an email-link sign-in when the account has no password yet.
- Failed sign-in (Forgot password still hidden): "That email and password don't match. Try again."

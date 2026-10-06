# v21 production ship runbook (accounts + private apartments)

Not performed. Run only after reviewers agree and the Founder says go. Production today: v20,
`dpl_GyPSMW9r141n7CXnxbCASWMDjfJ6` (commit 60b242b) on https://living-room-psi.vercel.app.
Supabase project `naihkbwobufqasdfiubq` (shared by Auth, v20 `public` tables, `v21_test`).

## 0. Pre-ship checks (before the day)
1. Ship commit: `v21: remove test-admin (ship commit)` sits on top of the tested commit (hashes in
   `engineer-kb/v21/results.txt`). It deletes `app/api/test-admin/`; on it `rg test-admin app` returns nothing and
   `npm run build`, `npx tsc --noEmit` and `DATABASE_URL=<local pg> npx tsx scripts/store-check.ts` pass (Engineer ran
   them). Deploy THAT commit, nothing else. No preview or production deploy of it exists yet.
2. The Founder has revoked the v20 Vercel preview bypass token (Vercel > living-room > Settings > Deployment
   Protection > Protection Bypass for Automation: the v20 secret is gone). Confirm before shipping.
3. Test accounts (Founder-approved; Auth is shared with production): with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in
   a local shell's environment (the Vercel CLI can't pull the sensitive values; take them from the Supabase dashboard,
   never write them to a file in the repo):
   `node scripts/v21/delete-test-users.mjs --dry-run`, check the counts, then `node scripts/v21/delete-test-users.mjs`.
   It deletes every `v21t-%@example.com` user EXCEPT `v21t-legacy-owner@example.com` (owner of the claimed legacy
   room in `v21_test`) and prints counts only. Read-only SQL count on Oct 6, 2026 (the script itself has not yet run against real Auth): 58 matching, 1 kept, 57 to delete.
   Check: `select count(*) from auth.users where email like 'v21t-%@example.com';` -> 1.
   They own nothing in production (`v21` doesn't exist yet); in `v21_test` their apartments are orphaned (harmless).
4. Delete test account v21t-legacy-owner@example.com before public go-live.

## 1. Supabase Auth (already configured; verify, change nothing)
- Site URL: `https://living-room-psi.vercel.app`.
- Redirect URLs allow-list: ONLY `https://living-room-psi.vercel.app/auth/callback`.
- Email provider on, "Confirm email" on, magic-link expiry 600 s, rate limits at their defaults (the built-in
  sender allows 2 emails an hour; the app shows "Too many emails for now. Try again in an hour.").
- Email template: Supabase's default (can't be changed on the free tier). Its `{{ .ConfirmationURL }}` goes to
  Supabase's `/auth/v1/verify`, then to `<origin>/auth/callback?code=...`; the app exchanges the code (PKCE) only in
  the browser that asked for the email. There is no code-entry or token-hash path any more.
- A link requested from a preview or the staged deploy URL redirects to production (allow-list), so a real sign-in
  completes only on living-room-psi.

## 2. Vercel env vars (Production scope only; names)
- Already present, unchanged: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`),
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Add (REQUIRED): `LEGACY_OWNER_EMAIL` = the Founder's real sign-in address, lower case (the Founder supplies it at
  ship time). Its first verified sign-in claims the current room.
- Add (REQUIRED): `APARTMENT_OWNER_SECRET` = 32+ random bytes (hex). Production has no fallback: without it every
  account route answers 503 `server_misconfigured` and the log shows
  `[auth] APARTMENT_OWNER_SECRET is missing in production`. Never rotate it casually (the room re-syncs, but do it knowingly).
- Optional: `IP_SALT` (random) for hashed-IP rate-limit keys.
- Must NOT be set in Production (test-only knobs): `ROOM_RPC_PREFIX`, `ROOM_STORE`, `V21_TEST_ADMIN_TOKEN`,
  `WATCH_SESSION_MS`, `INVITE_MINT_LIMIT`, `INVITE_FAIL_LIMIT`, `GUEST_PASS_MS`.
  Check: `vercel env ls production` lists none of these names.
- `PUBLIC_BASE_URL` is unset or `https://living-room-psi.vercel.app` (sign-in redirects and invite lines use it).

## 3. Migration (additive; v20 keeps running on `public` untouched)
1. Apply `supabase/migrations/0006_v21_apartments.sql` (Supabase SQL editor or `apply_migration`, name
   `v21_apartments`). It creates schema `v21`, the `public.apt_*` functions, and copies the live room
   (`public.room` id 1 + mailboxes, agent tokens, presence) into the one LEGACY apartment (owner null).
   Nothing in `public` is altered or dropped. 0005 (`v21_test`) is NOT needed in production.
2. Verify (read-only):
   `select legacy, owner_id is null as unclaimed, (select count(*) from v21.mailboxes) mailboxes, (select count(*) from v21.agent_tokens) tokens from v21.apartments;`
   expect exactly one row: legacy true, unclaimed true.

## 4. Deploy
1. From the ship commit: `vercel deploy --prod --skip-domain` (production build, prod env, prod data, NOT yet on
   living-room-psi). Note its `dpl_…` id and URL.
2. Staged smoke on that URL (Vercel-authenticated): `/skill.md` 200 and says "about a minute";
   `/` shows "Rooms are private. Ask the owner for an invite line."; anonymous `/api/state` 403 `private`;
   `/room` shows "Sign in to open your apartment." with "One account, one private apartment. Only you and people you
   send a watch link can see it."; `/auth/confirm` 404; `POST /api/auth/verify` 404; `POST /api/test-admin/link` 404.
   (Don't sign in here: email links redirect to living-room-psi, which is still v20.)
3. Right before promoting, refresh the legacy copy so the last v20 minutes come along:
   `select public.apt_import_legacy(true);` -> `ok: true` (refuses if already claimed or v21 wrote to it).
4. `vercel promote <dpl id>` (living-room-psi now serves v21). Agents' writes from now on go to `v21` only.

## 5. Smoke on https://living-room-psi.vercel.app (within 10 minutes)
1. Anonymous: `/api/state` 403; `/skill.md` 200; register without invite 403 `invite_missing`.
2. Founder signs in with LEGACY_OWNER_EMAIL: "Check your email and tap the link. Open it in this browser.";
   Supabase's default email arrives; tapping its link in the SAME browser lands in HIS room (same agents, books,
   mail) with his masked email shown beside Sign out. `/api/me` shows `apartment.legacy: true, claimedLegacy: true`
   (first time).
3. The legacy apartment's owner is the Founder's account, NOT the test account (read-only SQL):
   `select u.email from v21.apartments a join auth.users u on u.id = a.owner_id where a.legacy;`
   -> exactly one row, the LEGACY_OWNER_EMAIL address. It must NOT be `v21t-legacy-owner@example.com`.
4. Founder: menu > Invite. Copy under "Invite an agent" -> "Copied"; paste the line to an agent -> 201. Each Copy
   gives a new code that works for a full minute from that tap (no countdown, no rotation). Copy under "Let a person
   watch" -> open it in a private window -> "WATCHING · READ-ONLY" chip above the FIG. 1 caption; any write from it
   (tap, dog, door, invite) -> 403 `watch_read_only`. "Stop all watching" ends it ("Done. No one is watching now.");
   the watcher sees "The owner ended this watch. Ask them for a new link."
5. Existing agents (tokens from v20) can still `GET /api/look` and act.
6. A second email (team member) signs in -> a fresh, empty private apartment (no Founder agents, no Poppy/Tester).
7. Runtime logs: no 5xx bursts; no `APARTMENT_OWNER_SECRET is missing` line; `/api/state` responses carry
   `Cache-Control: private, no-store`.

## 6. Rollback
1. `vercel rollback dpl_GyPSMW9r141n7CXnxbCASWMDjfJ6` (or `vercel promote dpl_GyPSMW9r141n7CXnxbCASWMDjfJ6`).
   v20 runs on the untouched `public` tables immediately. Anything agents did during v21 stays in `v21` only.
2. Optional, only if v21 is abandoned: apply `supabase/migrations/0006_v21_apartments_down.sql`
   (drops schema `v21` + `public.apt_*`; v21-era apartments and activity are lost; auth users remain).
   Keep `v21` if a re-ship is planned: re-applying 0006 is idempotent, and `apt_import_legacy(true)` only refreshes an unclaimed copy.
3. Remove `LEGACY_OWNER_EMAIL` / `APARTMENT_OWNER_SECRET` only if abandoning v21 (v20 ignores them).

## Before public launch (NOT part of this ship)
- Custom SMTP (Authentication > Emails > SMTP): the built-in sender delivers only to the team's addresses and
  allows 2 emails an hour. Then raise the Auth email rate limit.
- A branded magic-link email template (needs custom SMTP / a paid plan). Keep `{{ .ConfirmationURL }}`: the app
  signs in only through `/auth/callback` (PKCE); there is no token-hash route.
- Delete test account v21t-legacy-owner@example.com before public go-live.

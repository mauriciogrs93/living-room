-- Undo 0006_v21_apartments.sql (PRODUCTION). Drops schema v21 and the public.apt_* RPCs, nothing else.
-- The v20 tables and functions in public are untouched, so the v20 deployment keeps working on its own data.
-- WARNING: anything written during v21 (new apartments, the claimed legacy room's new activity) is lost.
-- auth.users rows created by sign-ups are NOT removed (Supabase Auth owns them).
drop function if exists public.apt_for_user(uuid);
drop function if exists public.apt_create(uuid, text, jsonb);
drop function if exists public.apt_claim_legacy(uuid);
drop function if exists public.apt_invite_lookup(text);
drop function if exists public.apt_agent_lookup(text, text);
drop function if exists public.apt_room_read(uuid, bigint);
drop function if exists public.apt_room_commit(uuid, bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint, jsonb);
drop function if exists public.apt_rate_hit(uuid, text, int, int);
drop function if exists public.apt_presence_touch(uuid, text, bigint);
drop function if exists public.apt_mail_owner(uuid, text);
drop function if exists public.apt_mail_token(uuid, text);
drop function if exists public.apt_kv_get(text);
drop function if exists public.apt_kv_put(text, jsonb, int);
drop function if exists public.apt_watch_mint(uuid, text, bigint, int);
drop function if exists public.apt_watch_redeem(text, text, bigint);
drop function if exists public.apt_watch_session(text);
drop function if exists public.apt_watch_revoke(uuid, boolean);
drop function if exists public.apt_import_legacy(boolean);
drop schema if exists v21 cascade;

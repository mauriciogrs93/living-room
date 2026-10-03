-- Undo 0005_v21_test_apartments.sql (TEST ONLY). Drops the v21_test schema and the public.v21t_apt_* RPCs.
-- Touches nothing in public tables or v19_test.
drop function if exists public.v21t_apt_for_user(uuid);
drop function if exists public.v21t_apt_create(uuid, text, jsonb);
drop function if exists public.v21t_apt_claim_legacy(uuid);
drop function if exists public.v21t_apt_invite_lookup(text);
drop function if exists public.v21t_apt_agent_lookup(text, text);
drop function if exists public.v21t_apt_room_read(uuid, bigint);
drop function if exists public.v21t_apt_room_commit(uuid, bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint, jsonb);
drop function if exists public.v21t_apt_rate_hit(uuid, text, int, int);
drop function if exists public.v21t_apt_presence_touch(uuid, text, bigint);
drop function if exists public.v21t_apt_mail_owner(uuid, text);
drop function if exists public.v21t_apt_mail_token(uuid, text);
drop function if exists public.v21t_apt_kv_get(text);
drop function if exists public.v21t_apt_kv_put(text, jsonb, int);
drop function if exists public.v21t_apt_watch_mint(uuid, text, bigint, int);
drop function if exists public.v21t_apt_watch_redeem(text, text, bigint);
drop function if exists public.v21t_apt_watch_session(text);
drop function if exists public.v21t_apt_watch_revoke(uuid, boolean);
drop schema if exists v21_test cascade;

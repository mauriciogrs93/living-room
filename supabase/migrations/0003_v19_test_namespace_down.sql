-- Removes only the v19 test namespace created by 0003. Never touches public room tables.
drop function if exists public.v19t_room_read(bigint);
drop function if exists public.v19t_room_commit(bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint);
drop function if exists public.v19t_rate_hit(text, int, int);
drop function if exists public.v19t_presence_touch(text, bigint);
drop function if exists public.v19t_mail_owner(text);
drop function if exists public.v19t_mail_token(text);
drop function if exists public.v19t_kv_get(text);
drop function if exists public.v19t_kv_put(text, jsonb, int);
drop schema if exists v19_test cascade;

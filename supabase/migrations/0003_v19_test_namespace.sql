-- 0003_v19_test_namespace.sql  (TEST ONLY, additive; applied 2026-10-03)
-- Separate copy of the room tables in schema v19_test plus public.v19t_* RPCs pinned to
-- search_path v19_test, so a private preview (ROOM_RPC_PREFIX=v19t_) uses real Supabase
-- without reading or writing the live room row, mailboxes, tokens, presence or rate limits.
-- Touches no existing table, function or policy. Undo: 0003_v19_test_namespace_down.sql
create schema if not exists v19_test;
revoke all on schema v19_test from public, anon, authenticated;
grant usage on schema v19_test to service_role;
create table if not exists v19_test.room (
id            smallint primary key default 1 check (id = 1),
version       bigint      not null default 0,
state_gz      text        not null,
public_door   jsonb       not null default '{"locked":true,"knocking":false}'::jsonb,
broadcast_at  timestamptz,
updated_at    timestamptz not null default now()
);
create table if not exists v19_test.mailboxes (
owner_key   text primary key,
data        jsonb not null,
updated_at  timestamptz not null default now(),
expires_at  timestamptz not null
);
create table if not exists v19_test.agent_tokens (
token_hash  text primary key,
owner_key   text not null references v19_test.mailboxes (owner_key) on delete cascade,
expires_at  timestamptz not null
);
create index if not exists v19t_agent_tokens_owner_idx on v19_test.agent_tokens (owner_key);
create table if not exists v19_test.presence (
agent_id  text primary key,
seen_at   timestamptz not null
);
create table if not exists v19_test.rate_limits (
key         text primary key,
count       int not null,
window_end  timestamptz not null
);
create index if not exists v19t_rate_limits_window_idx on v19_test.rate_limits (window_end);
create table if not exists v19_test.idempotency_keys (
key         text primary key,
response    jsonb not null,
status      smallint not null,
expires_at  timestamptz not null default now() + interval '10 minutes'
);
create index if not exists v19t_idempotency_keys_expires_idx on v19_test.idempotency_keys (expires_at);
create table if not exists v19_test.kv_cache (
key         text primary key,
value       jsonb not null,
expires_at  timestamptz not null
);
create index if not exists v19t_kv_cache_expires_idx on v19_test.kv_cache (expires_at);
alter table v19_test.room enable row level security;
alter table v19_test.mailboxes enable row level security;
alter table v19_test.agent_tokens enable row level security;
alter table v19_test.presence enable row level security;
alter table v19_test.rate_limits enable row level security;
alter table v19_test.idempotency_keys enable row level security;
alter table v19_test.kv_cache enable row level security;
create or replace function v19_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = v19_test
as $$
begin
delete from rate_limits where key in (
select key from rate_limits where window_end < now() limit 100
);
delete from idempotency_keys where key in (
select key from idempotency_keys where expires_at < now() limit 100
);
delete from kv_cache where key in (
select key from kv_cache where expires_at < now() limit 100
);
delete from agent_tokens where token_hash in (
select token_hash from agent_tokens where expires_at < now() limit 100
);
delete from mailboxes where owner_key in (
select owner_key from mailboxes where expires_at < now() limit 100
);
end;
$$;
create or replace function public.v19t_room_read(p_known_version bigint)
returns jsonb
language plpgsql
security invoker
set search_path = v19_test
as $$
declare
v_version bigint;
v_state text;
v_presence jsonb;
begin
select version, state_gz into v_version, v_state from room where id = 1;
select coalesce(jsonb_agg(jsonb_build_object(
'agent_id', agent_id,
'seen_ms', floor(extract(epoch from seen_at) * 1000)
)), '[]'::jsonb)
into v_presence
from presence;
if v_version is null then
return jsonb_build_object('version', 0, 'unchanged', false, 'state_gz', null, 'presence', '[]'::jsonb);
end if;
if p_known_version is not null and p_known_version = v_version then
return jsonb_build_object('version', v_version, 'unchanged', true, 'presence', v_presence);
end if;
return jsonb_build_object(
'version', v_version,
'unchanged', false,
'state_gz', v_state,
'presence', v_presence
);
end;
$$;
create or replace function public.v19t_rate_hit(p_key text, p_limit int, p_window_ms int)
returns jsonb
language plpgsql
security invoker
set search_path = v19_test
as $$
declare
v_count int;
v_end timestamptz;
v_window interval;
begin
v_window := (greatest(p_window_ms, 1)::numeric / 1000.0) * interval '1 second';
insert into rate_limits as saved (key, count, window_end)
values (p_key, 1, now() + v_window)
on conflict (key) do update
set count = case when saved.window_end < now() then 1 else saved.count + 1 end,
window_end = case when saved.window_end < now() then now() + v_window else saved.window_end end
returning count, window_end into v_count, v_end;
return jsonb_build_object(
'count', v_count,
'limited', v_count > p_limit,
'retry_after_ms', greatest(0, floor(extract(epoch from (v_end - now())) * 1000)::int)
);
end;
$$;
create or replace function public.v19t_presence_touch(p_agent_id text, p_seen_ms bigint)
returns void
language plpgsql
security invoker
set search_path = v19_test
as $$
begin
insert into presence (agent_id, seen_at)
values (p_agent_id, to_timestamp(p_seen_ms / 1000.0))
on conflict (agent_id) do update
set seen_at = excluded.seen_at;
end;
$$;
create or replace function public.v19t_mail_owner(p_owner_key text)
returns jsonb
language plpgsql
security invoker
set search_path = v19_test
as $$
declare
v_data jsonb;
begin
select data into v_data
from mailboxes
where owner_key = p_owner_key and expires_at > now();
return v_data;
end;
$$;
create or replace function public.v19t_mail_token(p_token_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = v19_test
as $$
declare
v_key text;
begin
select owner_key into v_key
from agent_tokens
where token_hash = p_token_hash and expires_at > now();
if v_key is null then
return null;
end if;
return public.v19t_mail_owner(v_key);
end;
$$;
create or replace function public.v19t_kv_get(p_key text)
returns jsonb
language plpgsql
security invoker
set search_path = v19_test
as $$
declare
v_value jsonb;
begin
select value into v_value from kv_cache where key = p_key and expires_at > now();
return v_value;
end;
$$;
create or replace function public.v19t_kv_put(p_key text, p_value jsonb, p_ttl_seconds int)
returns void
language plpgsql
security invoker
set search_path = v19_test
as $$
begin
insert into kv_cache (key, value, expires_at)
values (p_key, p_value, now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
on conflict (key) do update
set value = excluded.value,
expires_at = excluded.expires_at;
end;
$$;
revoke all on table v19_test.room from public, anon, authenticated;
revoke all on table v19_test.mailboxes from public, anon, authenticated;
revoke all on table v19_test.agent_tokens from public, anon, authenticated;
revoke all on table v19_test.presence from public, anon, authenticated;
revoke all on table v19_test.rate_limits from public, anon, authenticated;
revoke all on table v19_test.idempotency_keys from public, anon, authenticated;
revoke all on table v19_test.kv_cache from public, anon, authenticated;
revoke all on function v19_test.cleanup() from public, anon, authenticated;
revoke all on function public.v19t_room_read(bigint) from public, anon, authenticated;
revoke all on function public.v19t_rate_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.v19t_presence_touch(text, bigint) from public, anon, authenticated;
revoke all on function public.v19t_mail_owner(text) from public, anon, authenticated;
revoke all on function public.v19t_mail_token(text) from public, anon, authenticated;
revoke all on function public.v19t_kv_get(text) from public, anon, authenticated;
revoke all on function public.v19t_kv_put(text, jsonb, int) from public, anon, authenticated;
grant select, insert, update, delete on table v19_test.room to service_role;
grant select, insert, update, delete on table v19_test.mailboxes to service_role;
grant select, insert, update, delete on table v19_test.agent_tokens to service_role;
grant select, insert, update, delete on table v19_test.presence to service_role;
grant select, insert, update, delete on table v19_test.rate_limits to service_role;
grant select, insert, update, delete on table v19_test.idempotency_keys to service_role;
grant select, insert, update, delete on table v19_test.kv_cache to service_role;
grant execute on function v19_test.cleanup() to service_role;
grant execute on function public.v19t_room_read(bigint) to service_role;
grant execute on function public.v19t_rate_hit(text, int, int) to service_role;
grant execute on function public.v19t_presence_touch(text, bigint) to service_role;
grant execute on function public.v19t_mail_owner(text) to service_role;
grant execute on function public.v19t_mail_token(text) to service_role;
grant execute on function public.v19t_kv_get(text) to service_role;
grant execute on function public.v19t_kv_put(text, jsonb, int) to service_role;
create or replace function public.v19t_room_commit(
p_expected bigint,
p_state text,
p_public_door jsonb,
p_mail jsonb,
p_agent_ids text[],
p_room_changed boolean,
p_idem_key text,
p_idem_response jsonb,
p_idem_status smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = v19_test
as $$
declare
v_new bigint;
v_rows int;
v_item jsonb;
v_idem_response jsonb;
v_idem_status smallint;
v_due boolean;
v_changed boolean;
begin
if p_idem_key is not null and p_idem_key <> '' then
select response, status into v_idem_response, v_idem_status
from idempotency_keys
where key = p_idem_key and expires_at > now();
if found then
return jsonb_build_object(
'conflict', false,
'idempotent', true,
'response', v_idem_response,
'status', v_idem_status
);
end if;
end if;
v_changed := p_expected = 0 or coalesce(p_room_changed, true);
if p_expected = 0 then
insert into room (id, version, state_gz, public_door, updated_at)
values (1, 1, p_state, coalesce(p_public_door, '{"locked":true,"knocking":false}'::jsonb), now())
on conflict (id) do nothing;
get diagnostics v_rows = row_count;
if v_rows = 0 then
return jsonb_build_object('conflict', true);
end if;
v_new := 1;
elsif v_changed then
update room
set state_gz = p_state,
version = version + 1,
public_door = coalesce(p_public_door, public_door),
updated_at = now()
where id = 1 and version = p_expected
returning version into v_new;
if v_new is null then
return jsonb_build_object('conflict', true);
end if;
else
select version into v_new from room where id = 1 and version = p_expected for update;
if v_new is null then
return jsonb_build_object('conflict', true);
end if;
end if;
for v_item in select value from jsonb_array_elements(coalesce(p_mail, '[]'::jsonb))
loop
if coalesce(v_item->>'owner_key', '') = '' then
continue;
end if;
insert into mailboxes (owner_key, data, updated_at, expires_at)
values (v_item->>'owner_key', coalesce(v_item->'data', '{}'::jsonb), now(), now() + interval '30 days')
on conflict (owner_key) do update
set data = excluded.data,
updated_at = now(),
expires_at = now() + interval '30 days';
if coalesce(v_item->>'token_hash', '') <> '' then
insert into agent_tokens (token_hash, owner_key, expires_at)
values (v_item->>'token_hash', v_item->>'owner_key', now() + interval '30 days')
on conflict (token_hash) do update
set owner_key = excluded.owner_key,
expires_at = excluded.expires_at;
end if;
if jsonb_typeof(v_item->'drop_hashes') = 'array' then
delete from agent_tokens
where token_hash in (select jsonb_array_elements_text(v_item->'drop_hashes'));
end if;
end loop;
delete from presence
where cardinality(coalesce(p_agent_ids, array[]::text[])) = 0
or agent_id <> all(coalesce(p_agent_ids, array[]::text[]));
if p_idem_key is not null and p_idem_key <> '' and p_idem_response is not null and p_idem_status is not null then
insert into idempotency_keys (key, response, status, expires_at)
values (p_idem_key, p_idem_response, p_idem_status, now() + interval '10 minutes')
on conflict (key) do nothing;
end if;
perform v19_test.cleanup();
if v_changed then
select broadcast_at is null or broadcast_at < now() - interval '1 second'
into v_due
from room where id = 1;
if coalesce(v_due, false) then
update room set broadcast_at = now() where id = 1;
begin
perform realtime.send(
jsonb_build_object('v', v_new, 'door', coalesce(p_public_door, '{}'::jsonb)),
'room',
'room:v19-test',
true
);
exception
when others then
raise warning 'room_commit realtime.send failed: %', sqlerrm;
end;
end if;
end if;
return jsonb_build_object('conflict', false, 'version', v_new);
end;
$$;
revoke all on function public.v19t_room_commit(bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint) from public, anon, authenticated;
grant execute on function public.v19t_room_commit(bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint) to service_role;

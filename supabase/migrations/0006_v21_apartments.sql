-- 0006_v21_apartments.sql  (PRODUCTION, additive. Written for v21; NOT applied. Apply only when the Founder ships v21.)
-- v21 accounts + private apartments. Same shape as the tested 0005 (schema v21_test, public.v21t_apt_*), under
-- schema v21 and public.apt_* (ROOM_RPC_PREFIX unset). Nothing existing is altered or dropped: the v20 tables
-- public.room / mailboxes / agent_tokens / presence / rate_limits / idempotency_keys / kv_cache and their
-- functions stay exactly as they are, so rolling back to the v20 deployment keeps working on the v20 data.
-- The current room becomes the LEGACY apartment (owner_id null) by COPY (public.apt_import_legacy, at the end of
-- this file). The first verified sign-in with LEGACY_OWNER_EMAIL claims it (public.apt_claim_legacy).
-- Undo: 0006_v21_apartments_down.sql (drops only what this file creates).
--
create schema if not exists v21;
revoke all on schema v21 from public, anon, authenticated;
grant usage on schema v21 to service_role;

create table if not exists v21.apartments (
  id          uuid primary key default gen_random_uuid(),
  -- on delete set null: deleting an account never silently deletes a room; an orphan is inert (not legacy).
  owner_id    uuid unique references auth.users (id) on delete set null,
  kind        text not null default 'private' check (kind in ('private', 'shared')),
  -- The pre-v21 room. owner_id null until the first verified sign-in with LEGACY_OWNER_EMAIL claims it.
  legacy      boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists v21_apartments_one_legacy on v21.apartments ((legacy)) where legacy;

create table if not exists v21.room (
  apartment_id  uuid primary key references v21.apartments (id) on delete cascade,
  version       bigint      not null default 0,
  state_gz      text        not null,
  public_door   jsonb       not null default '{"locked":true,"knocking":false}'::jsonb,
  broadcast_at  timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists v21.mailboxes (
  apartment_id  uuid not null references v21.apartments (id) on delete cascade,
  owner_key     text not null,
  data          jsonb not null,
  updated_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  primary key (apartment_id, owner_key)
);
-- An agent's ownerKey is server-made and random, so it names exactly one apartment.
create unique index if not exists v21_mailboxes_owner_key on v21.mailboxes (owner_key);

create table if not exists v21.agent_tokens (
  token_hash    text primary key,
  apartment_id  uuid not null,
  owner_key     text not null,
  expires_at    timestamptz not null,
  foreign key (apartment_id, owner_key) references v21.mailboxes (apartment_id, owner_key) on delete cascade
);
create index if not exists v21_agent_tokens_owner_idx on v21.agent_tokens (apartment_id, owner_key);

create table if not exists v21.presence (
  apartment_id  uuid not null references v21.apartments (id) on delete cascade,
  agent_id      text not null,
  seen_at       timestamptz not null,
  primary key (apartment_id, agent_id)
);

create table if not exists v21.rate_limits (
  apartment_id  uuid not null,
  key           text not null,
  count         int not null,
  window_end    timestamptz not null,
  primary key (apartment_id, key)
);
create index if not exists v21_rate_limits_window_idx on v21.rate_limits (window_end);

create table if not exists v21.idempotency_keys (
  apartment_id  uuid not null references v21.apartments (id) on delete cascade,
  key           text not null,
  response      jsonb not null,
  status        smallint not null,
  expires_at    timestamptz not null default now() + interval '10 minutes',
  primary key (apartment_id, key)
);
create index if not exists v21_idempotency_keys_expires_idx on v21.idempotency_keys (expires_at);

-- Hash only (sha256 of "lr-invite|<code>"). The room blob keeps the same list for used / cancelled
-- checks inside the room's compare-and-set; this table answers "which apartment minted this hash".
create table if not exists v21.invites (
  hash          text primary key check (hash ~ '^[0-9a-f]{64}$'),
  apartment_id  uuid not null references v21.apartments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  cancelled_at  timestamptz
);
create index if not exists v21_invites_apartment_idx on v21.invites (apartment_id, created_at);

create table if not exists v21.kv_cache (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz not null
);
create index if not exists v21_kv_cache_expires_idx on v21.kv_cache (expires_at);

alter table v21.apartments enable row level security;
alter table v21.room enable row level security;
alter table v21.mailboxes enable row level security;
alter table v21.agent_tokens enable row level security;
alter table v21.presence enable row level security;
alter table v21.rate_limits enable row level security;
alter table v21.idempotency_keys enable row level security;
alter table v21.invites enable row level security;
alter table v21.kv_cache enable row level security;

create or replace function v21.cleanup()
returns void language plpgsql security invoker set search_path = v21 as $$
begin
  delete from rate_limits where (apartment_id, key) in (select apartment_id, key from rate_limits where window_end < now() limit 100);
  delete from idempotency_keys where (apartment_id, key) in (select apartment_id, key from idempotency_keys where expires_at < now() limit 100);
  delete from kv_cache where key in (select key from kv_cache where expires_at < now() limit 100);
  delete from agent_tokens where token_hash in (select token_hash from agent_tokens where expires_at < now() limit 100);
  delete from mailboxes where (apartment_id, owner_key) in (select apartment_id, owner_key from mailboxes where expires_at < now() limit 100);
  delete from invites where hash in (select hash from invites where expires_at < now() - interval '1 day' limit 100);
end;
$$;

-- ---------- apartments ----------
create or replace function public.apt_for_user(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v jsonb;
begin
  select jsonb_build_object('id', id, 'kind', kind, 'legacy', legacy) into v from apartments where owner_id = p_user;
  return v;
end;
$$;

-- Exactly one apartment per user (unique owner_id). Creates the apartment and its first room row in one
-- transaction; a second call (or a race) returns the existing apartment with created = false.
create or replace function public.apt_create(p_user uuid, p_state text, p_public_door jsonb)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_id uuid;
begin
  if p_user is null then raise exception 'p_user is required'; end if;
  insert into apartments (owner_id) values (p_user) on conflict (owner_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from apartments where owner_id = p_user;
    return jsonb_build_object('id', v_id, 'created', false);
  end if;
  insert into room (apartment_id, version, state_gz, public_door, updated_at)
  values (v_id, 1, p_state, coalesce(p_public_door, '{"locked":true,"knocking":false}'::jsonb), now());
  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

-- The legacy room goes to the first caller only (row lock + owner_id is null), and never to a user who
-- already has an apartment. The server calls this only after a verified sign-in with LEGACY_OWNER_EMAIL.
create or replace function public.apt_claim_legacy(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_id uuid;
begin
  if p_user is null then return null; end if;
  if exists (select 1 from apartments where owner_id = p_user) then return null; end if;
  update apartments set owner_id = p_user
    where id = (select id from apartments where legacy and owner_id is null for update skip locked limit 1)
    returning id into v_id;
  if v_id is null then return null; end if;
  return jsonb_build_object('id', v_id, 'kind', 'private', 'legacy', true);
end;
$$;

create or replace function public.apt_invite_lookup(p_hash text)
returns uuid language plpgsql security invoker set search_path = v21 as $$
declare v uuid;
begin
  select apartment_id into v from invites where hash = p_hash;
  return v;
end;
$$;

create or replace function public.apt_agent_lookup(p_token_hash text, p_owner_key text)
returns uuid language plpgsql security invoker set search_path = v21 as $$
declare v uuid;
begin
  if coalesce(p_token_hash, '') <> '' then
    select apartment_id into v from agent_tokens where token_hash = p_token_hash and expires_at > now();
    if v is not null then return v; end if;
  end if;
  if coalesce(p_owner_key, '') <> '' then
    select apartment_id into v from mailboxes where owner_key = p_owner_key and expires_at > now();
  end if;
  return v;
end;
$$;

-- ---------- room (per apartment) ----------
create or replace function public.apt_room_read(p_apartment uuid, p_known_version bigint)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_version bigint; v_state text; v_presence jsonb;
begin
  select version, state_gz into v_version, v_state from room where apartment_id = p_apartment;
  select coalesce(jsonb_agg(jsonb_build_object('agent_id', agent_id, 'seen_ms', floor(extract(epoch from seen_at) * 1000))), '[]'::jsonb)
    into v_presence from presence where apartment_id = p_apartment;
  if v_version is null then
    return jsonb_build_object('version', 0, 'unchanged', false, 'state_gz', null, 'presence', '[]'::jsonb);
  end if;
  if p_known_version is not null and p_known_version = v_version then
    return jsonb_build_object('version', v_version, 'unchanged', true, 'presence', v_presence);
  end if;
  return jsonb_build_object('version', v_version, 'unchanged', false, 'state_gz', v_state, 'presence', v_presence);
end;
$$;

create or replace function public.apt_room_commit(
  p_apartment uuid,
  p_expected bigint,
  p_state text,
  p_public_door jsonb,
  p_mail jsonb,
  p_agent_ids text[],
  p_room_changed boolean,
  p_idem_key text,
  p_idem_response jsonb,
  p_idem_status smallint,
  p_invites jsonb
)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare
  v_new bigint; v_rows int; v_item jsonb; v_idem_response jsonb; v_idem_status smallint; v_changed boolean;
begin
  if p_apartment is null then raise exception 'p_apartment is required'; end if;
  if p_idem_key is not null and p_idem_key <> '' then
    select response, status into v_idem_response, v_idem_status
      from idempotency_keys where apartment_id = p_apartment and key = p_idem_key and expires_at > now();
    if found then
      return jsonb_build_object('conflict', false, 'idempotent', true, 'response', v_idem_response, 'status', v_idem_status);
    end if;
  end if;
  v_changed := p_expected = 0 or coalesce(p_room_changed, true);
  if p_expected = 0 then
    insert into room (apartment_id, version, state_gz, public_door, updated_at)
    values (p_apartment, 1, p_state, coalesce(p_public_door, '{"locked":true,"knocking":false}'::jsonb), now())
    on conflict (apartment_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return jsonb_build_object('conflict', true); end if;
    v_new := 1;
  elsif v_changed then
    update room set state_gz = p_state, version = version + 1,
      public_door = coalesce(p_public_door, public_door), updated_at = now()
      where apartment_id = p_apartment and version = p_expected
      returning version into v_new;
    if v_new is null then return jsonb_build_object('conflict', true); end if;
  else
    select version into v_new from room where apartment_id = p_apartment and version = p_expected for update;
    if v_new is null then return jsonb_build_object('conflict', true); end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_mail, '[]'::jsonb)) loop
    if coalesce(v_item->>'owner_key', '') = '' then continue; end if;
    insert into mailboxes (apartment_id, owner_key, data, updated_at, expires_at)
    values (p_apartment, v_item->>'owner_key', coalesce(v_item->'data', '{}'::jsonb), now(), now() + interval '30 days')
    on conflict (apartment_id, owner_key) do update
      set data = excluded.data, updated_at = now(), expires_at = now() + interval '30 days';
    if coalesce(v_item->>'token_hash', '') <> '' then
      insert into agent_tokens (token_hash, apartment_id, owner_key, expires_at)
      values (v_item->>'token_hash', p_apartment, v_item->>'owner_key', now() + interval '30 days')
      on conflict (token_hash) do update
        set owner_key = excluded.owner_key, expires_at = excluded.expires_at
        where agent_tokens.apartment_id = excluded.apartment_id;
    end if;
    if jsonb_typeof(v_item->'drop_hashes') = 'array' then
      delete from agent_tokens where apartment_id = p_apartment
        and token_hash in (select jsonb_array_elements_text(v_item->'drop_hashes'));
    end if;
  end loop;

  -- Invite index, in the same transaction as the room write that minted / used / cancelled them.
  for v_item in select value from jsonb_array_elements(coalesce(p_invites->'add', '[]'::jsonb)) loop
    insert into invites (hash, apartment_id, created_at, expires_at)
    values (v_item->>'hash', p_apartment, now(), to_timestamp((v_item->>'exp_ms')::bigint / 1000.0))
    on conflict (hash) do nothing;
  end loop;
  update invites set used_at = coalesce(used_at, now())
    where apartment_id = p_apartment and hash in (select jsonb_array_elements_text(coalesce(p_invites->'use', '[]'::jsonb)));
  update invites set cancelled_at = coalesce(cancelled_at, now())
    where apartment_id = p_apartment and hash in (select jsonb_array_elements_text(coalesce(p_invites->'cancel', '[]'::jsonb)));

  delete from presence where apartment_id = p_apartment and (
    cardinality(coalesce(p_agent_ids, array[]::text[])) = 0 or agent_id <> all(coalesce(p_agent_ids, array[]::text[])));

  if p_idem_key is not null and p_idem_key <> '' and p_idem_response is not null and p_idem_status is not null then
    insert into idempotency_keys (apartment_id, key, response, status, expires_at)
    values (p_apartment, p_idem_key, p_idem_response, p_idem_status, now() + interval '10 minutes')
    on conflict (apartment_id, key) do nothing;
  end if;
  perform v21.cleanup();
  -- v21: no realtime broadcast (apartments are private; nothing subscribes).
  return jsonb_build_object('conflict', false, 'version', v_new);
end;
$$;

create or replace function public.apt_rate_hit(p_apartment uuid, p_key text, p_limit int, p_window_ms int)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_count int; v_end timestamptz; v_window interval;
begin
  v_window := (greatest(p_window_ms, 1)::numeric / 1000.0) * interval '1 second';
  insert into rate_limits as saved (apartment_id, key, count, window_end)
  values (coalesce(p_apartment, '00000000-0000-0000-0000-000000000000'::uuid), p_key, 1, now() + v_window)
  on conflict (apartment_id, key) do update
    set count = case when saved.window_end < now() then 1 else saved.count + 1 end,
        window_end = case when saved.window_end < now() then now() + v_window else saved.window_end end
  returning count, window_end into v_count, v_end;
  return jsonb_build_object('count', v_count, 'limited', v_count > p_limit,
    'retry_after_ms', greatest(0, floor(extract(epoch from (v_end - now())) * 1000)::int));
end;
$$;

create or replace function public.apt_presence_touch(p_apartment uuid, p_agent_id text, p_seen_ms bigint)
returns void language plpgsql security invoker set search_path = v21 as $$
begin
  insert into presence (apartment_id, agent_id, seen_at) values (p_apartment, p_agent_id, to_timestamp(p_seen_ms / 1000.0))
  on conflict (apartment_id, agent_id) do update set seen_at = excluded.seen_at;
end;
$$;

create or replace function public.apt_mail_owner(p_apartment uuid, p_owner_key text)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_data jsonb;
begin
  select data into v_data from mailboxes where apartment_id = p_apartment and owner_key = p_owner_key and expires_at > now();
  return v_data;
end;
$$;

create or replace function public.apt_mail_token(p_apartment uuid, p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_key text;
begin
  select owner_key into v_key from agent_tokens where apartment_id = p_apartment and token_hash = p_token_hash and expires_at > now();
  if v_key is null then return null; end if;
  return public.apt_mail_owner(p_apartment, v_key);
end;
$$;

create or replace function public.apt_kv_get(p_key text)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_value jsonb;
begin
  select value into v_value from kv_cache where key = p_key and expires_at > now();
  return v_value;
end;
$$;

create or replace function public.apt_kv_put(p_key text, p_value jsonb, p_ttl_seconds int)
returns void language plpgsql security invoker set search_path = v21 as $$
begin
  insert into kv_cache (key, value, expires_at) values (p_key, p_value, now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at;
end;
$$;

-- ---------- grants: service_role only ----------
revoke all on all tables in schema v21 from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema v21 to service_role;
revoke all on function v21.cleanup() from public, anon, authenticated;
grant execute on function v21.cleanup() to service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'public.apt_for_user(uuid)',
    'public.apt_create(uuid, text, jsonb)',
    'public.apt_claim_legacy(uuid)',
    'public.apt_invite_lookup(text)',
    'public.apt_agent_lookup(text, text)',
    'public.apt_room_read(uuid, bigint)',
    'public.apt_room_commit(uuid, bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint, jsonb)',
    'public.apt_rate_hit(uuid, text, int, int)',
    'public.apt_presence_touch(uuid, text, bigint)',
    'public.apt_mail_owner(uuid, text)',
    'public.apt_mail_token(uuid, text)',
    'public.apt_kv_get(text)',
    'public.apt_kv_put(text, jsonb, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  if has_function_privilege('anon', 'public.apt_room_read(uuid, bigint)', 'execute') then
    raise exception 'anon must not execute v21_apt_room_read';
  end if;
end $$;
-- ---------- v21 watch links (human guests, read-only) ----------
-- A separate invite type: its own table and its own hash domain ("lr-watch|<code>"), so a watch code can
-- never register an agent and an agent invite can never open a watch session. Hash only, single use,
-- redeemed within INVITE_TTL_MS. A redeemed code becomes a watch session (opaque token, hash only),
-- tied to one apartment, read-only, hard-capped server-side (WATCH_SESSION_MS, 12 h).
create table if not exists v21.watch_codes (
  hash          text primary key check (hash ~ '^[0-9a-f]{64}$'),
  apartment_id  uuid not null references v21.apartments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  cancelled_at  timestamptz
);
create index if not exists v21_watch_codes_apartment_idx on v21.watch_codes (apartment_id, created_at);
create table if not exists v21.watch_sessions (
  token_hash    text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  apartment_id  uuid not null references v21.apartments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists v21_watch_sessions_apartment_idx on v21.watch_sessions (apartment_id);
alter table v21.watch_codes enable row level security;
alter table v21.watch_sessions enable row level security;

create or replace function public.apt_watch_mint(p_apartment uuid, p_hash text, p_exp_ms bigint, p_max_unused int)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
begin
  -- keep at most p_max_unused live codes per apartment: cancel the oldest first
  update watch_codes set cancelled_at = now()
    where hash in (select hash from watch_codes where apartment_id = p_apartment and used_at is null and cancelled_at is null
                   and expires_at > now() order by created_at desc offset greatest(p_max_unused - 1, 0));
  insert into watch_codes (hash, apartment_id, expires_at) values (p_hash, p_apartment, to_timestamp(p_exp_ms / 1000.0));
  delete from watch_codes where hash in (select hash from watch_codes where expires_at < now() - interval '1 day' limit 100);
  delete from watch_sessions where token_hash in (select token_hash from watch_sessions where expires_at < now() limit 100);
  return jsonb_build_object('ok', true);
end;
$$;

-- Atomic: the code is used once, and only within its life. Distinct answers for logging-free diagnostics.
create or replace function public.apt_watch_redeem(p_hash text, p_session_hash text, p_session_ms bigint)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_row watch_codes%rowtype; v_exp timestamptz;
begin
  select * into v_row from watch_codes where hash = p_hash for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'watch_invalid'); end if;
  if v_row.cancelled_at is not null then return jsonb_build_object('ok', false, 'code', 'watch_cancelled'); end if;
  if v_row.used_at is not null then return jsonb_build_object('ok', false, 'code', 'watch_used'); end if;
  if v_row.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'watch_expired'); end if;
  update watch_codes set used_at = now() where hash = p_hash;
  v_exp := now() + (greatest(p_session_ms, 1000)::numeric / 1000.0) * interval '1 second';
  insert into watch_sessions (token_hash, apartment_id, expires_at) values (p_session_hash, v_row.apartment_id, v_exp);
  return jsonb_build_object('ok', true, 'apartment', v_row.apartment_id, 'expires_ms', floor(extract(epoch from v_exp) * 1000));
end;
$$;

create or replace function public.apt_watch_session(p_session_hash text)
returns uuid language plpgsql security invoker set search_path = v21 as $$
declare v uuid;
begin
  select apartment_id into v from watch_sessions where token_hash = p_session_hash and expires_at > now();
  return v;
end;
$$;

-- Pause cancels unused watch codes (p_sessions false). The owner's "end watch links" also ends sessions.
create or replace function public.apt_watch_revoke(p_apartment uuid, p_sessions boolean)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare v_codes int; v_sessions int := 0;
begin
  update watch_codes set cancelled_at = now() where apartment_id = p_apartment and used_at is null and cancelled_at is null;
  get diagnostics v_codes = row_count;
  if p_sessions then
    delete from watch_sessions where apartment_id = p_apartment;
    get diagnostics v_sessions = row_count;
  end if;
  return jsonb_build_object('codes', v_codes, 'sessions', v_sessions);
end;
$$;

revoke all on table v21.watch_codes, v21.watch_sessions from public, anon, authenticated;
grant select, insert, update, delete on table v21.watch_codes, v21.watch_sessions to service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'public.apt_watch_mint(uuid, text, bigint, int)',
    'public.apt_watch_redeem(text, text, bigint)',
    'public.apt_watch_session(text)',
    'public.apt_watch_revoke(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------- legacy room import (copy, never move) ----------
-- Copies the v20 room (public.room id = 1) and its agents' mailboxes / tokens / presence into the legacy
-- apartment. Reads public.* only; writes v21.* only. Idempotent:
--   - first call: creates the legacy apartment (owner_id null) and copies everything.
--   - later calls with p_refresh = true: re-copy ONLY while v21 has not written to the legacy room yet
--     (its version still equals the imported one) and nobody has claimed it. Run it right before promoting the
--     v21 deployment so the last minutes of v20 activity come along.
create table if not exists v21.legacy_import (
  apartment_id      uuid primary key references v21.apartments (id) on delete cascade,
  source_version    bigint not null,
  imported_version  bigint not null,
  imported_at       timestamptz not null default now()
);
alter table v21.legacy_import enable row level security;

create or replace function public.apt_import_legacy(p_refresh boolean default false)
returns jsonb language plpgsql security invoker set search_path = v21 as $$
declare
  v_apt uuid; v_src record; v_imported bigint; v_room_version bigint; v_owner uuid; v_mail int := 0; v_tokens int := 0;
begin
  select version, state_gz, public_door into v_src from public.room where id = 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no v20 room'); end if;
  select id, owner_id into v_apt, v_owner from apartments where legacy for update;
  if v_apt is null then
    insert into apartments (owner_id, kind, legacy) values (null, 'private', true) returning id into v_apt;
  else
    select imported_version into v_imported from legacy_import where apartment_id = v_apt;
    select version into v_room_version from room where apartment_id = v_apt;
    if v_room_version is not null then
      if not p_refresh then return jsonb_build_object('ok', true, 'apartment', v_apt, 'skipped', 'already imported'); end if;
      if v_owner is not null then return jsonb_build_object('ok', false, 'apartment', v_apt, 'reason', 'already claimed'); end if;
      if v_imported is distinct from v_room_version then
        return jsonb_build_object('ok', false, 'apartment', v_apt, 'reason', 'v21 already wrote to the legacy room');
      end if;
    end if;
  end if;
  insert into room (apartment_id, version, state_gz, public_door, updated_at)
  values (v_apt, greatest(v_src.version, 1), v_src.state_gz, v_src.public_door, now())
  on conflict (apartment_id) do update set version = excluded.version, state_gz = excluded.state_gz,
    public_door = excluded.public_door, updated_at = now();
  insert into mailboxes (apartment_id, owner_key, data, updated_at, expires_at)
  select v_apt, m.owner_key, m.data, m.updated_at, m.expires_at from public.mailboxes m where m.expires_at > now()
  on conflict (apartment_id, owner_key) do update set data = excluded.data, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
  get diagnostics v_mail = row_count;
  insert into agent_tokens (token_hash, apartment_id, owner_key, expires_at)
  select t.token_hash, v_apt, t.owner_key, t.expires_at from public.agent_tokens t
    join mailboxes m on m.apartment_id = v_apt and m.owner_key = t.owner_key
   where t.expires_at > now()
  on conflict (token_hash) do update set owner_key = excluded.owner_key, expires_at = excluded.expires_at
    where agent_tokens.apartment_id = excluded.apartment_id;
  get diagnostics v_tokens = row_count;
  insert into presence (apartment_id, agent_id, seen_at)
  select v_apt, p.agent_id, p.seen_at from public.presence p
  on conflict (apartment_id, agent_id) do update set seen_at = excluded.seen_at;
  insert into legacy_import (apartment_id, source_version, imported_version, imported_at)
  values (v_apt, v_src.version, greatest(v_src.version, 1), now())
  on conflict (apartment_id) do update set source_version = excluded.source_version,
    imported_version = excluded.imported_version, imported_at = now();
  return jsonb_build_object('ok', true, 'apartment', v_apt, 'source_version', v_src.version, 'mailboxes', v_mail, 'tokens', v_tokens);
end;
$$;
revoke all on table v21.legacy_import from public, anon, authenticated;
grant select, insert, update, delete on table v21.legacy_import to service_role;
revoke all on function public.apt_import_legacy(boolean) from public, anon, authenticated;
grant execute on function public.apt_import_legacy(boolean) to service_role;

-- First copy now (the deploy runbook refreshes it right before promoting).
select public.apt_import_legacy(false);

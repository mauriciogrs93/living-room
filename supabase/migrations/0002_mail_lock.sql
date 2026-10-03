-- Applied after 0001_init.sql. Do not edit 0001.
-- Mail-only commits lock the room row while they check the version.
-- realtime.send failures are warned, not swallowed silently.
-- Supabase grants anon and authenticated on replaced functions. Revoke them.

create or replace function room_commit(
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
set search_path = public
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
    -- Mailbox-only: lock the row, keep the blob, version, and broadcast.
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

  perform cleanup();

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
          'room:public',
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

revoke all on function room_commit(bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint) from public, anon, authenticated;
grant execute on function room_commit(bigint, text, jsonb, jsonb, text[], boolean, text, jsonb, smallint) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.room_commit(bigint,text,jsonb,jsonb,text[],boolean,text,jsonb,smallint)', 'execute') then
    raise exception 'anon must not execute public.room_commit(bigint,text,jsonb,jsonb,text[],boolean,text,jsonb,smallint)';
  end if;
end $$;

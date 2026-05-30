-- Initial idempotent push RPC.
-- The desktop app should send bounded batches from local sync_outbox.

create or replace function public.sync_push(
  p_local_device_id text,
  p_device_name text,
  p_platform text,
  p_app_version text,
  p_batch_idempotency_key text,
  p_profile_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_id uuid;
  v_batch_id uuid;
  v_change jsonb;
  v_entity_type text;
  v_entity_key text;
  v_operation text;
  v_payload jsonb;
  v_processed integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_existing_batch public.cloud_sync_batches%rowtype;
begin
  if v_user_id is null then
    raise exception 'sync_push requires an authenticated user';
  end if;

  if not public.has_active_cloud_sync(v_user_id) then
    raise exception 'cloud sync requires an active subscription';
  end if;

  if p_local_device_id is null or length(trim(p_local_device_id)) = 0 then
    raise exception 'local device id is required';
  end if;

  if p_batch_idempotency_key is null or length(trim(p_batch_idempotency_key)) = 0 then
    raise exception 'batch idempotency key is required';
  end if;

  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'changes must be a JSON array';
  end if;

  insert into public.cloud_devices (
    user_id,
    local_device_id,
    name,
    platform,
    app_version,
    last_seen_at
  ) values (
    v_user_id,
    p_local_device_id,
    p_device_name,
    p_platform,
    p_app_version,
    now()
  )
  on conflict (user_id, local_device_id) do update set
    name = excluded.name,
    platform = excluded.platform,
    app_version = excluded.app_version,
    last_seen_at = excluded.last_seen_at
  returning id into v_device_id;

  select * into v_existing_batch
  from public.cloud_sync_batches
  where user_id = v_user_id
    and idempotency_key = p_batch_idempotency_key;

  if found then
    return jsonb_build_object(
      'status', v_existing_batch.status,
      'duplicate', true,
      'batch_id', v_existing_batch.id,
      'device_id', v_device_id,
      'processed', v_existing_batch.change_count,
      'results', '[]'::jsonb
    );
  end if;

  insert into public.cloud_sync_batches (
    user_id,
    device_id,
    idempotency_key,
    change_count,
    status
  ) values (
    v_user_id,
    v_device_id,
    p_batch_idempotency_key,
    jsonb_array_length(p_changes),
    'pending'
  )
  returning id into v_batch_id;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_entity_type := v_change ->> 'entity_type';
    v_entity_key := v_change ->> 'entity_key';
    v_operation := coalesce(v_change ->> 'operation', 'upsert');
    v_payload := coalesce(v_change -> 'payload_json', '{}'::jsonb);

    if v_entity_type is null or length(trim(v_entity_type)) = 0 then
      raise exception 'change entity_type is required';
    end if;

    if v_entity_key is null or length(trim(v_entity_key)) = 0 then
      raise exception 'change entity_key is required';
    end if;

    if v_operation not in ('upsert', 'delete') then
      raise exception 'unsupported sync operation: %', v_operation;
    end if;

    if v_entity_type = 'profiles_manifest' then
      insert into public.cloud_app_entities (
        user_id,
        source_device_id,
        entity_type,
        entity_key,
        payload_json,
        deleted_at
      ) values (
        v_user_id,
        v_device_id,
        v_entity_type,
        v_entity_key,
        v_payload,
        case when v_operation = 'delete' then now() else null end
      )
      on conflict (user_id, entity_type, entity_key) do update set
        source_device_id = excluded.source_device_id,
        payload_json = excluded.payload_json,
        deleted_at = excluded.deleted_at;
    elsif v_entity_type = 'profile' then
      insert into public.cloud_profiles (
        user_id,
        source_device_id,
        entity_key,
        local_profile_id,
        name,
        player_name,
        local_primary_id,
        manifest_created_at,
        payload_json,
        deleted_at
      ) values (
        v_user_id,
        v_device_id,
        v_entity_key,
        coalesce(v_payload ->> 'local_profile_id', v_entity_key),
        coalesce(v_payload ->> 'name', v_entity_key),
        v_payload ->> 'player_name',
        v_payload ->> 'local_primary_id',
        nullif(v_payload ->> 'created_at', '')::timestamptz,
        v_payload,
        case when v_operation = 'delete' then now() else null end
      )
      on conflict (user_id, entity_key) do update set
        source_device_id = excluded.source_device_id,
        local_profile_id = excluded.local_profile_id,
        name = excluded.name,
        player_name = excluded.player_name,
        local_primary_id = excluded.local_primary_id,
        manifest_created_at = excluded.manifest_created_at,
        payload_json = excluded.payload_json,
        deleted_at = excluded.deleted_at;
    else
      if p_profile_id is null then
        raise exception 'profile_id is required for profile-level entity type %', v_entity_type;
      end if;

      if v_entity_type = 'match' then
        insert into public.cloud_matches (
          user_id,
          profile_id,
          source_device_id,
          entity_key,
          local_match_id,
          guid,
          match_fingerprint,
          started_at,
          ended_at,
          arena,
          playlist,
          match_type,
          score_blue,
          score_orange,
          winner,
          is_online,
          is_overtime,
          duration_seconds,
          payload_json,
          deleted_at
        ) values (
          v_user_id,
          p_profile_id,
          v_device_id,
          v_entity_key,
          nullif(v_payload ->> 'local_id', '')::bigint,
          coalesce(v_payload ->> 'guid', v_entity_key),
          v_payload ->> 'match_fingerprint',
          nullif(v_payload ->> 'start_time', '')::timestamptz,
          nullif(v_payload ->> 'end_time', '')::timestamptz,
          v_payload ->> 'arena',
          v_payload ->> 'playlist',
          v_payload ->> 'match_type',
          nullif(v_payload ->> 'score_blue', '')::integer,
          nullif(v_payload ->> 'score_orange', '')::integer,
          nullif(v_payload ->> 'winner', '')::integer,
          nullif(v_payload ->> 'is_online', '')::boolean,
          nullif(v_payload ->> 'is_overtime', '')::boolean,
          nullif(v_payload ->> 'duration_seconds', '')::integer,
          v_payload,
          case when v_operation = 'delete' then now() else null end
        )
        on conflict (user_id, profile_id, entity_key) do update set
          source_device_id = excluded.source_device_id,
          local_match_id = excluded.local_match_id,
          guid = excluded.guid,
          match_fingerprint = excluded.match_fingerprint,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          arena = excluded.arena,
          playlist = excluded.playlist,
          match_type = excluded.match_type,
          score_blue = excluded.score_blue,
          score_orange = excluded.score_orange,
          winner = excluded.winner,
          is_online = excluded.is_online,
          is_overtime = excluded.is_overtime,
          duration_seconds = excluded.duration_seconds,
          payload_json = excluded.payload_json,
          deleted_at = excluded.deleted_at;
      elsif v_entity_type = 'player' then
        insert into public.cloud_players (
          user_id,
          profile_id,
          source_device_id,
          entity_key,
          primary_id,
          name,
          payload_json,
          deleted_at
        ) values (
          v_user_id,
          p_profile_id,
          v_device_id,
          v_entity_key,
          coalesce(v_payload ->> 'primary_id', v_entity_key),
          v_payload ->> 'name',
          v_payload,
          case when v_operation = 'delete' then now() else null end
        )
        on conflict (user_id, profile_id, entity_key) do update set
          source_device_id = excluded.source_device_id,
          primary_id = excluded.primary_id,
          name = excluded.name,
          payload_json = excluded.payload_json,
          deleted_at = excluded.deleted_at;
      elsif v_entity_type = 'match_player' then
        insert into public.cloud_match_players (
          user_id,
          profile_id,
          source_device_id,
          entity_key,
          match_guid,
          player_primary_id,
          payload_json,
          deleted_at
        ) values (
          v_user_id,
          p_profile_id,
          v_device_id,
          v_entity_key,
          v_payload ->> 'match_guid',
          v_payload ->> 'player_primary_id',
          v_payload,
          case when v_operation = 'delete' then now() else null end
        )
        on conflict (user_id, profile_id, entity_key) do update set
          source_device_id = excluded.source_device_id,
          match_guid = excluded.match_guid,
          player_primary_id = excluded.player_primary_id,
          payload_json = excluded.payload_json,
          deleted_at = excluded.deleted_at;
      elsif v_entity_type = 'match_event' then
        insert into public.cloud_match_events (
          user_id,
          profile_id,
          source_device_id,
          entity_key,
          match_guid,
          event_type,
          occurred_at,
          payload_json,
          deleted_at
        ) values (
          v_user_id,
          p_profile_id,
          v_device_id,
          v_entity_key,
          v_payload ->> 'match_guid',
          v_payload ->> 'event_type',
          nullif(v_payload ->> 'occurred_at', '')::timestamptz,
          v_payload,
          case when v_operation = 'delete' then now() else null end
        )
        on conflict (user_id, profile_id, entity_key) do update set
          source_device_id = excluded.source_device_id,
          match_guid = excluded.match_guid,
          event_type = excluded.event_type,
          occurred_at = excluded.occurred_at,
          payload_json = excluded.payload_json,
          deleted_at = excluded.deleted_at;
      else
        insert into public.cloud_profile_entities (
          user_id,
          profile_id,
          source_device_id,
          entity_type,
          entity_key,
          payload_json,
          deleted_at
        ) values (
          v_user_id,
          p_profile_id,
          v_device_id,
          v_entity_type,
          v_entity_key,
          v_payload,
          case when v_operation = 'delete' then now() else null end
        )
        on conflict (user_id, profile_id, entity_type, entity_key) do update set
          source_device_id = excluded.source_device_id,
          payload_json = excluded.payload_json,
          deleted_at = excluded.deleted_at;
      end if;
    end if;

    v_processed := v_processed + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_key', v_entity_key,
      'operation', v_operation,
      'status', 'accepted'
    ));
  end loop;

  update public.cloud_sync_batches
  set status = 'processed',
      processed_at = now(),
      change_count = v_processed
  where id = v_batch_id;

  return jsonb_build_object(
    'status', 'processed',
    'duplicate', false,
    'batch_id', v_batch_id,
    'device_id', v_device_id,
    'processed', v_processed,
    'results', v_results
  );
exception
  when others then
    if v_batch_id is not null then
      update public.cloud_sync_batches
      set status = 'failed',
          error_message = sqlerrm,
          processed_at = now()
      where id = v_batch_id;
    end if;
    raise;
end;
$$;

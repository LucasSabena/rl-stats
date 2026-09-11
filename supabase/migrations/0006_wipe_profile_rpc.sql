-- Wipe every profile-scoped row in the cloud for the authenticated user.
--
-- The desktop "delete all data" flow needs a way to remove server copies.
-- Pushing per-entity deletes would be O(rows) and could time out mid-way;
-- this RPC does it atomically in one call.

create or replace function public.sync_wipe_profile(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_matches integer := 0;
begin
  if v_user_id is null then
    raise exception 'sync_wipe_profile requires an authenticated user';
  end if;

  if p_profile_id is null then
    raise exception 'profile id is required';
  end if;

  delete from public.cloud_matches
  where user_id = v_user_id and profile_id = p_profile_id;
  get diagnostics v_matches = row_count;

  delete from public.cloud_match_players
  where user_id = v_user_id and profile_id = p_profile_id;

  delete from public.cloud_match_events
  where user_id = v_user_id and profile_id = p_profile_id;

  delete from public.cloud_players
  where user_id = v_user_id and profile_id = p_profile_id;

  delete from public.cloud_profile_entities
  where user_id = v_user_id and profile_id = p_profile_id;

  -- Also drop this profile's change-log entries: pulling them later would
  -- resurrect the rows that were just wiped.
  delete from public.sync_changes
  where user_id = v_user_id and profile_id = p_profile_id;

  return jsonb_build_object('status', 'wiped', 'deleted_matches', v_matches);
end;
$$;

revoke execute on function public.sync_wipe_profile(uuid) from public;
revoke execute on function public.sync_wipe_profile(uuid) from anon;

grant execute on function public.sync_wipe_profile(uuid) to authenticated, service_role;

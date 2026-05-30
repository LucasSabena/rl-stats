-- Restrict RPC execution to authenticated users and service role.

revoke execute on function public.has_active_cloud_sync(uuid) from public;
revoke execute on function public.has_active_cloud_sync(uuid) from anon;
revoke execute on function public.has_active_cloud_sync(uuid) from authenticated;

revoke execute on function public.sync_pull(bigint, integer) from public;
revoke execute on function public.sync_pull(bigint, integer) from anon;
revoke execute on function public.sync_pull(bigint, integer) from authenticated;

revoke execute on function public.sync_push(text, text, text, text, text, uuid, jsonb) from public;
revoke execute on function public.sync_push(text, text, text, text, text, uuid, jsonb) from anon;
revoke execute on function public.sync_push(text, text, text, text, text, uuid, jsonb) from authenticated;

grant execute on function public.has_active_cloud_sync(uuid) to authenticated, service_role;
grant execute on function public.sync_pull(bigint, integer) to authenticated, service_role;
grant execute on function public.sync_push(text, text, text, text, text, uuid, jsonb) to authenticated, service_role;

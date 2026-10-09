create extension if not exists pg_net with schema extensions;

create or replace function public.sync_member_to_cloudbase()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  sync_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into sync_secret
    from vault.decrypted_secrets
   where name = 'cloudbase_member_sync_secret'
   limit 1;

  if sync_secret is null then
    raise warning 'CloudBase member sync secret is not configured';
    return new;
  end if;

  select net.http_post(
    url := 'https://charmsway-d8g4rudqda2f7525c-1301098621.ap-shanghai.app.tcloudbase.com/supabase-member-sync/sync/member',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Sync-Secret', sync_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'schema', tg_table_schema,
      'table', tg_table_name,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  return new;
exception
  when others then
    raise warning 'CloudBase member sync enqueue failed: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.sync_member_to_cloudbase() from public;

drop trigger if exists sync_members_to_cloudbase on public.members;
create trigger sync_members_to_cloudbase
after insert or update on public.members
for each row
execute function public.sync_member_to_cloudbase();

comment on function public.sync_member_to_cloudbase() is
  'Queues Supabase member inserts and updates for real-time CloudBase synchronization.';

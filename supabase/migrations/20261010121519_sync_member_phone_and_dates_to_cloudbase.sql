begin;

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
      'record', jsonb_build_object(
        'id', new.id,
        'source_card_number', new.source_card_number,
        'member_card_number', new.member_card_number,
        'name', new.name,
        'phone', new.phone,
        'member_kind', new.member_kind,
        'level', new.level,
        'joined_on', new.joined_on,
        'membership_changed_on', new.membership_changed_on,
        'valid_until', new.valid_until,
        'created_at', new.created_at
      )
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

revoke all on function public.sync_member_to_cloudbase() from public, anon, authenticated;

comment on function public.sync_member_to_cloudbase() is
  'Queues complete phone, joining and membership-change fields for CloudBase synchronization.';

commit;

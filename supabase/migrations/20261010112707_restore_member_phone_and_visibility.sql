begin;

-- Production phone values are imported from a private operational export and
-- are deliberately excluded from this public repository. Validate that the
-- private data migration has completed before restoring the constraint.
do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from public.members
  where phone is null
     or length(public.normalize_phone(phone)) not between 7 and 20
     or public.normalize_phone(phone) ~ '^0+$';

  if missing_count > 0 then
    raise exception '% member record(s) still have a missing or placeholder phone; import the private phone data before applying this migration', missing_count;
  end if;
end
$$;

alter table public.members alter column phone set not null;
alter table public.members drop constraint if exists members_phone_valid;
alter table public.members add constraint members_phone_valid check (
  length(public.normalize_phone(phone)) between 7 and 20
  and public.normalize_phone(phone) !~ '^0+$'
);

comment on column public.members.phone is
  '必填的会员手机号；完整号码仅账号002和004可见';

create or replace function public.can_view_member_phone()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_enabled
      and username in ('002', '004')
  )
$$;

revoke all on function public.can_view_member_phone() from public, anon;
grant execute on function public.can_view_member_phone() to authenticated;

-- Remove direct phone access. Retain the non-sensitive columns needed by
-- relationship embeds, RLS-backed writes and existing security-invoker views.
revoke select on table public.members from authenticated;
grant select (
  id,
  member_card_number,
  source_card_number,
  name,
  consultant,
  has_service_group,
  has_mini_program_profile,
  member_kind,
  level,
  birthday,
  joined_on,
  membership_changed_on,
  valid_until,
  last_visit_date,
  visit_count,
  is_archived,
  prospect_converted_at,
  created_by,
  updated_by,
  created_at,
  updated_at
) on public.members to authenticated;

-- The CloudBase projection does not use the phone. Do not include it in the
-- outbound webhook payload now that the field contains production PII.
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
      'record', to_jsonb(new) - 'phone' - 'normalized_phone'
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

commit;

begin;

create table public.member_level_changes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  old_level public.member_level not null,
  new_level public.member_level not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint member_level_actually_changed check (old_level <> new_level)
);

create index member_level_changes_member_idx
on public.member_level_changes(member_id, changed_at desc);

alter table public.member_level_changes enable row level security;
create policy level_changes_read_active_users
on public.member_level_changes for select to authenticated
using (public.is_active_user());

create or replace function public.record_member_level_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.level is distinct from new.level then
    insert into public.member_level_changes(member_id, old_level, new_level, changed_by)
    values(new.id, old.level, new.level, auth.uid());
    perform public.write_audit(
      'member', new.id, 'change_level',
      jsonb_build_object('level', old.level),
      jsonb_build_object('level', new.level)
    );
  end if;
  return new;
end
$$;

create trigger members_record_level_change
after update of level on public.members
for each row execute function public.record_member_level_change();

create or replace view public.v1_member_upgrades
with (security_invoker = true)
as
select distinct on (c.member_id)
  c.member_id,
  m.name,
  m.phone,
  m.level as current_level,
  c.new_level as first_upgrade_level,
  c.changed_at as first_upgraded_at
from public.member_level_changes c
join public.members m on m.id = c.member_id
where c.old_level = 'V1'
  and c.new_level in ('V2', 'V3', 'V4', 'V5')
  and not m.is_archived
order by c.member_id, c.changed_at;

grant select on public.member_level_changes, public.v1_member_upgrades to authenticated;
revoke insert, update, delete on public.member_level_changes from anon, authenticated;
revoke all on function public.record_member_level_change() from public, anon, authenticated;

commit;

begin;

alter table public.members add column if not exists membership_changed_on date;

create or replace function public.set_membership_cycle_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.membership_changed_on is null then
    new.valid_until := null;
  else
    new.valid_until := (new.membership_changed_on + interval '1 year')::date;
  end if;
  return new;
end
$$;

drop trigger if exists members_set_membership_cycle_dates on public.members;
create trigger members_set_membership_cycle_dates
before insert or update of membership_changed_on on public.members
for each row execute function public.set_membership_cycle_dates();

update public.members
set membership_changed_on = coalesce(joined_on, valid_until - interval '1 year');

drop trigger if exists members_sync_share_benefit_expiry on public.members;
drop index if exists public.tasks_share_benefit_day_30_unique;
drop index if exists public.tasks_share_benefit_end_15d_unique;
create unique index tasks_share_benefit_day_30_unique
on public.tasks(member_id, task_type, due_date) where task_type = 'share_benefit_day_30';
create unique index tasks_share_benefit_end_15d_unique
on public.tasks(member_id, task_type, due_date) where task_type = 'share_benefit_end_15d';

create or replace function public.sync_membership_cycle_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cycle_start date;
  expiry_date date;
begin
  cycle_start := new.membership_changed_on;

  update public.tasks set status = 'cancelled', updated_at = now()
  where member_id = new.id
    and task_type in (
      'share_benefit_expiry', 'share_benefit_day_30', 'share_benefit_end_15d',
      'validity_90d', 'validity_30d', 'validity_7d'
    )
    and status = 'pending';

  if cycle_start is null then return new; end if;
  expiry_date := (cycle_start + interval '1 year')::date;

  insert into public.tasks(member_id, task_type, due_date, status)
  values
    (new.id, 'share_benefit_day_30', cycle_start + 30, 'pending'),
    (new.id, 'share_benefit_end_15d', (cycle_start + interval '3 months')::date - 15, 'pending')
  on conflict do nothing;

  insert into public.tasks(member_id, task_type, due_date, status, source_valid_until)
  values
    (new.id, 'validity_90d', expiry_date - 90, 'pending', expiry_date),
    (new.id, 'validity_30d', expiry_date - 30, 'pending', expiry_date),
    (new.id, 'validity_7d', expiry_date - 7, 'pending', expiry_date)
  on conflict do nothing;
  return new;
end
$$;

create trigger members_sync_membership_cycle_tasks
after insert or update of membership_changed_on on public.members
for each row execute function public.sync_membership_cycle_tasks();

revoke all on function public.sync_membership_cycle_tasks() from public, anon, authenticated;
revoke all on function public.set_membership_cycle_dates() from public, anon, authenticated;

commit;

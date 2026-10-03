begin;

drop trigger if exists members_sync_share_benefit_expiry on public.members;

create or replace function public.sync_share_benefit_expiry_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expiry_date date;
begin
  if new.joined_on is null then
    update public.tasks set status = 'cancelled', updated_at = now()
    where member_id = new.id
      and task_type in ('share_benefit_expiry', 'share_benefit_day_30', 'share_benefit_end_15d')
      and status = 'pending';
    return new;
  end if;

  expiry_date := (new.joined_on + interval '3 months')::date;

  insert into public.tasks(member_id, task_type, due_date, status)
  values(new.id, 'share_benefit_day_30', new.joined_on + 30, 'pending')
  on conflict(member_id, task_type) where task_type = 'share_benefit_day_30'
  do update set due_date = excluded.due_date,
    status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
    updated_at = now();

  insert into public.tasks(member_id, task_type, due_date, status)
  values(new.id, 'share_benefit_end_15d', expiry_date - 15, 'pending')
  on conflict(member_id, task_type) where task_type = 'share_benefit_end_15d'
  do update set due_date = excluded.due_date,
    status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
    updated_at = now();

  update public.tasks set status = 'cancelled', updated_at = now()
  where member_id = new.id and task_type = 'share_benefit_expiry' and status = 'pending';
  return new;
end
$$;

create trigger members_sync_share_benefit_expiry
after insert or update of joined_on on public.members
for each row execute function public.sync_share_benefit_expiry_task();

drop index if exists public.tasks_share_benefit_unique;
create unique index if not exists tasks_share_benefit_day_30_unique
on public.tasks(member_id, task_type) where task_type = 'share_benefit_day_30';
create unique index if not exists tasks_share_benefit_end_15d_unique
on public.tasks(member_id, task_type) where task_type = 'share_benefit_end_15d';

update public.tasks set status = 'cancelled', updated_at = now()
where task_type = 'share_benefit_expiry' and status = 'pending';

insert into public.tasks(member_id, task_type, due_date, status)
select id, 'share_benefit_day_30', joined_on + 30, 'pending'
from public.members where joined_on is not null and not is_archived
on conflict(member_id, task_type) where task_type = 'share_benefit_day_30' do nothing;

insert into public.tasks(member_id, task_type, due_date, status)
select id, 'share_benefit_end_15d', (joined_on + interval '3 months')::date - 15, 'pending'
from public.members where joined_on is not null and not is_archived
on conflict(member_id, task_type) where task_type = 'share_benefit_end_15d' do nothing;

revoke all on function public.sync_share_benefit_expiry_task() from public, anon, authenticated;

commit;

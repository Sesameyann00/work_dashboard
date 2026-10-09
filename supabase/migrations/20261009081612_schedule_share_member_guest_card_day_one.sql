begin;

create unique index if not exists tasks_share_benefit_guest_card_day_1_unique
on public.tasks(member_id, task_type, due_date)
where task_type = 'share_benefit_guest_card_day_1';

create or replace function public.sync_share_member_guest_card_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guest_card_due_date date;
  cutoff constant date := date '2026-10-01';
begin
  update public.tasks
  set status = 'cancelled', updated_at = now()
  where member_id = new.id
    and task_type = 'share_benefit_guest_card_day_1'
    and status = 'pending';

  if new.joined_on is null or new.is_archived then
    return new;
  end if;

  guest_card_due_date := new.joined_on + 1;
  if guest_card_due_date < cutoff then
    return new;
  end if;

  insert into public.tasks(member_id, task_type, due_date, status)
  values(new.id, 'share_benefit_guest_card_day_1', guest_card_due_date, 'pending')
  on conflict(member_id, task_type, due_date)
    where task_type = 'share_benefit_guest_card_day_1'
  do update set
    status = case
      when public.tasks.status in ('completed', 'confirmed') then public.tasks.status
      else 'pending'
    end,
    updated_at = now();

  return new;
end
$$;

drop trigger if exists members_sync_share_member_guest_card_task on public.members;
create trigger members_sync_share_member_guest_card_task
after insert or update of joined_on, is_archived on public.members
for each row execute function public.sync_share_member_guest_card_task();

insert into public.tasks(member_id, task_type, due_date, status)
select id, 'share_benefit_guest_card_day_1', joined_on + 1, 'pending'
from public.members
where joined_on is not null
  and joined_on + 1 >= date '2026-10-01'
  and not is_archived
on conflict(member_id, task_type, due_date)
  where task_type = 'share_benefit_guest_card_day_1'
do nothing;

revoke all on function public.sync_share_member_guest_card_task() from public, anon, authenticated;

commit;

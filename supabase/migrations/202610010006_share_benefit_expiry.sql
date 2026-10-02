begin;

create unique index tasks_share_benefit_unique
on public.tasks(member_id,task_type)
where task_type='share_benefit_expiry';

create or replace function public.sync_share_benefit_expiry_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare expiry_date date;
begin
  if new.joined_on is null then
    update public.tasks set status='cancelled'
    where member_id=new.id and task_type='share_benefit_expiry' and status='pending';
    return new;
  end if;

  expiry_date := (new.joined_on + interval '3 months')::date;
  insert into public.tasks(member_id,task_type,due_date,status)
  values(new.id,'share_benefit_expiry',expiry_date,'pending')
  on conflict(member_id,task_type) where task_type='share_benefit_expiry'
  do update set due_date=excluded.due_date,
    status=case when public.tasks.status in ('completed','confirmed') then public.tasks.status else 'pending' end,
    updated_at=now();
  return new;
end $$;

create trigger members_sync_share_benefit_expiry
after insert or update of joined_on on public.members
for each row execute function public.sync_share_benefit_expiry_task();

insert into public.tasks(member_id,task_type,due_date,status)
select id,'share_benefit_expiry',(joined_on+interval '3 months')::date,'pending'
from public.members where joined_on is not null
on conflict(member_id,task_type) where task_type='share_benefit_expiry' do nothing;

commit;

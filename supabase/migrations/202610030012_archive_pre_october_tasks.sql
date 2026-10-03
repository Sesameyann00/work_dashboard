begin;

create or replace function public.archive_pre_cutoff_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.due_date < date '2026-10-01' and new.status in ('pending', 'cancelled') then
    new.status := 'archived';
  end if;
  return new;
end
$$;

drop trigger if exists tasks_archive_pre_cutoff on public.tasks;
create trigger tasks_archive_pre_cutoff
before insert or update of status, due_date on public.tasks
for each row execute function public.archive_pre_cutoff_task();

update public.tasks
set status = 'archived', updated_at = now()
where due_date < date '2026-10-01'
  and status in ('pending', 'cancelled');

create or replace view public.member_timeline
with (security_invoker = true)
as
select v.member_id, v.id as source_id, v.visit_date as event_date,
  'visit'::text as event_type, '已到诊'::text as display_status, false as is_historical
from public.visits v
union all
select t.member_id, t.id as source_id, t.due_date as event_date, t.task_type::text as event_type,
  case
    when t.status = 'pending' and t.due_date < (now() at time zone 'Asia/Shanghai')::date then '已逾期'
    when t.status = 'pending' and t.task_type = 'care_d0' then '待确认'
    when t.status = 'pending' then '待完成'
    when t.status = 'confirmed' then '已确认'
    when t.status = 'completed' then '已完成'
    when t.status = 'superseded' then '已被新周期覆盖'
    when t.status = 'archived' then '已归档'
    else '已取消'
  end as display_status,
  t.is_historical
from public.tasks t
union all
select g.member_id, g.id as source_id,
  make_date(g.gift_year, extract(month from m.birthday)::integer,
    least(extract(day from m.birthday)::integer,
      extract(day from (make_date(g.gift_year, extract(month from m.birthday)::integer, 1) + interval '1 month - 1 day'))::integer)) as event_date,
  'birthday_gift'::text as event_type,
  case g.status when 'pending_notification' then '待告知' when 'notified' then '已告知' else '已领取' end as display_status,
  false as is_historical
from public.birthday_gifts g join public.members m on m.id = g.member_id
where m.birthday is not null
union all
select s.member_id, s.id as source_id, s.event_date, s.survey_type::text as event_type,
  case s.status when 'completed' then '已完成' else '待完成' end as display_status,
  false as is_historical
from public.survey_events s;

revoke all on function public.archive_pre_cutoff_task() from public, anon, authenticated;

commit;

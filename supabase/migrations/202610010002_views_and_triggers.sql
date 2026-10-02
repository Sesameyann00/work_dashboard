begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.members for each row execute function public.set_updated_at();
create trigger treatments_set_updated_at before update on public.treatments for each row execute function public.set_updated_at();
create trigger service_cycles_set_updated_at before update on public.service_cycles for each row execute function public.set_updated_at();
create trigger visits_set_updated_at before update on public.visits for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger birthday_gifts_set_updated_at before update on public.birthday_gifts for each row execute function public.set_updated_at();
create trigger survey_events_set_updated_at before update on public.survey_events for each row execute function public.set_updated_at();

create or replace function public.refresh_member_visit_stats()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_member_id uuid;
begin
  affected_member_id := coalesce(new.member_id, old.member_id);

  update public.members m
  set
    last_visit_date = stats.last_visit_date,
    visit_count = stats.visit_count,
    updated_at = now()
  from (
    select max(v.visit_date) as last_visit_date, count(*)::integer as visit_count
    from public.visits v
    where v.member_id = affected_member_id
  ) stats
  where m.id = affected_member_id;

  if tg_op = 'UPDATE' and old.member_id is distinct from new.member_id then
    update public.members m
    set
      last_visit_date = stats.last_visit_date,
      visit_count = stats.visit_count,
      updated_at = now()
    from (
      select max(v.visit_date) as last_visit_date, count(*)::integer as visit_count
      from public.visits v
      where v.member_id = old.member_id
    ) stats
    where m.id = old.member_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger visits_refresh_member_stats
after insert or update or delete on public.visits
for each row execute function public.refresh_member_visit_stats();

create or replace function public.prevent_cycle_member_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.treatments t
    where t.id = new.treatment_id and t.member_id = new.member_id
  ) then
    raise exception 'service cycle member must match treatment member';
  end if;
  return new;
end;
$$;

create trigger service_cycles_member_match
before insert or update of treatment_id, member_id on public.service_cycles
for each row execute function public.prevent_cycle_member_mismatch();

create or replace function public.prevent_task_cycle_member_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_cycle_id is not null and not exists (
    select 1 from public.service_cycles c
    where c.id = new.service_cycle_id and c.member_id = new.member_id
  ) then
    raise exception 'task member must match service cycle member';
  end if;
  return new;
end;
$$;

create trigger tasks_cycle_member_match
before insert or update of service_cycle_id, member_id on public.tasks
for each row execute function public.prevent_task_cycle_member_mismatch();

create or replace view public.member_timeline
with (security_invoker = true)
as
select
  v.member_id,
  v.id as source_id,
  v.visit_date as event_date,
  'visit'::text as event_type,
  '已到诊'::text as display_status,
  false as is_historical
from public.visits v
union all
select
  t.member_id,
  t.id as source_id,
  t.due_date as event_date,
  t.task_type::text as event_type,
  case
    when t.status = 'pending' and t.due_date < (now() at time zone 'Asia/Shanghai')::date then '已逾期'
    when t.status = 'pending' and t.task_type = 'care_d0' then '待确认'
    when t.status = 'pending' then '待完成'
    when t.status = 'confirmed' then '已确认'
    when t.status = 'completed' then '已完成'
    when t.status = 'superseded' then '已被新周期覆盖'
    else '已取消'
  end as display_status,
  t.is_historical
from public.tasks t
union all
select
  g.member_id,
  g.id as source_id,
  make_date(g.gift_year, extract(month from m.birthday)::integer, least(extract(day from m.birthday)::integer, extract(day from (make_date(g.gift_year, extract(month from m.birthday)::integer, 1) + interval '1 month - 1 day'))::integer)) as event_date,
  'birthday_gift'::text as event_type,
  case g.status when 'pending_notification' then '待告知' when 'notified' then '已告知' else '已领取' end as display_status,
  false as is_historical
from public.birthday_gifts g
join public.members m on m.id = g.member_id
where m.birthday is not null
union all
select
  s.member_id,
  s.id as source_id,
  s.event_date,
  s.survey_type::text as event_type,
  case s.status when 'completed' then '已完成' else '待完成' end as display_status,
  false as is_historical
from public.survey_events s;

create or replace view public.dashboard_live_metrics
with (security_invoker = true)
as
with business_day as (
  select (now() at time zone 'Asia/Shanghai')::date as today
), task_stats as (
  select
    count(*) filter (
      where status in ('completed', 'confirmed')
        and task_type in ('care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30')
        and not is_historical
    ) as completed_service_tasks,
    count(*) filter (
      where status not in ('cancelled', 'superseded')
        and task_type in ('care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30')
        and not is_historical
    ) as eligible_service_tasks,
    count(*) filter (where status = 'pending' and due_date < bd.today and not is_historical) as overdue_tasks
  from public.tasks cross join business_day bd
), visit_stats as (
  select count(distinct v.member_id) as monthly_visit_members
  from public.visits v cross join business_day bd
  where v.visit_date >= date_trunc('month', bd.today)::date and v.visit_date <= bd.today
)
select
  (select count(*) from public.members where not is_archived) as total_members,
  vs.monthly_visit_members,
  case when ts.eligible_service_tasks = 0 then 0
    else round(ts.completed_service_tasks::numeric * 100 / ts.eligible_service_tasks, 1)
  end as service_completion_rate,
  ts.overdue_tasks
from task_stats ts cross join visit_stats vs;

create or replace view public.member_level_summary
with (security_invoker = true)
as
select level, count(*)::integer as member_count
from public.members
where not is_archived
group by level;

create or replace view public.monthly_visit_trend
with (security_invoker = true)
as
select
  date_trunc('month', v.visit_date)::date as month,
  count(distinct v.member_id)::integer as member_count,
  count(*)::integer as visit_count
from public.visits v
group by date_trunc('month', v.visit_date)::date;

commit;

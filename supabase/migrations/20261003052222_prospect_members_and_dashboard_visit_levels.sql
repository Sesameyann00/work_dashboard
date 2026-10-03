begin;

create type public.member_kind as enum ('prospect', 'member');

alter table public.members
  add column member_kind public.member_kind not null default 'member',
  add column prospect_converted_at timestamptz;

create index members_kind_idx
on public.members(member_kind)
where not is_archived;

create or replace function public.set_prospect_conversion_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.member_kind = 'prospect' and new.member_kind = 'member' then
    new.prospect_converted_at := coalesce(new.prospect_converted_at, now());
  elsif new.member_kind = 'prospect' then
    new.prospect_converted_at := null;
  end if;
  return new;
end
$$;

create trigger members_set_prospect_conversion_time
before update of member_kind on public.members
for each row execute function public.set_prospect_conversion_time();

create or replace view public.monthly_visit_level_counts
with (security_invoker = true)
as
with levels as (
  select unnest(enum_range(null::public.member_level)) as level
), business_day as (
  select (now() at time zone 'Asia/Shanghai')::date as today
)
select l.level,
  count(distinct v.member_id)::integer as member_count
from levels l
cross join business_day bd
left join public.members m
  on m.level = l.level
  and m.member_kind = 'member'
  and not m.is_archived
left join public.visits v
  on v.member_id = m.id
  and v.visit_date >= date_trunc('month', bd.today)::date
  and v.visit_date <= bd.today
group by l.level
order by l.level;

create or replace view public.member_level_summary
with (security_invoker = true)
as
select level, count(*)::integer as member_count
from public.members
where not is_archived and member_kind = 'member'
group by level;

create or replace view public.monthly_visit_trend
with (security_invoker = true)
as
select
  date_trunc('month', v.visit_date)::date as month,
  count(distinct v.member_id)::integer as member_count,
  count(*)::integer as visit_count
from public.visits v
join public.members m on m.id = v.member_id
where m.member_kind = 'member' and not m.is_archived
group by date_trunc('month', v.visit_date)::date;

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
      where status not in ('cancelled', 'superseded', 'archived')
        and task_type in ('care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30')
        and not is_historical
    ) as eligible_service_tasks,
    count(*) filter (where status = 'pending' and due_date < bd.today and not is_historical) as overdue_tasks
  from public.tasks cross join business_day bd
), visit_stats as (
  select count(distinct v.member_id) as monthly_visit_members
  from public.visits v
  join public.members m on m.id = v.member_id
  cross join business_day bd
  where m.member_kind = 'member'
    and not m.is_archived
    and v.visit_date >= date_trunc('month', bd.today)::date
    and v.visit_date <= bd.today
)
select
  (select count(*) from public.members where not is_archived and member_kind = 'member') as total_members,
  vs.monthly_visit_members,
  case when ts.eligible_service_tasks = 0 then 0
    else round(ts.completed_service_tasks::numeric * 100 / ts.eligible_service_tasks, 1)
  end as service_completion_rate,
  ts.overdue_tasks,
  (select count(*) from public.members where not is_archived and member_kind = 'prospect') as prospect_count,
  (select count(*) from public.members
    where not is_archived and member_kind = 'member'
      and prospect_converted_at >= date_trunc('month', bd.today)::timestamptz
      and prospect_converted_at < (date_trunc('month', bd.today) + interval '1 month')::timestamptz
  ) as prospect_converted_this_month
from task_stats ts cross join visit_stats vs cross join business_day bd;

create or replace function public.create_treatment_cycle(target_member_id uuid, target_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_treatment_id uuid;
  new_cycle_id uuid;
  old_cycle record;
  target_kind public.member_kind;
  offsets int[] := array[0,1,3,7,15,30];
  names public.task_type[] := array['care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30']::public.task_type[];
  i int;
begin
  if public.current_app_role() not in ('management', 'member_admin') then raise exception 'not authorized'; end if;
  select member_kind into target_kind from public.members where id = target_member_id and not is_archived;
  if target_kind is null then raise exception 'member not found'; end if;
  select id into new_treatment_id from public.treatments where member_id=target_member_id and treatment_date=target_date;
  if new_treatment_id is not null then return new_treatment_id; end if;
  insert into public.treatments(member_id, treatment_date, created_by)
  values(target_member_id, target_date, auth.uid())
  returning id into new_treatment_id;
  insert into public.visits(member_id, visit_date, source, source_treatment_id, created_by)
  values(target_member_id, target_date, 'treatment', new_treatment_id, auth.uid())
  on conflict(member_id, visit_date) do nothing;

  if target_kind = 'member' then
    for old_cycle in select id from public.service_cycles where member_id = target_member_id and status = 'active' loop
      update public.tasks set status='superseded', superseded_by_treatment_id=new_treatment_id
      where service_cycle_id=old_cycle.id and status='pending';
      update public.service_cycles set status='superseded', superseded_by_treatment_id=new_treatment_id where id=old_cycle.id;
    end loop;
    insert into public.service_cycles(treatment_id, member_id) values(new_treatment_id, target_member_id)
    on conflict(treatment_id) do update set treatment_id=excluded.treatment_id returning id into new_cycle_id;
    for i in 1..array_length(offsets,1) loop
      insert into public.tasks(member_id, service_cycle_id, task_type, due_date)
      values(target_member_id,new_cycle_id,names[i],target_date+offsets[i]) on conflict do nothing;
    end loop;
  end if;

  perform public.write_audit(
    'treatment', new_treatment_id,
    case when target_kind = 'prospect' then 'create_prospect_treatment_without_followup' else 'create_cycle' end,
    null, jsonb_build_object('member_id',target_member_id,'date',target_date,'member_kind',target_kind)
  );
  return new_treatment_id;
end
$$;

create or replace function public.generate_daily_tasks(run_date date default (now() at time zone 'Asia/Shanghai')::date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare birthday_count int:=0; validity_count int:=0; reminder_count int:=0;
begin
  if extract(day from run_date)=1 then
    insert into public.birthday_gifts(member_id,gift_year)
    select id,extract(year from run_date)::smallint from public.members
    where not is_archived and member_kind = 'member' and birthday is not null
      and extract(month from birthday)=extract(month from run_date)
    on conflict do nothing;
    insert into public.tasks(member_id,task_type,due_date,source_year)
    select id,'birthday_notify',run_date,extract(year from run_date)::smallint from public.members
    where not is_archived and member_kind = 'member' and birthday is not null
      and extract(month from birthday)=extract(month from run_date)
    on conflict do nothing;
    get diagnostics birthday_count=row_count;
  end if;
  if extract(day from run_date)=25 then
    insert into public.tasks(member_id,task_type,due_date,source_year)
    select g.member_id,'birthday_unclaimed',run_date,g.gift_year
    from public.birthday_gifts g
    join public.members m on m.id = g.member_id
    where g.gift_year=extract(year from run_date) and g.status<>'claimed'
      and m.member_kind = 'member' and not m.is_archived
    on conflict do nothing;
    get diagnostics reminder_count=row_count;
  end if;
  insert into public.tasks(member_id,task_type,due_date,source_valid_until)
  select m.id,
    case (m.valid_until-run_date)
      when 90 then 'validity_90d'::public.task_type
      when 30 then 'validity_30d'::public.task_type
      else 'validity_7d'::public.task_type
    end,
    run_date,m.valid_until
  from public.members m
  where not m.is_archived and (m.valid_until-run_date) in (90,30,7)
  on conflict do nothing;
  get diagnostics validity_count=row_count;
  return jsonb_build_object('birthday',birthday_count,'birthday_reminders',reminder_count,'validity',validity_count,'run_date',run_date);
end
$$;

drop function if exists public.process_task_batch(uuid[]);
create function public.process_task_batch(target_task_ids uuid[], target_status text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_role public.app_role;
  requested_count integer;
  eligible_count integer;
  changed integer;
  processed public.tasks;
begin
  app_role := public.current_app_role();
  if app_role not in ('management', 'member_admin', 'head_nurse') then raise exception 'not authorized'; end if;
  if target_status not in ('completed', 'archived') then raise exception 'invalid target status'; end if;

  select count(distinct task_id) into requested_count from unnest(target_task_ids) as task_id;
  if requested_count = 0 then raise exception 'no tasks selected'; end if;

  select count(*) into eligible_count
  from public.tasks
  where id = any(target_task_ids)
    and status = 'pending'
    and (
      app_role = 'management'
      or (app_role = 'member_admin' and task_type <> 'care_d0')
      or (app_role = 'head_nurse' and task_type = 'care_d0')
    );
  if eligible_count <> requested_count then raise exception 'one or more tasks cannot be processed'; end if;

  for processed in
    update public.tasks
    set status = target_status::public.task_status,
        completed_at = case when target_status = 'completed' then now() else null end,
        completed_by = case when target_status = 'completed' then auth.uid() else null end,
        updated_at = now()
    where id = any(target_task_ids)
    returning *
  loop
    perform public.write_audit('task', processed.id, 'batch_' || target_status, null, to_jsonb(processed));
  end loop;
  changed := eligible_count;
  return changed;
end
$$;

revoke all on function public.set_prospect_conversion_time() from public, anon, authenticated;
revoke all on function public.create_treatment_cycle(uuid,date) from public, anon;
revoke all on function public.generate_daily_tasks(date) from public, anon, authenticated;
revoke all on function public.process_task_batch(uuid[],text) from public, anon;
grant execute on function public.create_treatment_cycle(uuid,date) to authenticated;
grant execute on function public.process_task_batch(uuid[],text) to authenticated;
grant select on public.monthly_visit_level_counts, public.member_level_summary, public.monthly_visit_trend to authenticated;

commit;

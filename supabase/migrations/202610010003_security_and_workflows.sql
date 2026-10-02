begin;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and is_enabled $$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists(select 1 from public.profiles where id = auth.uid() and is_enabled) $$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.visits enable row level security;
alter table public.treatments enable row level security;
alter table public.service_cycles enable row level security;
alter table public.tasks enable row level security;
alter table public.birthday_gifts enable row level security;
alter table public.membership_validity_changes enable row level security;
alter table public.survey_events enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.audit_logs enable row level security;
alter table public.daily_metrics enable row level security;

create policy profiles_read_self_or_management on public.profiles for select to authenticated
using (id = auth.uid() or public.current_app_role() = 'management');

create policy members_read_active_users on public.members for select to authenticated
using (public.is_active_user());
create policy members_write_member_admin on public.members for all to authenticated
using (public.current_app_role() = 'member_admin')
with check (public.current_app_role() = 'member_admin');

create policy visits_read_active_users on public.visits for select to authenticated using (public.is_active_user());
create policy treatments_read_active_users on public.treatments for select to authenticated using (public.is_active_user());
create policy treatments_write_member_admin on public.treatments for all to authenticated
using (public.current_app_role() = 'member_admin') with check (public.current_app_role() = 'member_admin');

create policy cycles_read_active_users on public.service_cycles for select to authenticated using (public.is_active_user());
create policy cycles_write_member_admin on public.service_cycles for all to authenticated
using (public.current_app_role() = 'member_admin') with check (public.current_app_role() = 'member_admin');

create policy tasks_read_active_users on public.tasks for select to authenticated using (public.is_active_user());

create policy gifts_read_active_users on public.birthday_gifts for select to authenticated using (public.is_active_user());
create policy gifts_write_member_admin on public.birthday_gifts for all to authenticated
using (public.current_app_role() = 'member_admin') with check (public.current_app_role() = 'member_admin');

create policy validity_changes_read_active_users on public.membership_validity_changes for select to authenticated using (public.is_active_user());
create policy surveys_read_active_users on public.survey_events for select to authenticated using (public.is_active_user());
create policy surveys_write_member_admin on public.survey_events for all to authenticated
using (public.current_app_role() = 'member_admin') with check (public.current_app_role() = 'member_admin');

create policy imports_member_admin on public.import_batches for all to authenticated
using (public.current_app_role() = 'member_admin') with check (public.current_app_role() = 'member_admin');
create policy import_rows_member_admin on public.import_rows for all to authenticated
using (public.current_app_role() = 'member_admin') with check (public.current_app_role() = 'member_admin');

create policy audit_management_read on public.audit_logs for select to authenticated
using (public.current_app_role() = 'management');
create policy metrics_active_users_read on public.daily_metrics for select to authenticated using (public.is_active_user());

create or replace function public.write_audit(
  entity_type text, entity_id uuid, action text, before_data jsonb default null, after_data jsonb default null
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, before_data, after_data)
  values (auth.uid(), entity_type, entity_id, action, before_data, after_data)
$$;
revoke all on function public.write_audit(text, uuid, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.create_treatment_cycle(target_member_id uuid, target_date date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_treatment_id uuid; new_cycle_id uuid; old_cycle record; offsets int[] := array[0,1,3,7,15,30]; names public.task_type[] := array['care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30']::public.task_type[]; i int;
begin
  if public.current_app_role() <> 'member_admin' then raise exception 'not authorized'; end if;
  select id into new_treatment_id from public.treatments where member_id=target_member_id and treatment_date=target_date;
  if new_treatment_id is not null then return new_treatment_id; end if;
  insert into public.treatments(member_id, treatment_date, created_by)
  values(target_member_id, target_date, auth.uid())
  returning id into new_treatment_id;
  insert into public.visits(member_id, visit_date, source, source_treatment_id, created_by)
  values(target_member_id, target_date, 'treatment', new_treatment_id, auth.uid())
  on conflict(member_id, visit_date) do nothing;
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
  perform public.write_audit('treatment', new_treatment_id, 'create_cycle', null, jsonb_build_object('member_id',target_member_id,'date',target_date));
  return new_treatment_id;
end $$;

create or replace function public.complete_task(target_task_id uuid)
returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare result public.tasks;
begin
  if public.current_app_role() <> 'member_admin' then raise exception 'not authorized'; end if;
  update public.tasks set status='completed', completed_at=now(), completed_by=auth.uid()
  where id=target_task_id and task_type <> 'care_d0' and status='pending' returning * into result;
  if result.id is null then raise exception 'task cannot be completed'; end if;
  perform public.write_audit('task', result.id, 'complete', null, to_jsonb(result)); return result;
end $$;

create or replace function public.confirm_d0(target_task_ids uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if public.current_app_role() <> 'head_nurse' then raise exception 'not authorized'; end if;
  update public.tasks set status='confirmed', completed_at=now(), completed_by=auth.uid()
  where id=any(target_task_ids) and task_type='care_d0' and status='pending';
  get diagnostics changed = row_count;
  return changed;
end $$;

create or replace function public.update_member_validity(target_member_id uuid, target_valid_until date)
returns public.members
language plpgsql security definer set search_path = '' as $$
declare old_date date; result public.members;
begin
  if public.current_app_role() <> 'member_admin' then raise exception 'not authorized'; end if;
  select valid_until into old_date from public.members where id=target_member_id for update;
  if old_date is not distinct from target_valid_until then raise exception 'validity date is unchanged'; end if;
  insert into public.membership_validity_changes(member_id,old_valid_until,new_valid_until,changed_by)
  values(target_member_id,old_date,target_valid_until,auth.uid());
  update public.members set valid_until=target_valid_until,updated_by=auth.uid() where id=target_member_id returning * into result;
  update public.tasks set status='superseded' where member_id=target_member_id and source_valid_until=old_date and status='pending';
  perform public.write_audit('member',target_member_id,'update_validity',jsonb_build_object('valid_until',old_date),jsonb_build_object('valid_until',target_valid_until));
  return result;
end $$;

create or replace function public.generate_daily_tasks(run_date date default (now() at time zone 'Asia/Shanghai')::date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare birthday_count int:=0; validity_count int:=0; reminder_count int:=0;
begin
  if extract(day from run_date)=1 then
    insert into public.birthday_gifts(member_id,gift_year)
    select id,extract(year from run_date)::smallint from public.members
    where not is_archived and birthday is not null and extract(month from birthday)=extract(month from run_date)
    on conflict do nothing;
    insert into public.tasks(member_id,task_type,due_date,source_year)
    select id,'birthday_notify',run_date,extract(year from run_date)::smallint from public.members
    where not is_archived and birthday is not null and extract(month from birthday)=extract(month from run_date)
    on conflict do nothing;
    get diagnostics birthday_count=row_count;
  end if;
  if extract(day from run_date)=25 then
    insert into public.tasks(member_id,task_type,due_date,source_year)
    select g.member_id,'birthday_unclaimed',run_date,g.gift_year from public.birthday_gifts g
    where g.gift_year=extract(year from run_date) and g.status<>'claimed'
    on conflict do nothing;
    get diagnostics reminder_count=row_count;
  end if;
  insert into public.tasks(member_id,task_type,due_date,source_valid_until)
  select m.id, case (m.valid_until-run_date) when 90 then 'validity_90d'::public.task_type when 30 then 'validity_30d'::public.task_type else 'validity_7d'::public.task_type end, run_date,m.valid_until
  from public.members m where not m.is_archived and (m.valid_until-run_date) in (90,30,7)
  on conflict do nothing;
  get diagnostics validity_count=row_count;
  return jsonb_build_object('birthday',birthday_count,'birthday_reminders',reminder_count,'validity',validity_count,'run_date',run_date);
end $$;

create or replace function public.refresh_daily_metrics(run_date date default (now() at time zone 'Asia/Shanghai')::date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.daily_metrics(metric_date,total_members,visit_members,visits_total,service_tasks_due,service_tasks_done,overdue_tasks,level_counts)
  select run_date,
    (select count(*) from public.members where not is_archived),
    (select count(distinct member_id) from public.visits where visit_date=run_date),
    (select count(*) from public.visits where visit_date=run_date),
    (select count(*) from public.tasks where due_date=run_date and not is_historical and status not in ('cancelled','superseded')),
    (select count(*) from public.tasks where due_date=run_date and not is_historical and status in ('completed','confirmed')),
    (select count(*) from public.tasks where due_date<run_date and not is_historical and status='pending'),
    (select jsonb_object_agg(level,qty) from (select level::text level,count(*) qty from public.members where not is_archived group by level) x)
  on conflict(metric_date) do update set total_members=excluded.total_members,visit_members=excluded.visit_members,visits_total=excluded.visits_total,service_tasks_due=excluded.service_tasks_due,service_tasks_done=excluded.service_tasks_done,overdue_tasks=excluded.overdue_tasks,level_counts=excluded.level_counts,calculated_at=now();
end $$;

grant execute on function public.create_treatment_cycle(uuid,date) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.confirm_d0(uuid[]) to authenticated;
grant execute on function public.update_member_validity(uuid,date) to authenticated;
revoke all on function public.generate_daily_tasks(date) from public,anon,authenticated;
revoke all on function public.refresh_daily_metrics(date) from public,anon,authenticated;

commit;

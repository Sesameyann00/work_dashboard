begin;

delete from public.tasks t
using public.members m
where t.member_id = m.id
  and m.member_kind = 'prospect'
  and t.task_type in ('care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30');

delete from public.service_cycles c
using public.members m
where c.member_id = m.id
  and m.member_kind = 'prospect';

delete from public.visits v
using public.members m
where v.member_id = m.id
  and m.member_kind = 'prospect';

delete from public.treatments t
using public.members m
where t.member_id = m.id
  and m.member_kind = 'prospect';

create or replace function public.reject_prospect_visit_data()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.members m
    where m.id = new.member_id
      and m.member_kind = 'prospect'
  ) then
    raise exception '准会员不生成到诊记录或回访提醒';
  end if;
  return new;
end
$$;

drop trigger if exists treatments_reject_prospects on public.treatments;
create trigger treatments_reject_prospects
before insert or update of member_id on public.treatments
for each row execute function public.reject_prospect_visit_data();

drop trigger if exists visits_reject_prospects on public.visits;
create trigger visits_reject_prospects
before insert or update of member_id on public.visits
for each row execute function public.reject_prospect_visit_data();

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
  if target_kind = 'prospect' then raise exception '准会员不生成到诊记录或回访提醒'; end if;

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

  perform public.write_audit(
    'treatment', new_treatment_id, 'create_cycle', null,
    jsonb_build_object('member_id',target_member_id,'date',target_date,'member_kind',target_kind)
  );
  return new_treatment_id;
end
$$;

revoke all on function public.reject_prospect_visit_data() from public, anon, authenticated;
revoke all on function public.create_treatment_cycle(uuid,date) from public, anon;
grant execute on function public.create_treatment_cycle(uuid,date) to authenticated;

commit;

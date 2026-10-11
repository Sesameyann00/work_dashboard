begin;

create or replace function public.delete_treatment_record(target_treatment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_treatment public.treatments;
  target_cycle public.service_cycles;
  restored_cycle_id uuid;
  replacement_treatment_id uuid;
begin
  if public.current_app_role() not in ('management', 'member_admin') then
    raise exception 'not authorized';
  end if;

  select * into target_treatment
  from public.treatments
  where id = target_treatment_id
  for update;

  if target_treatment.id is null then
    raise exception 'treatment record not found';
  end if;

  select * into target_cycle
  from public.service_cycles
  where treatment_id = target_treatment_id
  for update;

  if target_cycle.id is not null then
    replacement_treatment_id := target_cycle.superseded_by_treatment_id;

    if target_cycle.status = 'active' then
      delete from public.tasks where service_cycle_id = target_cycle.id;
      delete from public.service_cycles where id = target_cycle.id;

      update public.service_cycles
      set status = 'active', superseded_by_treatment_id = null
      where superseded_by_treatment_id = target_treatment_id
      returning id into restored_cycle_id;

      update public.tasks
      set status = case when due_date < date '2026-10-01' then 'archived'::public.task_status else 'pending'::public.task_status end,
          superseded_by_treatment_id = null,
          completed_at = null,
          completed_by = null
      where superseded_by_treatment_id = target_treatment_id
        and status = 'superseded';
    else
      update public.service_cycles
      set superseded_by_treatment_id = replacement_treatment_id
      where superseded_by_treatment_id = target_treatment_id;

      update public.tasks
      set superseded_by_treatment_id = replacement_treatment_id
      where superseded_by_treatment_id = target_treatment_id;

      delete from public.tasks where service_cycle_id = target_cycle.id;
      delete from public.service_cycles where id = target_cycle.id;
    end if;
  end if;

  delete from public.visits where source_treatment_id = target_treatment_id;
  delete from public.treatments where id = target_treatment_id;

  perform public.write_audit(
    'treatment',
    target_treatment_id,
    'delete_record',
    to_jsonb(target_treatment),
    jsonb_build_object('restored_cycle_id', restored_cycle_id)
  );

  return jsonb_build_object(
    'id', target_treatment_id,
    'member_id', target_treatment.member_id,
    'treatment_date', target_treatment.treatment_date,
    'restored_cycle_id', restored_cycle_id
  );
end
$$;

revoke all on function public.delete_treatment_record(uuid) from public, anon;
grant execute on function public.delete_treatment_record(uuid) to authenticated;

commit;

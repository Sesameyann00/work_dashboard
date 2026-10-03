begin;

create or replace function public.process_task_batch(target_task_ids uuid[])
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
  if app_role not in ('management', 'member_admin', 'head_nurse') then
    raise exception 'not authorized';
  end if;

  select count(distinct task_id) into requested_count
  from unnest(target_task_ids) as task_id;
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

  if eligible_count <> requested_count then
    raise exception 'one or more tasks cannot be processed';
  end if;

  for processed in
    update public.tasks
    set status = case when task_type = 'care_d0' then 'confirmed'::public.task_status else 'completed'::public.task_status end,
        completed_at = now(),
        completed_by = auth.uid()
    where id = any(target_task_ids)
    returning *
  loop
    perform public.write_audit('task', processed.id, 'batch_process', null, to_jsonb(processed));
  end loop;

  changed := eligible_count;
  return changed;
end
$$;

revoke all on function public.process_task_batch(uuid[]) from public, anon;
grant execute on function public.process_task_batch(uuid[]) to authenticated;

commit;

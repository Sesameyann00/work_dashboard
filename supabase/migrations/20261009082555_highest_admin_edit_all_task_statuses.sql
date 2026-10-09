begin;

create or replace function public.admin_set_task_statuses(
  target_task_ids uuid[],
  target_status text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
  changed_count integer;
  before_task public.tasks;
  after_task public.tasks;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and username = '002' and is_enabled
  ) then
    raise exception 'only the highest administrator can edit all task statuses';
  end if;

  if target_status not in ('completed', 'archived', 'cancelled') then
    raise exception 'invalid target status';
  end if;

  select count(distinct task_id) into requested_count
  from unnest(target_task_ids) as task_id;
  if requested_count = 0 then raise exception 'no tasks selected'; end if;

  if (select count(*) from public.tasks where id = any(target_task_ids)) <> requested_count then
    raise exception 'one or more tasks do not exist';
  end if;

  for before_task in
    select * from public.tasks where id = any(target_task_ids) for update
  loop
    update public.tasks
    set status = target_status::public.task_status,
        completed_at = case when target_status = 'completed' then now() else null end,
        completed_by = case when target_status = 'completed' then auth.uid() else null end,
        updated_at = now()
    where id = before_task.id
    returning * into after_task;

    perform public.write_audit(
      'task', after_task.id, 'highest_admin_set_' || target_status,
      to_jsonb(before_task), to_jsonb(after_task)
    );
  end loop;

  get diagnostics changed_count = row_count;
  return requested_count;
end
$$;

revoke all on function public.admin_set_task_statuses(uuid[], text) from public, anon;
grant execute on function public.admin_set_task_statuses(uuid[], text) to authenticated;

commit;

begin;

update public.members
set has_service_group = true
where not is_archived
  and member_kind = 'member'
  and created_at < timestamptz '2026-10-20 00:00:00+08';

create unique index if not exists tasks_member_group_setup_unique
  on public.tasks (member_id, task_type)
  where task_type = 'member_group_setup';

create or replace function public.sync_member_group_setup_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shanghai_today date := (now() at time zone 'Asia/Shanghai')::date;
  task_due_date date;
begin
  if new.is_archived or new.member_kind <> 'member' then
    update public.tasks
    set status = 'archived', updated_at = now()
    where member_id = new.id
      and task_type = 'member_group_setup'
      and status = 'pending';
    return new;
  end if;

  if tg_op = 'INSERT'
    or old.member_kind is distinct from new.member_kind
    or old.is_archived is distinct from new.is_archived
  then
    task_due_date := greatest(
      coalesce(new.membership_changed_on, new.joined_on, shanghai_today),
      date '2026-10-20'
    );

    insert into public.tasks(member_id, task_type, due_date)
    values(new.id, 'member_group_setup', task_due_date)
    on conflict do nothing;
  end if;

  return new;
end
$$;

drop trigger if exists members_sync_member_group_setup_task on public.members;
create trigger members_sync_member_group_setup_task
after insert or update of member_kind, is_archived on public.members
for each row execute function public.sync_member_group_setup_task();

revoke all on function public.sync_member_group_setup_task() from public, anon, authenticated;

commit;

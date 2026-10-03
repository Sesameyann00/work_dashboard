begin;

drop index if exists public.tasks_share_benefit_end_30d_unique;
drop index if exists public.tasks_share_benefit_end_7d_unique;
create unique index tasks_share_benefit_end_30d_unique
on public.tasks(member_id, task_type, due_date)
where task_type = 'share_benefit_end_30d';
create unique index tasks_share_benefit_end_7d_unique
on public.tasks(member_id, task_type, due_date)
where task_type = 'share_benefit_end_7d';

create or replace function public.sync_membership_cycle_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cycle_start date;
  expiry_date date;
  share_end_date date;
  cutoff constant date := date '2026-10-01';
begin
  cycle_start := new.membership_changed_on;

  update public.tasks set status = 'cancelled', updated_at = now()
  where member_id = new.id
    and task_type in (
      'share_benefit_expiry', 'share_benefit_day_30',
      'share_benefit_end_30d', 'share_benefit_end_15d', 'share_benefit_end_7d',
      'validity_90d', 'validity_30d', 'validity_7d'
    )
    and status = 'pending';

  if cycle_start is null then return new; end if;
  expiry_date := (cycle_start + interval '1 year')::date;
  share_end_date := (cycle_start + interval '3 months')::date;

  if share_end_date - 30 >= cutoff then
    insert into public.tasks(member_id, task_type, due_date, status)
    values(new.id, 'share_benefit_end_30d', share_end_date - 30, 'pending')
    on conflict(member_id, task_type, due_date) where task_type = 'share_benefit_end_30d' do update
    set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
        updated_at = now();
  end if;

  if share_end_date - 15 >= cutoff then
    insert into public.tasks(member_id, task_type, due_date, status)
    values(new.id, 'share_benefit_end_15d', share_end_date - 15, 'pending')
    on conflict(member_id, task_type, due_date) where task_type = 'share_benefit_end_15d' do update
    set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
        updated_at = now();
  end if;

  if share_end_date - 7 >= cutoff then
    insert into public.tasks(member_id, task_type, due_date, status)
    values(new.id, 'share_benefit_end_7d', share_end_date - 7, 'pending')
    on conflict(member_id, task_type, due_date) where task_type = 'share_benefit_end_7d' do update
    set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
        updated_at = now();
  end if;

  if expiry_date - 90 >= cutoff then
    insert into public.tasks(member_id, task_type, due_date, status, source_valid_until)
    values(new.id, 'validity_90d', expiry_date - 90, 'pending', expiry_date)
    on conflict(member_id, source_valid_until, task_type)
      where task_type in ('validity_90d', 'validity_30d', 'validity_7d')
    do update set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
      due_date = excluded.due_date, updated_at = now();
  end if;
  if expiry_date - 30 >= cutoff then
    insert into public.tasks(member_id, task_type, due_date, status, source_valid_until)
    values(new.id, 'validity_30d', expiry_date - 30, 'pending', expiry_date)
    on conflict(member_id, source_valid_until, task_type)
      where task_type in ('validity_90d', 'validity_30d', 'validity_7d')
    do update set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
      due_date = excluded.due_date, updated_at = now();
  end if;
  if expiry_date - 7 >= cutoff then
    insert into public.tasks(member_id, task_type, due_date, status, source_valid_until)
    values(new.id, 'validity_7d', expiry_date - 7, 'pending', expiry_date)
    on conflict(member_id, source_valid_until, task_type)
      where task_type in ('validity_90d', 'validity_30d', 'validity_7d')
    do update set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
      due_date = excluded.due_date, updated_at = now();
  end if;
  return new;
end
$$;

update public.tasks
set status = 'archived', updated_at = now()
where status = 'pending'
  and task_type in ('share_benefit_expiry', 'share_benefit_day_30');

update public.members
set membership_changed_on = membership_changed_on
where membership_changed_on is not null and not is_archived;

revoke all on function public.sync_membership_cycle_tasks() from public, anon, authenticated;

commit;

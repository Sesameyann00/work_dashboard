begin;

create or replace function public.sync_membership_cycle_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cycle_start date;
  expiry_date date;
begin
  cycle_start := new.membership_changed_on;

  update public.tasks set status = 'cancelled', updated_at = now()
  where member_id = new.id
    and task_type in (
      'share_benefit_expiry', 'share_benefit_day_30', 'share_benefit_end_15d',
      'validity_90d', 'validity_30d', 'validity_7d'
    )
    and status = 'pending';

  if cycle_start is null then return new; end if;
  expiry_date := (cycle_start + interval '1 year')::date;

  insert into public.tasks(member_id, task_type, due_date, status)
  values(new.id, 'share_benefit_day_30', cycle_start + 30, 'pending')
  on conflict(member_id, task_type, due_date) where task_type = 'share_benefit_day_30' do update
  set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
      updated_at = now();

  insert into public.tasks(member_id, task_type, due_date, status)
  values(new.id, 'share_benefit_end_15d', (cycle_start + interval '3 months')::date - 15, 'pending')
  on conflict(member_id, task_type, due_date) where task_type = 'share_benefit_end_15d' do update
  set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
      updated_at = now();

  insert into public.tasks(member_id, task_type, due_date, status, source_valid_until)
  values
    (new.id, 'validity_90d', expiry_date - 90, 'pending', expiry_date),
    (new.id, 'validity_30d', expiry_date - 30, 'pending', expiry_date),
    (new.id, 'validity_7d', expiry_date - 7, 'pending', expiry_date)
  on conflict(member_id, source_valid_until, task_type)
    where task_type in ('validity_90d', 'validity_30d', 'validity_7d')
  do update set status = case when public.tasks.status in ('completed', 'confirmed') then public.tasks.status else 'pending' end,
    due_date = excluded.due_date,
    updated_at = now();
  return new;
end
$$;

update public.members
set membership_changed_on = membership_changed_on
where membership_changed_on is not null and not is_archived;

revoke all on function public.sync_membership_cycle_tasks() from public, anon, authenticated;

commit;

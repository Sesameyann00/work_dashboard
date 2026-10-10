begin;

create or replace function public.set_membership_cycle_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.membership_changed_on is null then
    new.valid_until := null;
  elsif new.valid_until is null then
    new.valid_until := (new.membership_changed_on + interval '1 year')::date;
  end if;
  return new;
end
$$;

drop trigger if exists members_set_membership_cycle_dates on public.members;
create trigger members_set_membership_cycle_dates
before insert or update of membership_changed_on, valid_until on public.members
for each row execute function public.set_membership_cycle_dates();

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
  expiry_date := new.valid_until;

  update public.tasks set status = 'cancelled', updated_at = now()
  where member_id = new.id
    and task_type in (
      'share_benefit_expiry', 'share_benefit_day_30', 'share_benefit_end_15d',
      'validity_90d', 'validity_30d', 'validity_7d'
    )
    and status = 'pending';

  if cycle_start is not null then
    insert into public.tasks(member_id, task_type, due_date, status)
    values
      (new.id, 'share_benefit_day_30', cycle_start + 30, 'pending'),
      (new.id, 'share_benefit_end_15d', (cycle_start + interval '3 months')::date - 15, 'pending')
    on conflict do nothing;
  end if;

  if expiry_date is not null then
    insert into public.tasks(member_id, task_type, due_date, status, source_valid_until)
    values
      (new.id, 'validity_90d', expiry_date - 90, 'pending', expiry_date),
      (new.id, 'validity_30d', expiry_date - 30, 'pending', expiry_date),
      (new.id, 'validity_7d', expiry_date - 7, 'pending', expiry_date)
    on conflict do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists members_sync_membership_cycle_tasks on public.members;
create trigger members_sync_membership_cycle_tasks
after insert or update of membership_changed_on, valid_until on public.members
for each row execute function public.sync_membership_cycle_tasks();

revoke all on function public.set_membership_cycle_dates() from public, anon, authenticated;
revoke all on function public.sync_membership_cycle_tasks() from public, anon, authenticated;

create or replace function public.archive_member(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() not in ('member_admin', 'management') then
    raise exception 'insufficient permission to archive member';
  end if;

  update public.members
  set is_archived = true, updated_by = auth.uid(), updated_at = now()
  where id = target_member_id and not is_archived;

  if not found then
    raise exception 'member not found or already archived';
  end if;

  update public.tasks
  set status = 'cancelled', updated_at = now()
  where member_id = target_member_id and status = 'pending';

  perform public.write_audit(
    'member', target_member_id, 'archive',
    jsonb_build_object('is_archived', false),
    jsonb_build_object('is_archived', true)
  );
end
$$;

revoke all on function public.archive_member(uuid) from public, anon;
grant execute on function public.archive_member(uuid) to authenticated;

commit;

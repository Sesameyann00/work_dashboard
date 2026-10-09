create or replace function public.apply_member_creation_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.joined_on := coalesce(new.joined_on, current_date);
  new.membership_changed_on := coalesce(new.membership_changed_on, new.joined_on);
  if new.member_kind = 'prospect' then
    new.has_service_group := false;
  end if;
  return new;
end
$$;

drop trigger if exists members_apply_creation_defaults on public.members;
create trigger members_apply_creation_defaults
before insert on public.members
for each row execute function public.apply_member_creation_defaults();

revoke all on function public.apply_member_creation_defaults() from public, anon, authenticated;

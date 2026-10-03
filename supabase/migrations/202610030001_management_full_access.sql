begin;

drop policy if exists profiles_management_update on public.profiles;
create policy profiles_management_update on public.profiles for update to authenticated
using (public.current_app_role() = 'management')
with check (public.current_app_role() = 'management');

drop policy if exists members_write_member_admin on public.members;
create policy members_write_member_admin on public.members for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

drop policy if exists treatments_write_member_admin on public.treatments;
create policy treatments_write_member_admin on public.treatments for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

drop policy if exists cycles_write_member_admin on public.service_cycles;
create policy cycles_write_member_admin on public.service_cycles for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

drop policy if exists gifts_write_member_admin on public.birthday_gifts;
create policy gifts_write_member_admin on public.birthday_gifts for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

drop policy if exists surveys_write_member_admin on public.survey_events;
create policy surveys_write_member_admin on public.survey_events for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

drop policy if exists imports_member_admin on public.import_batches;
create policy imports_member_admin on public.import_batches for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

drop policy if exists import_rows_member_admin on public.import_rows;
create policy import_rows_member_admin on public.import_rows for all to authenticated
using (public.current_app_role() in ('member_admin', 'management'))
with check (public.current_app_role() in ('member_admin', 'management'));

do $$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'public.create_treatment_cycle(uuid,date)',
    'public.complete_task(uuid)',
    'public.update_member_validity(uuid,date)',
    'public.update_birthday_gift(uuid,public.gift_status)',
    'public.process_import_batch(uuid)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    definition := replace(
      definition,
      'public.current_app_role() <> ''member_admin''',
      'public.current_app_role() not in (''member_admin'', ''management'')'
    );
    execute definition;
  end loop;

  definition := pg_get_functiondef('public.confirm_d0(uuid[])'::regprocedure);
  definition := replace(
    definition,
    'public.current_app_role() <> ''head_nurse''',
    'public.current_app_role() not in (''head_nurse'', ''management'')'
  );
  execute definition;
end
$$;

revoke all on function public.create_treatment_cycle(uuid, date) from public, anon;
revoke all on function public.complete_task(uuid) from public, anon;
revoke all on function public.confirm_d0(uuid[]) from public, anon;
revoke all on function public.update_member_validity(uuid, date) from public, anon;
revoke all on function public.update_birthday_gift(uuid, public.gift_status) from public, anon;
revoke all on function public.process_import_batch(uuid) from public, anon;

grant execute on function public.create_treatment_cycle(uuid, date) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.confirm_d0(uuid[]) to authenticated;
grant execute on function public.update_member_validity(uuid, date) to authenticated;
grant execute on function public.update_birthday_gift(uuid, public.gift_status) to authenticated;
grant execute on function public.process_import_batch(uuid) to authenticated;

commit;

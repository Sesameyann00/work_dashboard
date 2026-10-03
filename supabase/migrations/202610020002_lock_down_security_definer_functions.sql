begin;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.create_treatment_cycle(uuid, date) from public, anon;
revoke all on function public.complete_task(uuid) from public, anon;
revoke all on function public.confirm_d0(uuid[]) from public, anon;
revoke all on function public.update_member_validity(uuid, date) from public, anon;
revoke all on function public.update_birthday_gift(uuid, public.gift_status) from public, anon;
revoke all on function public.process_import_batch(uuid) from public, anon;
revoke all on function public.sync_share_benefit_expiry_task() from public, anon, authenticated;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.create_treatment_cycle(uuid, date) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.confirm_d0(uuid[]) to authenticated;
grant execute on function public.update_member_validity(uuid, date) to authenticated;
grant execute on function public.update_birthday_gift(uuid, public.gift_status) to authenticated;
grant execute on function public.process_import_batch(uuid) to authenticated;

commit;

begin;

create or replace function public.get_management_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if public.current_app_role() <> 'management' then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'metrics', (select to_jsonb(m) from public.dashboard_live_metrics m),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('month', t.month, 'member_count', t.member_count) order by t.month) from public.monthly_visit_trend t), '[]'::jsonb),
    'level_visits', coalesce((select jsonb_agg(jsonb_build_object('level', l.level, 'member_count', l.member_count) order by l.level) from public.monthly_visit_level_counts l), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

revoke all on public.dashboard_live_metrics from authenticated;
revoke all on public.monthly_visit_trend from authenticated;
revoke all on public.monthly_visit_level_counts from authenticated;
revoke all on function public.get_management_dashboard() from public, anon;
grant execute on function public.get_management_dashboard() to authenticated;

commit;

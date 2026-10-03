begin;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.members,
  public.visits,
  public.treatments,
  public.service_cycles,
  public.tasks,
  public.birthday_gifts,
  public.membership_validity_changes,
  public.survey_events,
  public.import_batches,
  public.import_rows,
  public.audit_logs,
  public.daily_metrics
to authenticated;

revoke all on table
  public.profiles,
  public.members,
  public.visits,
  public.treatments,
  public.service_cycles,
  public.tasks,
  public.birthday_gifts,
  public.membership_validity_changes,
  public.survey_events,
  public.import_batches,
  public.import_rows,
  public.audit_logs,
  public.daily_metrics
from anon;

commit;

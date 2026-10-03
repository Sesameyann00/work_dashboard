begin;

with latest_treatment as (
  select distinct on (member_id) id, member_id, treatment_date
  from public.treatments
  where treatment_date + 30 >= date '2026-10-01'
  order by member_id, treatment_date desc
)
insert into public.service_cycles(treatment_id, member_id, status)
select id, member_id, 'active'
from latest_treatment
on conflict(treatment_id) do nothing;

with cycle_source as (
  select c.id as cycle_id, c.member_id, t.treatment_date
  from public.service_cycles c
  join public.treatments t on t.id = c.treatment_id
  where c.status = 'active' and t.treatment_date + 30 >= date '2026-10-01'
), schedule(task_type, day_offset) as (
  values
    ('care_d0'::public.task_type, 0),
    ('followup_d1'::public.task_type, 1),
    ('followup_d3'::public.task_type, 3),
    ('followup_d7'::public.task_type, 7),
    ('followup_d15'::public.task_type, 15),
    ('followup_d30'::public.task_type, 30)
)
insert into public.tasks(member_id, service_cycle_id, task_type, due_date, status, is_historical)
select c.member_id, c.cycle_id, s.task_type, c.treatment_date + s.day_offset, 'pending', true
from cycle_source c cross join schedule s
where c.treatment_date + s.day_offset >= date '2026-10-01'
on conflict do nothing;

commit;

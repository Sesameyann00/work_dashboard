-- The daily task generator already creates birthday_notify on day 1 and
-- birthday_unclaimed on day 25. Backfill the current month's day-1 tasks
-- when this rule is introduced after the first day of the month.
select public.generate_daily_tasks(
  date_trunc('month', (now() at time zone 'Asia/Shanghai'))::date
);

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'charmsway-generate-daily-tasks',
  '5 16 * * *',
  $$select public.generate_daily_tasks((now() at time zone 'Asia/Shanghai')::date)$$
);

select cron.schedule(
  'charmsway-refresh-daily-metrics',
  '20 16 * * *',
  $$select public.refresh_daily_metrics((now() at time zone 'Asia/Shanghai')::date)$$
);

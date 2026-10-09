import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const database = new PGlite()
const migrations = [
  'supabase/migrations/202610010001_core_schema.sql',
  'supabase/migrations/202610010002_views_and_triggers.sql',
  'supabase/migrations/202610010003_security_and_workflows.sql',
  'supabase/migrations/202610010005_import_and_gifts.sql',
  'supabase/migrations/202610010006_share_benefit_expiry.sql',
  'supabase/migrations/202610010007_member_consultant.sql',
  'supabase/migrations/202610020003_member_card_and_service_group.sql',
  'supabase/migrations/20261009081555_share_member_guest_card_day_one.sql',
  'supabase/migrations/20261009081612_schedule_share_member_guest_card_day_one.sql',
  'supabase/migrations/20261009082555_highest_admin_edit_all_task_statuses.sql',
]

async function expectFailure(label, action) {
  try {
    await action()
    throw new Error(`${label}: expected the database to reject the operation`)
  } catch (error) {
    if (String(error).includes('expected the database')) throw error
  }
}

await database.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique
  );
  create function auth.uid() returns uuid language sql stable
  as $$ select '90000000-0000-0000-0000-000000000001'::uuid $$;
`)

for (const migration of migrations) {
  const sql = (await readFile(migration, 'utf8'))
    // Supabase ships pgcrypto; PGlite already provides gen_random_uuid but not the extension package.
    .replace('create extension if not exists pgcrypto;', '')
  await database.exec(sql)
}
await database.exec(await readFile('supabase/seed.sql', 'utf8'))
await database.exec(`
  insert into auth.users(id,email) values
    ('90000000-0000-0000-0000-000000000001','manager@auth.charmsway.internal');
  insert into public.profiles(id,username,display_name,role,is_enabled)
  values ('90000000-0000-0000-0000-000000000001','manager','测试主管','member_admin',true);
  grant usage on schema public to authenticated;
  grant select,insert,update,delete on all tables in schema public to authenticated;
`)

const tables = await database.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
`)
const expectedTables = [
  'profiles', 'members', 'visits', 'treatments', 'service_cycles', 'tasks',
  'birthday_gifts', 'membership_validity_changes', 'survey_events',
  'import_batches', 'import_rows', 'audit_logs', 'daily_metrics',
]
for (const name of expectedTables) {
  if (!tables.rows.some((row) => row.table_name === name)) throw new Error(`missing table: ${name}`)
}

const members = await database.query(`
  select name, normalized_phone, member_card_number, consultant,
    has_service_group, last_visit_date::text, visit_count
  from public.members order by name
`)
if (members.rows.length !== 5) throw new Error('seed should create five members')
const zhou = members.rows.find((row) => row.name === '周女士')
if (zhou.normalized_phone !== '13800000003') throw new Error('phone normalization failed')
const lin = members.rows.find((row) => row.name === '林女士')
if (lin.consultant !== '张顾问') throw new Error('member consultant field failed')
if (!/^QZW[0-9]{10}$/.test(lin.member_card_number)) throw new Error('member card number generation failed')
if (new Set(members.rows.map((row) => row.member_card_number)).size !== 5) throw new Error('member card numbers must be unique')
if (lin.has_service_group !== false) throw new Error('service group should default to false')
if (lin.visit_count !== 2 || lin.last_visit_date !== '2026-09-28') throw new Error('visit aggregate trigger failed')
const shareExpiry = await database.query(`
  select due_date::text from public.tasks
  where member_id='10000000-0000-0000-0000-000000000001' and task_type='share_benefit_expiry'
`)
if (shareExpiry.rows[0]?.due_date !== '2023-06-12') throw new Error('share benefit expiry should be three months after joining')
await database.exec(`update public.members set joined_on='2023-04-30' where id='10000000-0000-0000-0000-000000000001'`)
const adjustedShareExpiry = await database.query(`
  select due_date::text from public.tasks
  where member_id='10000000-0000-0000-0000-000000000001' and task_type='share_benefit_expiry'
`)
if (adjustedShareExpiry.rows[0]?.due_date !== '2023-07-30') throw new Error('share benefit expiry did not follow changed joining date')

await database.exec(`
  update public.members set joined_on='2026-10-08'
  where id='10000000-0000-0000-0000-000000000002'
`)
const guestCardTask = await database.query(`
  select due_date::text from public.tasks
  where member_id='10000000-0000-0000-0000-000000000002'
    and task_type='share_benefit_guest_card_day_1'
    and status='pending'
`)
if (guestCardTask.rows[0]?.due_date !== '2026-10-09') throw new Error('guest card task should be due one day after joining')

await database.exec(`set role authenticated; insert into public.members(name,phone,level) values('RLS测试','13900000001','V1'); reset role;`)
await database.exec(`delete from public.members where phone='13900000001'; update public.profiles set role='management' where id=auth.uid();`)
await expectFailure('management writes blocked by RLS', () => database.exec(`set role authenticated; insert into public.members(name,phone,level) values('越权写入','13900000002','V1')`))
await database.exec(`reset role; update public.profiles set role='member_admin' where id=auth.uid();`)

await expectFailure('duplicate normalized phone', () => database.exec(`
  insert into public.members (name, phone, level) values ('重复会员', '+86 138-0000-0001', 'V1')
`))
await expectFailure('invalid member level', () => database.exec(`
  insert into public.members (name, phone, level) values ('错误等级', '13900009999', 'VIP')
`))
await expectFailure('duplicate service task', () => database.exec(`
  insert into public.tasks (member_id, service_cycle_id, task_type, due_date)
  values ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'care_d0', '2026-10-01')
`))
await expectFailure('cycle member mismatch', () => database.exec(`
  insert into public.service_cycles (treatment_id, member_id)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005')
`))

const timeline = await database.query(`select count(*)::integer as count from public.member_timeline`)
if (timeline.rows[0].count < 10) throw new Error('timeline view did not merge all event sources')
const metrics = await database.query(`select * from public.dashboard_live_metrics`)
if (metrics.rows.length !== 1 || metrics.rows[0].total_members !== 5) throw new Error('dashboard metrics view failed')

const workflow = await database.query(`
  select public.create_treatment_cycle('10000000-0000-0000-0000-000000000005', '2026-10-01') as treatment_id
`)
const generatedTasks = await database.query(`
  select count(*)::integer as count from public.tasks
  where member_id='10000000-0000-0000-0000-000000000005' and service_cycle_id is not null
`)
if (!workflow.rows[0].treatment_id || generatedTasks.rows[0].count !== 6) throw new Error('treatment workflow did not generate six tasks')
await database.query(`select public.create_treatment_cycle('10000000-0000-0000-0000-000000000005', '2026-10-01')`)
const afterRetry = await database.query(`
  select count(*)::integer as count from public.tasks
  where member_id='10000000-0000-0000-0000-000000000005' and service_cycle_id is not null
`)
if (afterRetry.rows[0].count !== 6) throw new Error('treatment workflow is not idempotent')

await database.exec(`
  insert into public.treatments(id,member_id,treatment_date,is_historical)
  values ('20000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000005','2026-08-01',true);
  insert into public.visits (member_id, visit_date, source, source_treatment_id)
  values ('10000000-0000-0000-0000-000000000005', '2026-08-01', 'treatment','20000000-0000-0000-0000-000000000099');
  delete from public.visits
  where member_id = '10000000-0000-0000-0000-000000000005' and visit_date = '2026-08-01';
`)
const refreshed = await database.query(`
  select last_visit_date::text, visit_count from public.members
  where id = '10000000-0000-0000-0000-000000000005'
`)
if (refreshed.rows[0].last_visit_date !== '2026-10-01' || refreshed.rows[0].visit_count !== 1) {
  throw new Error('visit delete did not refresh member aggregates')
}

console.log(`Database verified: ${expectedTables.length} tables, ${timeline.rows[0].count} timeline events, constraints and triggers passed.`)
await database.close()

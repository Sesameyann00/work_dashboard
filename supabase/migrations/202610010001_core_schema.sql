begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('management', 'member_admin', 'head_nurse');
create type public.member_level as enum ('V1', 'V2', 'V3', 'V4', 'V5');
create type public.visit_source as enum ('treatment');
create type public.service_cycle_status as enum ('active', 'completed', 'superseded');
create type public.task_type as enum (
  'care_d0', 'followup_d1', 'followup_d3', 'followup_d7', 'followup_d15', 'followup_d30',
  'birthday_notify', 'birthday_unclaimed', 'validity_90d', 'validity_30d', 'validity_7d',
  'share_benefit_expiry'
);
create type public.task_status as enum ('pending', 'completed', 'confirmed', 'superseded', 'cancelled');
create type public.gift_status as enum ('pending_notification', 'notified', 'claimed');
create type public.survey_type as enum ('quarterly_satisfaction', 'new_care_product');
create type public.survey_status as enum ('pending', 'completed');
create type public.import_status as enum ('pending', 'validating', 'ready', 'importing', 'completed', 'failed');
create type public.import_row_status as enum ('pending', 'valid', 'invalid', 'imported');

create or replace function public.normalize_phone(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when length(regexp_replace(value, '[^0-9]', '', 'g')) = 13
      and regexp_replace(value, '[^0-9]', '', 'g') like '86%'
    then substring(regexp_replace(value, '[^0-9]', '', 'g') from 3)
    else regexp_replace(value, '[^0-9]', '', 'g')
  end
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  role public.app_role not null,
  is_enabled boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);
create unique index profiles_username_unique on public.profiles (lower(username));

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  phone text not null,
  normalized_phone text generated always as (public.normalize_phone(phone)) stored,
  birthday date,
  level public.member_level not null,
  joined_on date,
  valid_until date,
  last_visit_date date,
  visit_count integer not null default 0 check (visit_count >= 0),
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_phone_length check (length(public.normalize_phone(phone)) between 7 and 20),
  constraint members_membership_dates check (valid_until is null or joined_on is null or valid_until >= joined_on)
);
create unique index members_normalized_phone_unique on public.members (normalized_phone);
create index members_level_idx on public.members (level) where not is_archived;
create index members_valid_until_idx on public.members (valid_until) where not is_archived;
create index members_last_visit_idx on public.members (last_visit_date desc nulls last) where not is_archived;

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  treatment_date date not null,
  is_historical boolean not null default false,
  import_batch_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, treatment_date)
);
create index treatments_member_date_idx on public.treatments (member_id, treatment_date desc);

create table public.service_cycles (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null unique references public.treatments(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status public.service_cycle_status not null default 'active',
  superseded_by_treatment_id uuid references public.treatments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint superseded_cycle_has_replacement check (
    (status = 'superseded' and superseded_by_treatment_id is not null)
    or (status <> 'superseded' and superseded_by_treatment_id is null)
  )
);
create index service_cycles_member_status_idx on public.service_cycles (member_id, status);
create unique index one_active_cycle_per_member on public.service_cycles (member_id) where status = 'active';

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  visit_date date not null,
  source public.visit_source not null default 'treatment',
  source_treatment_id uuid references public.treatments(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visits_treatment_source_consistent check (
    source = 'treatment' and source_treatment_id is not null
  ),
  unique (member_id, visit_date)
);
create unique index visits_source_treatment_unique on public.visits (source_treatment_id) where source_treatment_id is not null;
create index visits_date_idx on public.visits (visit_date desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  service_cycle_id uuid references public.service_cycles(id) on delete restrict,
  task_type public.task_type not null,
  due_date date not null,
  status public.task_status not null default 'pending',
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  source_valid_until date,
  source_year smallint,
  is_historical boolean not null default false,
  superseded_by_treatment_id uuid references public.treatments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_completion_fields check (
    (status in ('completed', 'confirmed') and completed_at is not null)
    or (status not in ('completed', 'confirmed'))
  ),
  constraint tasks_service_source check (
    (task_type in ('care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30') and service_cycle_id is not null)
    or (task_type not in ('care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30') and service_cycle_id is null)
  )
);
create unique index tasks_cycle_type_unique on public.tasks (service_cycle_id, task_type) where service_cycle_id is not null;
create unique index tasks_birthday_unique on public.tasks (member_id, source_year, task_type) where task_type in ('birthday_notify', 'birthday_unclaimed');
create unique index tasks_validity_unique on public.tasks (member_id, source_valid_until, task_type) where task_type in ('validity_90d', 'validity_30d', 'validity_7d');
create index tasks_due_pending_idx on public.tasks (due_date, task_type) where status = 'pending' and not is_historical;
create index tasks_member_date_idx on public.tasks (member_id, due_date desc);

create table public.birthday_gifts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  gift_year smallint not null check (gift_year between 2000 and 2200),
  status public.gift_status not null default 'pending_notification',
  notified_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, gift_year),
  constraint birthday_gift_dates check (
    (status = 'pending_notification')
    or (status = 'notified' and notified_at is not null)
    or (status = 'claimed' and notified_at is not null and claimed_at is not null)
  )
);

create table public.membership_validity_changes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  old_valid_until date,
  new_valid_until date not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint validity_actually_changed check (old_valid_until is distinct from new_valid_until)
);
create index validity_changes_member_idx on public.membership_validity_changes (member_id, changed_at desc);

create table public.survey_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  survey_type public.survey_type not null,
  event_date date not null,
  status public.survey_status not null default 'completed',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, survey_type, event_date)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  status public.import_status not null default 'pending',
  cutoff_date date,
  total_rows integer not null default 0 check (total_rows >= 0),
  success_rows integer not null default 0 check (success_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (file_sha256),
  constraint import_row_counts check (success_rows + failed_rows <= total_rows)
);

alter table public.treatments
  add constraint treatments_import_batch_fk foreign key (import_batch_id) references public.import_batches(id) on delete set null;

create table public.import_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb,
  status public.import_row_status not null default 'pending',
  error_messages text[] not null default '{}',
  member_id uuid references public.members(id) on delete set null,
  treatment_id uuid references public.treatments(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);
create index import_rows_batch_status_idx on public.import_rows (batch_id, status);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

create table public.daily_metrics (
  metric_date date primary key,
  total_members integer not null default 0 check (total_members >= 0),
  visit_members integer not null default 0 check (visit_members >= 0),
  visits_total integer not null default 0 check (visits_total >= 0),
  service_tasks_due integer not null default 0 check (service_tasks_due >= 0),
  service_tasks_done integer not null default 0 check (service_tasks_done >= 0),
  overdue_tasks integer not null default 0 check (overdue_tasks >= 0),
  level_counts jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

commit;

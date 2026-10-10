begin;

drop view if exists public.member_directory;

create or replace function public.get_member_directory()
returns table (
  id uuid,
  member_card_number text,
  source_card_number text,
  name text,
  phone text,
  consultant text,
  has_service_group boolean,
  has_mini_program_profile boolean,
  member_kind public.member_kind,
  level public.member_level,
  birthday date,
  joined_on date,
  membership_changed_on date,
  valid_until date,
  last_visit_date date,
  visit_count integer,
  is_archived boolean,
  prospect_converted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.member_card_number,
    m.source_card_number,
    m.name,
    case
      when public.can_view_member_phone() then m.phone
      else left(m.phone, 3) || '****' || right(m.phone, 4)
    end,
    m.consultant,
    m.has_service_group,
    m.has_mini_program_profile,
    m.member_kind,
    m.level,
    m.birthday,
    m.joined_on,
    m.membership_changed_on,
    m.valid_until,
    m.last_visit_date,
    m.visit_count,
    m.is_archived,
    m.prospect_converted_at,
    m.created_by,
    m.updated_by,
    m.created_at,
    m.updated_at
  from public.members m
  where public.is_active_user()
$$;

comment on function public.get_member_directory() is
  '会员档案安全读取入口；账号002和004返回完整手机号，其他已启用账号仅返回脱敏号码';

revoke all on function public.get_member_directory() from public, anon;
grant execute on function public.get_member_directory() to authenticated;

commit;

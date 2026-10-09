begin;

alter table public.members
  alter column phone drop not null;

comment on column public.members.phone is
  '历史兼容字段；会员卡号为当前业务唯一识别键，手机号不再要求录入或在系统中展示';

alter view public.v1_member_upgrades
  rename column phone to member_card_number;

create or replace view public.v1_member_upgrades
with (security_invoker = true)
as
select distinct on (c.member_id)
  c.member_id,
  m.name,
  coalesce(m.source_card_number, m.member_card_number) as member_card_number,
  m.level as current_level,
  c.new_level as first_upgrade_level,
  c.changed_at as first_upgraded_at
from public.member_level_changes c
join public.members m on m.id = c.member_id
where c.old_level = 'V1'
  and c.new_level in ('V2', 'V3', 'V4', 'V5')
  and not m.is_archived
order by c.member_id, c.changed_at;

grant select on public.v1_member_upgrades to authenticated;

commit;

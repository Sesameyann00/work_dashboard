begin;

create or replace view public.member_upgrades
with (security_invoker = true)
as
select
  c.id,
  c.member_id,
  m.name,
  coalesce(nullif(m.source_card_number, ''), nullif(m.member_card_number, '')) as card_number,
  c.old_level,
  c.new_level,
  m.membership_changed_on,
  c.changed_at
from public.member_level_changes c
join public.members m on m.id = c.member_id
where not m.is_archived
  and m.membership_changed_on is not null
  and case c.new_level
        when 'V1' then 1
        when 'V2' then 2
        when 'V3' then 3
        when 'V4' then 4
        when 'V5' then 5
      end
      >
      case c.old_level
        when 'V1' then 1
        when 'V2' then 2
        when 'V3' then 3
        when 'V4' then 4
        when 'V5' then 5
      end;

grant select on public.member_upgrades to authenticated;

comment on view public.member_upgrades is
  'Member upgrades confirmed by an upward level-history change and the member membership-change date.';

commit;

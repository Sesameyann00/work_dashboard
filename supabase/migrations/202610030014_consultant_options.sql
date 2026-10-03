begin;

alter table public.members
  alter column consultant set not null;

alter table public.members
  add constraint members_consultant_allowed
  check (consultant in ('孙亚亚', '马芷怡'));

commit;

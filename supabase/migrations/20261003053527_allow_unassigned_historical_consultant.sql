begin;

alter table public.members alter column consultant drop not null;

commit;

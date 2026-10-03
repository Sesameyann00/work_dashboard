begin;

alter table public.members add column source_card_number text;

create unique index members_source_card_number_unique
on public.members(source_card_number)
where source_card_number is not null;

commit;

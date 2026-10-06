begin;

alter table public.members
  add column has_mini_program_profile boolean not null default false;

update public.members
set has_mini_program_profile = true;

comment on column public.members.has_mini_program_profile is '是否已在小程序建档';

commit;

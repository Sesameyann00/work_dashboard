update public.profiles
set display_name = '执行院长', role = 'readonly', is_enabled = true
where username = '001';

update public.profiles
set display_name = '最高管理员', role = 'management', is_enabled = true
where username = '002';

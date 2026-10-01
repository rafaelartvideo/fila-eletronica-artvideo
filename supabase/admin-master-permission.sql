-- Run once in the SQL Editor of the Supabase project used by Fila Artvideo.
-- Makes system.admin a true wildcard and synchronizes all current permissions
-- to the protected Administrator role.

insert into public.queue_role_permissions (role_id, permission_key)
select role.id, permission.key
from public.queue_roles as role
cross join public.queue_permissions as permission
where role.is_system
  and role.name = 'Administrador'
on conflict do nothing;

create or replace function private.has_queue_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.queue_users as queue_user
    join public.queue_roles as role on role.id = queue_user.role_id
    join public.queue_role_permissions as role_permission on role_permission.role_id = role.id
    where queue_user.user_id = auth.uid()
      and queue_user.is_active
      and role.is_active
      and role_permission.permission_key in (p_permission_key, 'system.admin')
  )
$$;

notify pgrst, 'reload schema';

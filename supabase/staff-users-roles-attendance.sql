-- Execute uma vez no SQL Editor do Supabase da fila.
-- Staff users, roles, permissions and attendance history.
create table if not exists public.queue_permissions (
  key text primary key,
  label text not null,
  module_name text not null,
  description text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.queue_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.queue_role_permissions (
  role_id uuid not null references public.queue_roles(id) on delete cascade,
  permission_key text not null references public.queue_permissions(key) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (role_id, permission_key)
);

create table if not exists public.queue_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  full_name text not null check (char_length(pg_catalog.btrim(full_name)) between 2 and 120),
  role_id uuid not null references public.queue_roles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.queue_permissions (key, label, module_name, description, sort_order) values
  ('system.admin', 'Administrador total', 'Sistema', 'Acesso administrativo completo ao sistema.', 0),
  ('queue.view', 'Visualizar fila', 'Fila', 'Permite visualizar as senhas e atendimentos em andamento.', 10),
  ('queue.issue', 'Gerar senhas', 'Fila', 'Permite emitir novas senhas para clientes.', 11),
  ('queue.call', 'Chamar senhas', 'Fila', 'Permite chamar e repetir chamadas de senhas.', 12),
  ('queue.serve', 'Atender e cancelar', 'Fila', 'Permite iniciar, encerrar e cancelar atendimentos.', 13),
  ('attendance.view', 'Visualizar atendimentos', 'Atendimentos', 'Permite consultar o histórico de atendimentos e tempos.', 20),
  ('service_types.manage', 'Gerenciar tipos de atendimento', 'Configurações', 'Permite criar e editar tipos, prefixos e prioridades.', 30),
  ('users.view', 'Visualizar usuários', 'Acessos', 'Permite visualizar usuários e seus cargos.', 40),
  ('users.manage', 'Gerenciar usuários', 'Acessos', 'Permite criar, editar, ativar, desativar e redefinir senha de usuários.', 41),
  ('roles.view', 'Visualizar cargos', 'Acessos', 'Permite visualizar cargos e permissões.', 42),
  ('roles.manage', 'Gerenciar cargos e permissões', 'Acessos', 'Permite criar e editar cargos e suas permissões.', 43),
  ('display.manage', 'Gerenciar display', 'Configurações', 'Permite gerenciar vídeos e frases do display.', 50),
  ('printer.manage', 'Gerenciar impressora', 'Configurações', 'Permite configurar o agente local de impressão.', 60)
on conflict (key) do update set
  label = excluded.label,
  module_name = excluded.module_name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.queue_roles (id, name, description, is_system, is_active)
values
  ('00000000-0000-4000-8000-000000000101'::uuid, 'Administrador', 'Acesso completo ao sistema de filas.', true, true),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'Atendente', 'Operação diária da fila e dos atendimentos.', false, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

insert into public.queue_role_permissions (role_id, permission_key)
select '00000000-0000-4000-8000-000000000101'::uuid, permission.key
from public.queue_permissions as permission
on conflict do nothing;

insert into public.queue_role_permissions (role_id, permission_key) values
  ('00000000-0000-4000-8000-000000000102'::uuid, 'queue.view'),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'queue.issue'),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'queue.call'),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'queue.serve'),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'attendance.view')
on conflict do nothing;

insert into public.queue_users (user_id, username, full_name, role_id, is_active)
select
  admin_user.user_id,
  case
    when lower(pg_catalog.regexp_replace(pg_catalog.split_part(coalesce(auth_user.email, ''), '@', 1), '[^a-zA-Z0-9._-]+', '', 'g')) ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
      then lower(pg_catalog.regexp_replace(pg_catalog.split_part(auth_user.email, '@', 1), '[^a-zA-Z0-9._-]+', '', 'g'))
    else 'admin.' || pg_catalog.substr(pg_catalog.replace(admin_user.user_id::text, '-', ''), 1, 8)
  end,
  coalesce(nullif(pg_catalog.split_part(auth_user.email, '@', 1), ''), 'Administrador'),
  '00000000-0000-4000-8000-000000000101'::uuid,
  true
from private.admin_users as admin_user
left join auth.users as auth_user on auth_user.id = admin_user.user_id
on conflict (user_id) do nothing;

alter table public.tickets add column if not exists called_by uuid references auth.users(id);
alter table public.tickets add column if not exists served_by uuid references auth.users(id);

create or replace function private.is_queue_staff()
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
    where queue_user.user_id = auth.uid()
      and queue_user.is_active
      and role.is_active
  )
$$;

create or replace function private.has_queue_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $permission$
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
$permission$;

create or replace function private.is_queue_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_queue_permission('system.admin')
$$;

create or replace function public.my_queue_access()
returns table (
  user_id uuid,
  username text,
  full_name text,
  role_id uuid,
  role_name text,
  permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select queue_user.user_id,
         queue_user.username,
         queue_user.full_name,
         role.id,
         role.name,
         coalesce(array_agg(role_permission.permission_key order by role_permission.permission_key)
           filter (where role_permission.permission_key is not null), array[]::text[])
  from public.queue_users as queue_user
  join public.queue_roles as role on role.id = queue_user.role_id and role.is_active
  left join public.queue_role_permissions as role_permission on role_permission.role_id = role.id
  where queue_user.user_id = auth.uid()
    and queue_user.is_active
  group by queue_user.user_id, queue_user.username, queue_user.full_name, role.id, role.name
$$;

revoke all on function private.is_queue_staff(), private.has_queue_permission(text) from public, anon;
grant execute on function private.is_queue_staff(), private.has_queue_permission(text) to authenticated;
revoke all on function public.my_queue_access() from public, anon, authenticated;
grant execute on function public.my_queue_access() to authenticated;

alter table public.queue_permissions enable row level security;
alter table public.queue_roles enable row level security;
alter table public.queue_role_permissions enable row level security;
alter table public.queue_users enable row level security;

revoke all on public.queue_permissions, public.queue_roles, public.queue_role_permissions, public.queue_users from public, anon, authenticated;
grant select on public.queue_permissions, public.queue_roles, public.queue_role_permissions, public.queue_users to authenticated;

drop policy if exists "queue permissions view" on public.queue_permissions;
create policy "queue permissions view" on public.queue_permissions for select to authenticated
using (private.has_queue_permission('roles.view') or private.has_queue_permission('roles.manage'));

drop policy if exists "queue roles view" on public.queue_roles;
create policy "queue roles view" on public.queue_roles for select to authenticated
using (
  private.has_queue_permission('roles.view')
  or private.has_queue_permission('roles.manage')
  or private.has_queue_permission('users.manage')
  or id = (select role_id from public.queue_users where user_id = auth.uid())
);

drop policy if exists "queue role permissions view" on public.queue_role_permissions;
create policy "queue role permissions view" on public.queue_role_permissions for select to authenticated
using (
  private.has_queue_permission('roles.view')
  or private.has_queue_permission('roles.manage')
  or role_id = (select role_id from public.queue_users where user_id = auth.uid())
);

drop policy if exists "queue users view" on public.queue_users;
create policy "queue users view" on public.queue_users for select to authenticated
using (user_id = auth.uid() or private.has_queue_permission('users.view') or private.has_queue_permission('users.manage'));

drop policy if exists "admins read tickets" on public.tickets;
drop policy if exists "admins update tickets" on public.tickets;
drop policy if exists "staff read tickets" on public.tickets;
create policy "staff read tickets" on public.tickets for select to authenticated
using (private.has_queue_permission('queue.view') or private.has_queue_permission('attendance.view'));

revoke update on public.tickets from authenticated;

drop policy if exists "admins read inactive ticket types" on public.ticket_types;
drop policy if exists "admins manage ticket types" on public.ticket_types;
drop policy if exists "staff read inactive ticket types" on public.ticket_types;
drop policy if exists "staff manage ticket types" on public.ticket_types;
create policy "staff read inactive ticket types" on public.ticket_types for select to authenticated
using (private.has_queue_permission('service_types.manage'));
create policy "staff manage ticket types" on public.ticket_types for all to authenticated
using (private.has_queue_permission('service_types.manage'))
with check (private.has_queue_permission('service_types.manage'));

drop policy if exists "admins read inactive media" on public.display_media;
drop policy if exists "admins manage media" on public.display_media;
drop policy if exists "staff read inactive media" on public.display_media;
drop policy if exists "staff manage media" on public.display_media;
create policy "staff read inactive media" on public.display_media for select to authenticated
using (private.has_queue_permission('display.manage'));
create policy "staff manage media" on public.display_media for all to authenticated
using (private.has_queue_permission('display.manage'))
with check (private.has_queue_permission('display.manage'));

create or replace function public.list_attendance_history(p_from date, p_to date)
returns table (
  id uuid,
  business_date date,
  ticket_number text,
  service_type_name text,
  service_priority text,
  status text,
  counter_label text,
  customer_request text,
  created_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  attendant_name text,
  attendant_username text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_queue_permission('attendance.view') then
    raise exception using errcode = 'P0001', message = 'Permission denied: attendance.view';
  end if;
  return query
    select ticket.id, ticket.business_date, ticket.ticket_number, types.name, types.priority,
           ticket.status, ticket.counter_label, ticket.customer_request, ticket.created_at,
           ticket.called_at, ticket.started_at, ticket.completed_at, ticket.cancelled_at,
           queue_user.full_name, queue_user.username
    from public.tickets as ticket
    join public.ticket_types as types on types.id = ticket.service_type_id
    left join public.queue_users as queue_user on queue_user.user_id = coalesce(ticket.served_by, ticket.called_by)
    where ticket.business_date between p_from and p_to
    order by ticket.created_at desc;
end
$$;

create or replace function public.list_queue_roles()
returns table (id uuid, name text, description text, is_system boolean, is_active boolean, permissions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_queue_permission('roles.view') or private.has_queue_permission('roles.manage') or private.has_queue_permission('users.manage')) then
    raise exception using errcode = 'P0001', message = 'Permission denied: roles.view';
  end if;
  return query
    select role.id, role.name, role.description, role.is_system, role.is_active,
           coalesce(array_agg(role_permission.permission_key order by role_permission.permission_key)
             filter (where role_permission.permission_key is not null), array[]::text[])
    from public.queue_roles as role
    left join public.queue_role_permissions as role_permission on role_permission.role_id = role.id
    group by role.id
    order by role.name;
end
$$;

create or replace function public.save_queue_role(
  p_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_permission_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  if not private.has_queue_permission('roles.manage') then
    raise exception using errcode = 'P0001', message = 'Permission denied: roles.manage';
  end if;
  if pg_catalog.btrim(coalesce(p_name, '')) = '' then
    raise exception using errcode = 'P0001', message = 'Role name required';
  end if;
  if p_id = '00000000-0000-4000-8000-000000000101'::uuid then
    raise exception using errcode = 'P0001', message = 'Administrator role cannot be edited';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_permission_keys, array[]::text[])) as requested(permission_key)
    left join public.queue_permissions as permission on permission.key = requested.permission_key
    where permission.key is null
  ) then
    raise exception using errcode = 'P0001', message = 'Invalid permission';
  end if;
  if p_id is null then
    insert into public.queue_roles (name, description, is_system, is_active)
    values (pg_catalog.btrim(p_name), nullif(pg_catalog.btrim(p_description), ''), false, coalesce(p_is_active, true))
    returning id into v_role_id;
  else
    update public.queue_roles
    set name = pg_catalog.btrim(p_name), description = nullif(pg_catalog.btrim(p_description), ''),
        is_active = coalesce(p_is_active, true), updated_at = pg_catalog.clock_timestamp()
    where id = p_id and not is_system
    returning id into v_role_id;
    if v_role_id is null then raise exception using errcode = 'P0001', message = 'Role not editable'; end if;
  end if;
  delete from public.queue_role_permissions where role_id = v_role_id;
  insert into public.queue_role_permissions (role_id, permission_key)
  select v_role_id, requested.permission_key
  from unnest(coalesce(p_permission_keys, array[]::text[])) as requested(permission_key)
  on conflict do nothing;
  return v_role_id;
end
$$;

revoke all on function public.list_attendance_history(date, date), public.list_queue_roles(),
  public.save_queue_role(uuid, text, text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.list_attendance_history(date, date), public.list_queue_roles(),
  public.save_queue_role(uuid, text, text, boolean, text[]) to authenticated;

notify pgrst, 'reload schema';


-- Permission-aware queue operations.
create or replace function private.issue_ticket(p_type_id uuid, p_customer_name text default null)
returns table (
  id uuid, business_date date, sequence_number integer, ticket_number text,
  service_type_id uuid, service_type_name text, status text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_date date := private.business_date(pg_catalog.now());
  v_type public.ticket_types%rowtype;
  v_sequence integer;
begin
  if not private.has_queue_permission('queue.issue') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.issue';
  end if;
  select * into v_type from public.ticket_types as types where types.id = p_type_id and types.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'Active service type not found'; end if;
  if p_customer_name is not null and char_length(pg_catalog.btrim(p_customer_name)) > 120 then
    raise exception using errcode = 'P0001', message = 'Customer name is too long';
  end if;
  insert into private.daily_ticket_sequences as daily_sequence (business_date, service_type_id, last_number)
    values (v_business_date, p_type_id, 1)
    on conflict on constraint daily_ticket_sequences_pkey do update
      set last_number = daily_sequence.last_number + 1
    returning daily_sequence.last_number into v_sequence;
  return query
    insert into public.tickets as ticket (business_date, service_type_id, sequence_number, ticket_number, customer_name)
    values (
      v_business_date, p_type_id, v_sequence,
      v_type.prefix || '-' || pg_catalog.lpad(v_sequence::text, 3, '0'),
      nullif(pg_catalog.btrim(p_customer_name), '')
    )
    returning ticket.id, ticket.business_date, ticket.sequence_number, ticket.ticket_number,
      ticket.service_type_id, v_type.name, ticket.status, ticket.created_at;
end
$$;

create or replace function private.call_next_waiting_ticket(p_counter_label text default null)
returns table (id uuid, ticket_number text, service_type_id uuid, service_type_name text, counter_label text, called_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
begin
  if not private.has_queue_permission('queue.call') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.call';
  end if;
  select ticket.* into v_ticket
  from public.tickets as ticket
  join public.ticket_types as types on types.id = ticket.service_type_id
  where ticket.business_date = private.business_date(pg_catalog.now())
    and ticket.status = 'waiting'
  order by
    case types.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 2 end desc,
    ticket.created_at asc,
    ticket.id asc
  for update of ticket skip locked
  limit 1;
  if not found then raise exception using errcode = 'P0001', message = 'No waiting tickets'; end if;
  update public.tickets as ticket
  set status = 'called',
      counter_label = nullif(pg_catalog.btrim(p_counter_label), ''),
      called_at = pg_catalog.clock_timestamp(),
      called_by = auth.uid(),
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = v_ticket.id
  returning ticket.* into v_ticket;
  return query
    select event.id, event.ticket_number, event.service_type_id, event.service_type_name, event.counter_label, event.called_at
    from public.display_calls as event
    where event.ticket_number = v_ticket.ticket_number and event.service_type_id = v_ticket.service_type_id
    order by event.called_at desc limit 1;
end
$$;

create or replace function private.call_next_ticket(p_type_id uuid, p_counter_label text default null)
returns table (id uuid, ticket_number text, service_type_id uuid, service_type_name text, counter_label text, called_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if not private.has_queue_permission('queue.call') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.call';
  end if;
  select * into v_ticket from public.tickets as ticket
  where ticket.business_date = private.business_date(pg_catalog.now())
    and ticket.service_type_id = p_type_id and ticket.status = 'waiting'
  order by ticket.sequence_number for update skip locked limit 1;
  if not found then raise exception using errcode = 'P0001', message = 'No waiting tickets'; end if;
  update public.tickets as ticket
  set status = 'called',
      counter_label = nullif(pg_catalog.btrim(p_counter_label), ''),
      called_at = pg_catalog.clock_timestamp(),
      called_by = auth.uid(),
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = v_ticket.id returning * into v_ticket;
  return query
    select event.id, event.ticket_number, event.service_type_id, event.service_type_name, event.counter_label, event.called_at
    from public.display_calls as event where event.ticket_number = v_ticket.ticket_number
      and event.service_type_id = v_ticket.service_type_id order by event.called_at desc limit 1;
end
$$;

create or replace function private.repeat_ticket_call(p_ticket_id uuid)
returns table (id uuid, ticket_number text, service_type_id uuid, service_type_name text, counter_label text, called_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_queue_permission('queue.call') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.call';
  end if;
  update public.tickets as ticket
  set called_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  where ticket.id = p_ticket_id and ticket.status = 'called';
  if not found then raise exception using errcode = 'P0001', message = 'Only a called ticket can be repeated'; end if;
  return query
    select event.id, event.ticket_number, event.service_type_id, event.service_type_name, event.counter_label, event.called_at
    from public.display_calls as event join public.tickets as ticket
      on ticket.service_type_id = event.service_type_id and ticket.ticket_number = event.ticket_number
      and ticket.called_at = event.called_at
    where ticket.id = p_ticket_id order by event.called_at desc limit 1;
end
$$;

create or replace function private.transition_ticket(p_ticket_id uuid, p_to_status text)
returns table (
  id uuid, sequence_number integer, ticket_number text, customer_name text,
  service_type_id uuid, service_type_name text, status text, counter_label text,
  created_at timestamptz, called_at timestamptz, started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if not private.has_queue_permission('queue.serve') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.serve';
  end if;
  update public.tickets as ticket
  set status = p_to_status,
      started_at = case when p_to_status = 'serving' then pg_catalog.clock_timestamp() else ticket.started_at end,
      served_by = case when p_to_status = 'serving' then auth.uid() else ticket.served_by end,
      completed_at = case when p_to_status = 'cancelled' then pg_catalog.clock_timestamp() else ticket.completed_at end,
      cancelled_at = case when p_to_status = 'cancelled' then pg_catalog.clock_timestamp() else ticket.cancelled_at end,
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = p_ticket_id
    and (
      (ticket.status = 'called' and p_to_status = 'serving')
      or (ticket.status in ('waiting', 'called') and p_to_status = 'cancelled')
    )
  returning * into v_ticket;
  if not found then raise exception using errcode = 'P0001', message = 'Invalid ticket status transition'; end if;
  return query
    select v_ticket.id, v_ticket.sequence_number, v_ticket.ticket_number, v_ticket.customer_name,
      v_ticket.service_type_id, types.name, v_ticket.status, v_ticket.counter_label, v_ticket.created_at,
      v_ticket.called_at, v_ticket.started_at, v_ticket.completed_at, v_ticket.cancelled_at
    from public.ticket_types as types where types.id = v_ticket.service_type_id;
end
$$;

create or replace function private.complete_ticket(p_ticket_id uuid, p_customer_request text)
returns table (
  id uuid, business_date date, sequence_number integer, ticket_number text, customer_name text,
  customer_request text, service_type_id uuid, service_type_name text, service_priority text, status text,
  counter_label text, created_at timestamptz, called_at timestamptz, started_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_request text := pg_catalog.btrim(coalesce(p_customer_request, ''));
begin
  if not private.has_queue_permission('queue.serve') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.serve';
  end if;
  if v_request = '' then raise exception using errcode = 'P0001', message = 'Customer request required'; end if;
  if pg_catalog.char_length(v_request) > 1000 then raise exception using errcode = 'P0001', message = 'Customer request too long'; end if;
  update public.tickets as ticket
  set customer_request = v_request,
      status = 'completed',
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = p_ticket_id and ticket.status = 'serving'
  returning * into v_ticket;
  if not found then raise exception using errcode = 'P0001', message = 'Invalid ticket status transition'; end if;
  return query
    select v_ticket.id, v_ticket.business_date, v_ticket.sequence_number, v_ticket.ticket_number,
      v_ticket.customer_name, v_ticket.customer_request, v_ticket.service_type_id, types.name, types.priority,
      v_ticket.status, v_ticket.counter_label, v_ticket.created_at, v_ticket.called_at, v_ticket.started_at,
      v_ticket.completed_at, v_ticket.cancelled_at
    from public.ticket_types as types where types.id = v_ticket.service_type_id;
end
$$;

create or replace function public.create_print_agent(p_name text, p_slug text default 'reception')
returns table (id uuid, slug text, name text, token text, is_active boolean, created_at timestamptz, last_seen_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
  v_agent record;
begin
  if not private.has_queue_permission('printer.manage') then raise exception using errcode = 'P0001', message = 'Permission denied: printer.manage'; end if;
  if p_name is null or char_length(pg_catalog.btrim(p_name)) < 2 then raise exception using errcode = 'P0001', message = 'Print agent name is required'; end if;
  if p_slug is null or pg_catalog.btrim(p_slug) !~ '^[a-z0-9][a-z0-9_-]{1,39}$' then raise exception using errcode = 'P0001', message = 'Invalid print agent slug'; end if;
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '') || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into private.print_agents as agent (slug, name, agent_token, is_active)
    values (pg_catalog.btrim(p_slug), pg_catalog.btrim(p_name), v_token, true)
    on conflict on constraint print_agents_slug_key
    do update set name = excluded.name, agent_token = excluded.agent_token, is_active = true
    returning agent.* into v_agent;
  return query select v_agent.id, v_agent.slug, v_agent.name, v_token, v_agent.is_active, v_agent.created_at, v_agent.last_seen_at;
end
$$;

create or replace function public.list_print_agents()
returns table (id uuid, slug text, name text, is_active boolean, created_at timestamptz, last_seen_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_queue_permission('printer.manage') then raise exception using errcode = 'P0001', message = 'Permission denied: printer.manage'; end if;
  return query select agent.id, agent.slug, agent.name, agent.is_active, agent.created_at, agent.last_seen_at
    from private.print_agents as agent order by agent.created_at;
end
$$;

create or replace function public.request_ticket_print(p_ticket_id uuid, p_agent_slug text default 'reception')
returns table (id uuid, status text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_ticket record;
  v_agent record;
  v_service_name text;
  v_job record;
begin
  if not private.has_queue_permission('queue.issue') then raise exception using errcode = 'P0001', message = 'Permission denied: queue.issue'; end if;
  select * into v_ticket from public.tickets as ticket
    where ticket.id = p_ticket_id and ticket.business_date = private.business_date(pg_catalog.now());
  if not found then raise exception using errcode = 'P0001', message = 'Ticket not found for today'; end if;
  select types.name into v_service_name from public.ticket_types as types where types.id = v_ticket.service_type_id;
  select * into v_agent from private.print_agents as agent where agent.slug = p_agent_slug and agent.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'Print agent not configured'; end if;
  insert into private.print_jobs (ticket_id, agent_id, requested_by, ticket_number, service_type_name, issued_at)
    values (v_ticket.id, v_agent.id, auth.uid(), v_ticket.ticket_number, v_service_name, v_ticket.created_at)
    returning * into v_job;
  return query select v_job.id, v_job.status;
end
$$;

notify pgrst, 'reload schema';


-- Users with read-only access can resolve role labels without gaining role-management access.
drop policy if exists "queue roles view" on public.queue_roles;
create policy "queue roles view" on public.queue_roles for select to authenticated
using (
  private.has_queue_permission('roles.view')
  or private.has_queue_permission('roles.manage')
  or private.has_queue_permission('users.view')
  or private.has_queue_permission('users.manage')
  or id = (select role_id from public.queue_users where user_id = auth.uid())
);

create or replace function public.list_queue_roles()
returns table (id uuid, name text, description text, is_system boolean, is_active boolean, permissions text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    private.has_queue_permission('roles.view')
    or private.has_queue_permission('roles.manage')
    or private.has_queue_permission('users.view')
    or private.has_queue_permission('users.manage')
  ) then
    raise exception using errcode = 'P0001', message = 'Permission denied: roles.view';
  end if;
  return query
    select role.id, role.name, role.description, role.is_system, role.is_active,
           coalesce(array_agg(role_permission.permission_key order by role_permission.permission_key)
             filter (where role_permission.permission_key is not null), array[]::text[])
    from public.queue_roles as role
    left join public.queue_role_permissions as role_permission on role_permission.role_id = role.id
    group by role.id
    order by role.name;
end
$$;

notify pgrst, 'reload schema';

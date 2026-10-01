-- Melhorias dos tipos de atendimento e fila.
-- Execute este arquivo no SQL Editor do Supabase antes de usar os novos recursos em produção.

alter table public.ticket_types
  add column if not exists icon text not null default 'clipboard',
  add column if not exists extra_icons text[] not null default array[]::text[],
  add column if not exists is_quick boolean not null default false,
  add column if not exists is_pinned boolean not null default false;

update public.ticket_types
set extra_icons = extra_icons[1:4]
where cardinality(extra_icons) > 4;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ticket_types_extra_icons_max_four'
      and conrelid = 'public.ticket_types'::regclass
  ) then
    alter table public.ticket_types
      add constraint ticket_types_extra_icons_max_four
      check (cardinality(extra_icons) <= 4);
  end if;
end
$constraint$;

create index if not exists ticket_types_display_order_idx
  on public.ticket_types (sort_order, name);

create or replace function public.reorder_ticket_types(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_position integer := 0;
begin
  if not private.has_queue_permission('service_types.manage') then
    raise exception using errcode = 'P0001', message = 'Permission denied: service_types.manage';
  end if;

  if p_ids is null then return; end if;

  foreach v_id in array p_ids loop
    update public.ticket_types
      set sort_order = v_position,
          updated_at = pg_catalog.clock_timestamp()
    where id = v_id;
    v_position := v_position + 1;
  end loop;
end
$$;

revoke all on function public.reorder_ticket_types(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_ticket_types(uuid[]) to authenticated;

create or replace function public.delete_ticket_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_queue_permission('service_types.manage') then
    raise exception using errcode = 'P0001', message = 'Permission denied: service_types.manage';
  end if;

  if exists (select 1 from public.tickets where service_type_id = p_id) then
    raise exception using errcode = 'P0001', message = 'Service type has ticket history';
  end if;

  delete from private.daily_ticket_sequences where service_type_id = p_id;
  delete from public.ticket_types where id = p_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Service type not found';
  end if;
end
$$;

revoke all on function public.delete_ticket_type(uuid) from public, anon, authenticated;
grant execute on function public.delete_ticket_type(uuid) to authenticated;

-- Atendimento rápido sempre vem antes das prioridades convencionais.
create or replace function private.call_next_waiting_ticket(p_counter_label text default null)
returns table (
  id uuid,
  ticket_number text,
  service_type_id uuid,
  service_type_name text,
  counter_label text,
  called_at timestamptz
)
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
    types.is_quick desc,
    case types.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 2 end desc,
    ticket.created_at asc,
    ticket.id asc
  for update of ticket skip locked
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'No waiting tickets';
  end if;

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
    where event.ticket_number = v_ticket.ticket_number
      and event.service_type_id = v_ticket.service_type_id
    order by event.called_at desc
    limit 1;
end
$$;

revoke all on function private.call_next_waiting_ticket(text) from public, anon, authenticated;
grant execute on function private.call_next_waiting_ticket(text) to authenticated;

-- Chamada manual de uma senha específica, restrita a tipos marcados como rápidos.
create or replace function public.call_waiting_ticket(p_ticket_id uuid, p_counter_label text default null)
returns table (
  id uuid,
  ticket_number text,
  service_type_id uuid,
  service_type_name text,
  counter_label text,
  called_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_is_quick boolean;
begin
  if not private.has_queue_permission('queue.call') then
    raise exception using errcode = 'P0001', message = 'Permission denied: queue.call';
  end if;

  select ticket.* into v_ticket
  from public.tickets as ticket
  where ticket.id = p_ticket_id
    and ticket.business_date = private.business_date(pg_catalog.now())
    and ticket.status = 'waiting'
  for update of ticket;

  if not found then
    raise exception using errcode = 'P0001', message = 'No waiting tickets';
  end if;

  select types.is_quick into v_is_quick
  from public.ticket_types as types
  where types.id = v_ticket.service_type_id;

  if not coalesce(v_is_quick, false) then
    raise exception using errcode = 'P0001', message = 'Only quick service tickets can be called individually';
  end if;

  update public.tickets as ticket
  set status = 'called',
      counter_label = nullif(pg_catalog.btrim(p_counter_label), ''),
      called_at = pg_catalog.clock_timestamp(),
      called_by = auth.uid(),
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = p_ticket_id
  returning ticket.* into v_ticket;

  return query
    select event.id, event.ticket_number, event.service_type_id, event.service_type_name, event.counter_label, event.called_at
    from public.display_calls as event
    where event.ticket_number = v_ticket.ticket_number
      and event.service_type_id = v_ticket.service_type_id
    order by event.called_at desc
    limit 1;
end
$$;

revoke all on function public.call_waiting_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.call_waiting_ticket(uuid, text) to authenticated;

-- Mantém o acompanhamento coerente com a mesma regra de prioridade da fila.
create or replace function public.get_ticket_tracking(p_token uuid)
returns table (
  ticket_number text,
  service_type_name text,
  service_priority text,
  status text,
  counter_label text,
  created_at timestamptz,
  called_at timestamptz,
  updated_at timestamptz,
  queue_ahead integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_rank integer;
  v_ahead integer := 0;
begin
  select ticket.*, types.name as service_type_name, types.priority as service_priority, types.is_quick as service_is_quick
    into v_ticket
  from public.tickets as ticket
  join public.ticket_types as types on types.id = ticket.service_type_id
  where ticket.tracking_token = p_token;

  if not found then return; end if;

  v_rank := case v_ticket.service_priority
    when 'urgent' then 4
    when 'high' then 3
    when 'normal' then 2
    when 'low' then 1
    else 2
  end;

  if v_ticket.status = 'waiting' then
    select count(*)::integer into v_ahead
    from public.tickets as ahead
    join public.ticket_types as ahead_type on ahead_type.id = ahead.service_type_id
    where ahead.business_date = v_ticket.business_date
      and ahead.status = 'waiting'
      and ahead.id <> v_ticket.id
      and (
        (ahead_type.is_quick and not v_ticket.service_is_quick)
        or (
          ahead_type.is_quick = v_ticket.service_is_quick
          and (
            (case ahead_type.priority
              when 'urgent' then 4
              when 'high' then 3
              when 'normal' then 2
              when 'low' then 1
              else 2
            end) > v_rank
            or (
              (case ahead_type.priority
                when 'urgent' then 4
                when 'high' then 3
                when 'normal' then 2
                when 'low' then 1
                else 2
              end) = v_rank
              and (ahead.created_at, ahead.id) < (v_ticket.created_at, v_ticket.id)
            )
          )
        )
      );
  end if;

  return query select
    v_ticket.ticket_number,
    v_ticket.service_type_name,
    v_ticket.service_priority,
    v_ticket.status,
    v_ticket.counter_label,
    v_ticket.created_at,
    v_ticket.called_at,
    v_ticket.updated_at,
    v_ahead;
end
$$;

revoke all on function public.get_ticket_tracking(uuid) from public, anon, authenticated;
grant execute on function public.get_ticket_tracking(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

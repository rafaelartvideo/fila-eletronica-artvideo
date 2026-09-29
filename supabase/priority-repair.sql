-- Correção curta para habilitar prioridades no sistema de filas.
-- Execute este arquivo no SQL Editor do Supabase da fila.

alter table public.ticket_types
  add column if not exists priority text not null default 'normal';

do $$
begin
  alter table public.ticket_types
    add constraint ticket_types_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent'));
exception
  when duplicate_object then null;
end
$$;

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
  if not private.is_queue_admin() then
    raise exception using errcode = 'P0001', message = 'Admin access required';
  end if;

  select ticket.*
    into v_ticket
  from public.tickets as ticket
  join public.ticket_types as types
    on types.id = ticket.service_type_id
  where ticket.business_date = private.business_date(pg_catalog.now())
    and ticket.status = 'waiting'
  order by
    case types.priority
      when 'urgent' then 4
      when 'high' then 3
      when 'normal' then 2
      when 'low' then 1
      else 2
    end desc,
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
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = v_ticket.id
  returning ticket.* into v_ticket;

  return query
    select event.id,
           event.ticket_number,
           event.service_type_id,
           event.service_type_name,
           event.counter_label,
           event.called_at
    from public.display_calls as event
    where event.ticket_number = v_ticket.ticket_number
      and event.service_type_id = v_ticket.service_type_id
    order by event.called_at desc
    limit 1;
end
$$;

notify pgrst, 'reload schema';

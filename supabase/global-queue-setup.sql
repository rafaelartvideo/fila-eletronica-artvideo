-- Execute uma vez no SQL Editor do Supabase atual do sistema de filas.

-- Global FIFO queue: service type keeps the prefix/category, but calling follows arrival time.
create index if not exists tickets_global_queue_order_idx
  on public.tickets (business_date, status, created_at);

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
  where ticket.business_date = private.business_date(pg_catalog.now())
    and ticket.status = 'waiting'
  order by ticket.created_at asc, ticket.id asc
  for update skip locked
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

create or replace function public.call_next_waiting_ticket(p_counter_label text default null)
returns table (
  id uuid,
  ticket_number text,
  service_type_id uuid,
  service_type_name text,
  counter_label text,
  called_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.call_next_waiting_ticket(p_counter_label)
$$;

revoke all on function private.call_next_waiting_ticket(text) from public, anon, authenticated;
grant execute on function private.call_next_waiting_ticket(text) to authenticated;
revoke all on function public.call_next_waiting_ticket(text) from public, anon, authenticated;
grant execute on function public.call_next_waiting_ticket(text) to authenticated;

notify pgrst, 'reload schema';

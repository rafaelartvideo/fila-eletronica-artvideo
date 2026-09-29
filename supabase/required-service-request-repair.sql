-- Execute uma vez no SQL Editor do Supabase da fila.
-- Require the service request when closing an active service.
alter table public.tickets add column if not exists customer_request text;

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
  if not private.is_queue_admin() then
    raise exception using errcode = 'P0001', message = 'Admin access required';
  end if;

  update public.tickets as ticket
  set status = p_to_status,
      started_at = case when p_to_status = 'serving' then pg_catalog.clock_timestamp() else ticket.started_at end,
      completed_at = case when p_to_status = 'cancelled' then pg_catalog.clock_timestamp() else ticket.completed_at end,
      cancelled_at = case when p_to_status = 'cancelled' then pg_catalog.clock_timestamp() else ticket.cancelled_at end,
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = p_ticket_id
    and (
      (ticket.status = 'called' and p_to_status = 'serving')
      or (ticket.status in ('waiting', 'called') and p_to_status = 'cancelled')
    )
  returning * into v_ticket;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invalid ticket status transition';
  end if;

  return query
    select v_ticket.id,
           v_ticket.sequence_number,
           v_ticket.ticket_number,
           v_ticket.customer_name,
           v_ticket.service_type_id,
           types.name,
           v_ticket.status,
           v_ticket.counter_label,
           v_ticket.created_at,
           v_ticket.called_at,
           v_ticket.started_at,
           v_ticket.completed_at,
           v_ticket.cancelled_at
    from public.ticket_types as types
    where types.id = v_ticket.service_type_id;
end
$$;

create or replace function private.complete_ticket(p_ticket_id uuid, p_customer_request text)
returns table (
  id uuid,
  business_date date,
  sequence_number integer,
  ticket_number text,
  customer_name text,
  customer_request text,
  service_type_id uuid,
  service_type_name text,
  service_priority text,
  status text,
  counter_label text,
  created_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_request text := pg_catalog.btrim(coalesce(p_customer_request, ''));
begin
  if not private.is_queue_admin() then
    raise exception using errcode = 'P0001', message = 'Admin access required';
  end if;

  if v_request = '' then
    raise exception using errcode = 'P0001', message = 'Customer request required';
  end if;

  if pg_catalog.char_length(v_request) > 1000 then
    raise exception using errcode = 'P0001', message = 'Customer request too long';
  end if;

  update public.tickets as ticket
  set customer_request = v_request,
      status = 'completed',
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where ticket.id = p_ticket_id
    and ticket.status = 'serving'
  returning * into v_ticket;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invalid ticket status transition';
  end if;

  return query
    select v_ticket.id,
           v_ticket.business_date,
           v_ticket.sequence_number,
           v_ticket.ticket_number,
           v_ticket.customer_name,
           v_ticket.customer_request,
           v_ticket.service_type_id,
           types.name,
           types.priority,
           v_ticket.status,
           v_ticket.counter_label,
           v_ticket.created_at,
           v_ticket.called_at,
           v_ticket.started_at,
           v_ticket.completed_at,
           v_ticket.cancelled_at
    from public.ticket_types as types
    where types.id = v_ticket.service_type_id;
end
$$;

create or replace function public.complete_ticket(p_ticket_id uuid, p_customer_request text)
returns table (
  id uuid,
  business_date date,
  sequence_number integer,
  ticket_number text,
  customer_name text,
  customer_request text,
  service_type_id uuid,
  service_type_name text,
  service_priority text,
  status text,
  counter_label text,
  created_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.complete_ticket(p_ticket_id, p_customer_request)
$$;

revoke all on function private.complete_ticket(uuid, text) from public, anon, authenticated;
grant execute on function private.complete_ticket(uuid, text) to authenticated;
revoke all on function public.complete_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_ticket(uuid, text) to authenticated;

notify pgrst, 'reload schema';

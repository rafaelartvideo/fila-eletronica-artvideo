-- Execute uma vez no SQL Editor do Supabase da fila.
-- Restrict ticket issuance to authenticated queue staff only.
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
  if not private.is_queue_admin() then
    raise exception using errcode = 'P0001', message = 'Ticket issuance is limited to staff';
  end if;

  select * into v_type
  from public.ticket_types as types
  where types.id = p_type_id
    and types.is_active;

  if not found then
    raise exception using errcode = 'P0001', message = 'Active service type not found';
  end if;

  if p_customer_name is not null and char_length(pg_catalog.btrim(p_customer_name)) > 120 then
    raise exception using errcode = 'P0001', message = 'Customer name is too long';
  end if;

  insert into private.daily_ticket_sequences as daily_sequence (business_date, service_type_id, last_number)
  values (v_business_date, p_type_id, 1)
  on conflict on constraint daily_ticket_sequences_pkey do update
    set last_number = daily_sequence.last_number + 1
  returning daily_sequence.last_number into v_sequence;

  return query
    insert into public.tickets as ticket (
      business_date, service_type_id, sequence_number, ticket_number, customer_name
    ) values (
      v_business_date,
      p_type_id,
      v_sequence,
      v_type.prefix || '-' || pg_catalog.lpad(v_sequence::text, 3, '0'),
      nullif(pg_catalog.btrim(p_customer_name), '')
    )
    returning ticket.id,
              ticket.business_date,
              ticket.sequence_number,
              ticket.ticket_number,
              ticket.service_type_id,
              v_type.name,
              ticket.status,
              ticket.created_at;
end
$$;

revoke all on function private.issue_ticket(uuid, text) from public, anon, authenticated;
grant execute on function private.issue_ticket(uuid, text) to authenticated;

revoke all on function public.issue_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_ticket(uuid, text) to authenticated;

revoke all on function private.issue_ticket_v2(uuid, text) from public, anon, authenticated;
grant execute on function private.issue_ticket_v2(uuid, text) to authenticated;

revoke all on function public.issue_ticket_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_ticket_v2(uuid, text) to authenticated;

notify pgrst, 'reload schema';

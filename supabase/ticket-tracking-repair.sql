-- Execute este arquivo no SQL Editor do Supabase da fila.
-- Ticket tracking QR + private service notes.
alter table public.tickets add column if not exists tracking_token uuid;
update public.tickets set tracking_token = gen_random_uuid() where tracking_token is null;
alter table public.tickets alter column tracking_token set default gen_random_uuid();
alter table public.tickets alter column tracking_token set not null;
create unique index if not exists tickets_tracking_token_uidx on public.tickets (tracking_token);

alter table public.tickets add column if not exists customer_request text;
do $$
begin
  alter table public.tickets
    add constraint tickets_customer_request_length_check
    check (customer_request is null or char_length(customer_request) <= 1000);
exception when duplicate_object then null;
end
$$;

create or replace function private.issue_ticket_v2(p_type_id uuid, p_customer_name text default null)
returns table (
  id uuid,
  business_date date,
  sequence_number integer,
  ticket_number text,
  service_type_id uuid,
  service_type_name text,
  service_priority text,
  status text,
  created_at timestamptz,
  tracking_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issued record;
begin
  select * into v_issued from private.issue_ticket(p_type_id, p_customer_name);

  return query
    select v_issued.id,
           v_issued.business_date,
           v_issued.sequence_number,
           v_issued.ticket_number,
           v_issued.service_type_id,
           types.name,
           types.priority,
           v_issued.status,
           v_issued.created_at,
           ticket.tracking_token
    from public.tickets as ticket
    join public.ticket_types as types on types.id = ticket.service_type_id
    where ticket.id = v_issued.id;
end
$$;

create or replace function public.issue_ticket_v2(p_type_id uuid, p_customer_name text default null)
returns table (
  id uuid,
  business_date date,
  sequence_number integer,
  ticket_number text,
  service_type_id uuid,
  service_type_name text,
  service_priority text,
  status text,
  created_at timestamptz,
  tracking_token uuid
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.issue_ticket_v2(p_type_id, p_customer_name)
$$;

revoke all on function private.issue_ticket_v2(uuid, text) from public, anon, authenticated;
grant execute on function private.issue_ticket_v2(uuid, text) to authenticated;
revoke all on function public.issue_ticket_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_ticket_v2(uuid, text) to authenticated;

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
  select ticket.*, types.name as service_type_name, types.priority as service_priority
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

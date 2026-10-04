drop function if exists public.get_ticket_tracking(uuid);

create function public.get_ticket_tracking(p_token uuid)
returns table (
  ticket_number text,
  service_type_name text,
  service_priority text,
  status text,
  counter_label text,
  created_at timestamptz,
  called_at timestamptz,
  updated_at timestamptz,
  queue_ahead integer,
  os_access_code text
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
  select
    ticket.*,
    types.name as service_type_name,
    types.priority as service_priority,
    types.is_quick as service_is_quick,
    code.access_code as os_access_code
  into v_ticket
  from public.tickets as ticket
  join public.ticket_types as types
    on types.id = ticket.service_type_id
  left join private.ticket_os_codes as code
    on code.ticket_id = ticket.id
  where ticket.tracking_token = p_token;

  if not found then
    return;
  end if;

  v_rank := case v_ticket.service_priority
    when 'urgent' then 4
    when 'high' then 3
    when 'normal' then 2
    when 'low' then 1
    else 2
  end;

  if v_ticket.status = 'waiting' then
    select count(*)::integer
    into v_ahead
    from public.tickets as ahead
    join public.ticket_types as ahead_type
      on ahead_type.id = ahead.service_type_id
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

  return query
  select
    v_ticket.ticket_number,
    v_ticket.service_type_name,
    v_ticket.service_priority,
    v_ticket.status,
    v_ticket.counter_label,
    v_ticket.created_at,
    v_ticket.called_at,
    v_ticket.updated_at,
    v_ahead,
    v_ticket.os_access_code;
end
$$;

revoke all on function public.get_ticket_tracking(uuid) from public, anon, authenticated;
grant execute on function public.get_ticket_tracking(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

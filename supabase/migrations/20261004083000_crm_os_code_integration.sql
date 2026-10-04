begin;

create table if not exists private.ticket_os_codes (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  business_date date not null,
  access_code text not null check (access_code ~ '^[0-9]{4}$'),
  state text not null default 'available'
    check (state in ('available','reserved','used')),
  reservation_token uuid unique,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  used_at timestamptz,
  crm_order_id text,
  valid_until timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (business_date, access_code)
);

create index if not exists ticket_os_codes_reservation_idx
  on private.ticket_os_codes (reservation_token)
  where reservation_token is not null;

create index if not exists ticket_os_codes_active_idx
  on private.ticket_os_codes (business_date, state, valid_until);

create table if not exists private.crm_os_code_attempts (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default pg_catalog.clock_timestamp(),
  succeeded boolean not null
);

create index if not exists crm_os_code_attempts_recent_idx
  on private.crm_os_code_attempts (attempted_at desc);

revoke all on private.ticket_os_codes, private.crm_os_code_attempts
  from public, anon, authenticated;

create or replace function private.ensure_ticket_os_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  if exists (
    select 1 from private.ticket_os_codes code
    where code.ticket_id = new.id
  ) then
    return new;
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 100 then
      raise exception using errcode = 'P0001', message = 'Could not allocate OS access code';
    end if;

    v_code := pg_catalog.lpad(
      (((pg_catalog.hashtextextended(gen_random_uuid()::text, 0) & 9223372036854775807) % 10000)::text),
      4,
      '0'
    );

    begin
      insert into private.ticket_os_codes (
        ticket_id,
        business_date,
        access_code,
        valid_until
      ) values (
        new.id,
        new.business_date,
        v_code,
        ((new.business_date + 1)::timestamp at time zone 'America/Sao_Paulo')
      );
      exit;
    exception when unique_violation then
      -- Another ticket already owns this four-digit code for the business day.
    end;
  end loop;

  return new;
end
$$;

revoke all on function private.ensure_ticket_os_code() from public, anon, authenticated;

drop trigger if exists tickets_ensure_os_code on public.tickets;
create trigger tickets_ensure_os_code
after insert on public.tickets
for each row execute function private.ensure_ticket_os_code();

insert into private.ticket_os_codes (
  ticket_id,
  business_date,
  access_code,
  valid_until
)
select
  ticket.id,
  ticket.business_date,
  candidate.access_code,
  ((ticket.business_date + 1)::timestamp at time zone 'America/Sao_Paulo')
from public.tickets ticket
cross join lateral (
  select pg_catalog.lpad(candidate_number::text, 4, '0') as access_code
  from generate_series(0, 9999) candidate_number
  where not exists (
    select 1
    from private.ticket_os_codes existing
    where existing.business_date = ticket.business_date
      and existing.access_code = pg_catalog.lpad(candidate_number::text, 4, '0')
  )
  order by pg_catalog.hashtextextended(ticket.id::text || ':' || candidate_number::text, 0)
  limit 1
) candidate
where not exists (
  select 1 from private.ticket_os_codes existing
  where existing.ticket_id = ticket.id
)
on conflict (ticket_id) do nothing;

create or replace function private.issue_ticket_v3(
  p_type_id uuid,
  p_customer_name text default null
)
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
  tracking_token uuid,
  os_access_code text
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
           ticket.tracking_token,
           code.access_code
    from public.tickets ticket
    join public.ticket_types types on types.id = ticket.service_type_id
    join private.ticket_os_codes code on code.ticket_id = ticket.id
    where ticket.id = v_issued.id;
end
$$;

create or replace function public.issue_ticket_v3(
  p_type_id uuid,
  p_customer_name text default null
)
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
  tracking_token uuid,
  os_access_code text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.issue_ticket_v3(p_type_id, p_customer_name)
$$;

revoke all on function private.issue_ticket_v3(uuid, text)
  from public, anon, authenticated;
grant execute on function private.issue_ticket_v3(uuid, text) to authenticated;

revoke all on function public.issue_ticket_v3(uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_ticket_v3(uuid, text) to authenticated;

create or replace function public.reserve_ticket_os_code_for_crm(
  p_code text,
  p_ttl_seconds integer default 600
)
returns table (
  valid boolean,
  error_code text,
  external_ticket_id uuid,
  ticket_number text,
  service_type_name text,
  service_priority text,
  reservation_token uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_token uuid;
  v_expires_at timestamptz;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 600), 3600));
  v_recent_failures integer;
begin
  delete from private.crm_os_code_attempts
  where attempted_at < pg_catalog.clock_timestamp() - interval '7 days';

  select count(*)::integer
    into v_recent_failures
  from private.crm_os_code_attempts attempt
  where not attempt.succeeded
    and attempt.attempted_at >= pg_catalog.clock_timestamp() - interval '1 minute';

  if v_recent_failures >= 30 then
    return query
      select false, 'rate_limited'::text, null::uuid, null::text,
             null::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  update private.ticket_os_codes code
     set state = 'available',
         reservation_token = null,
         reserved_at = null,
         reservation_expires_at = null,
         updated_at = pg_catalog.clock_timestamp()
   where code.state = 'reserved'
     and code.reservation_expires_at <= pg_catalog.clock_timestamp()
     and code.valid_until > pg_catalog.clock_timestamp();

  select ticket.id,
         ticket.ticket_number,
         types.name as service_type_name,
         types.priority as service_priority,
         code.valid_until
    into v_ticket
  from private.ticket_os_codes code
  join public.tickets ticket on ticket.id = code.ticket_id
  join public.ticket_types types on types.id = ticket.service_type_id
  where code.business_date = private.business_date(pg_catalog.now())
    and code.access_code = pg_catalog.btrim(coalesce(p_code, ''))
    and code.state = 'available'
    and code.valid_until > pg_catalog.clock_timestamp()
    and ticket.status <> 'cancelled'
  for update of code
  limit 1;

  if not found then
    insert into private.crm_os_code_attempts (succeeded) values (false);
    return query
      select false, 'invalid_code'::text, null::uuid, null::text,
             null::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  v_token := gen_random_uuid();
  v_expires_at := least(
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => v_ttl),
    v_ticket.valid_until
  );

  update private.ticket_os_codes code
     set state = 'reserved',
         reservation_token = v_token,
         reserved_at = pg_catalog.clock_timestamp(),
         reservation_expires_at = v_expires_at,
         updated_at = pg_catalog.clock_timestamp()
   where code.ticket_id = v_ticket.id;

  insert into private.crm_os_code_attempts (succeeded) values (true);

  return query
    select true,
           null::text,
           v_ticket.id,
           v_ticket.ticket_number,
           v_ticket.service_type_name,
           v_ticket.service_priority,
           v_token,
           v_expires_at;
end
$$;

create or replace function public.consume_ticket_os_code_for_crm(
  p_reservation_token uuid,
  p_crm_order_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_reservation_token is null or nullif(pg_catalog.btrim(p_crm_order_id), '') is null then
    return false;
  end if;

  update private.ticket_os_codes code
     set state = 'used',
         used_at = pg_catalog.clock_timestamp(),
         crm_order_id = pg_catalog.btrim(p_crm_order_id),
         updated_at = pg_catalog.clock_timestamp()
   where code.reservation_token = p_reservation_token
     and code.state = 'reserved'
     and code.reservation_expires_at > pg_catalog.clock_timestamp()
     and code.valid_until > pg_catalog.clock_timestamp();

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end
$$;

create or replace function public.release_ticket_os_code_for_crm(
  p_reservation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_reservation_token is null then
    return false;
  end if;

  update private.ticket_os_codes code
     set state = 'available',
         reservation_token = null,
         reserved_at = null,
         reservation_expires_at = null,
         updated_at = pg_catalog.clock_timestamp()
   where code.reservation_token = p_reservation_token
     and code.state = 'reserved';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end
$$;

revoke all on function public.reserve_ticket_os_code_for_crm(text, integer)
  from public, anon, authenticated;
revoke all on function public.consume_ticket_os_code_for_crm(uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_ticket_os_code_for_crm(uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_ticket_os_code_for_crm(text, integer) to service_role;
grant execute on function public.consume_ticket_os_code_for_crm(uuid, text) to service_role;
grant execute on function public.release_ticket_os_code_for_crm(uuid) to service_role;

notify pgrst, 'reload schema';

commit;

-- Eletrônica Artvideo queue: customer data stays behind staff RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create or replace function private.business_date(p_at timestamptz default pg_catalog.now())
returns date
language sql
immutable
set search_path = ''
as $$ select (p_at at time zone 'America/Sao_Paulo')::date $$;
revoke all on function private.business_date(timestamptz) from public, anon;
grant execute on function private.business_date(timestamptz) to authenticated;

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  prefix text not null check (prefix ~ '^[A-Z0-9]{1,3}$'),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table private.daily_ticket_sequences (
  business_date date not null,
  service_type_id uuid not null references public.ticket_types (id) on delete restrict,
  last_number integer not null check (last_number > 0),
  primary key (business_date, service_type_id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  service_type_id uuid not null references public.ticket_types (id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  ticket_number text not null,
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  status text not null default 'waiting' check (status in ('waiting', 'called', 'serving', 'completed', 'cancelled')),
  counter_label text check (counter_label is null or char_length(counter_label) <= 40),
  created_at timestamptz not null default pg_catalog.now(),
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  unique (business_date, service_type_id, sequence_number)
);
create index tickets_queue_order_idx on public.tickets (business_date, service_type_id, status, sequence_number);

create table public.display_calls (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  ticket_number text not null,
  service_type_id uuid not null,
  service_type_name text not null,
  counter_label text not null,
  called_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index display_calls_recent_idx on public.display_calls (business_date, called_at desc);

create table public.display_media (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  url text not null check (url ~* '^https?://'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create or replace function private.is_queue_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.admin_users as admins where admins.user_id = auth.uid()
  )
$$;
revoke all on function private.is_queue_admin() from public, anon;
grant execute on function private.is_queue_admin() to authenticated;

alter table public.ticket_types enable row level security;
alter table public.tickets enable row level security;
alter table public.display_calls enable row level security;
alter table public.display_media enable row level security;

create policy "active ticket types are public" on public.ticket_types
  for select to anon, authenticated using (is_active);
create policy "admins read inactive ticket types" on public.ticket_types
  for select to authenticated using (private.is_queue_admin());
create policy "admins manage ticket types" on public.ticket_types
  for all to authenticated using (private.is_queue_admin()) with check (private.is_queue_admin());
create policy "admins read tickets" on public.tickets
  for select to authenticated using (private.is_queue_admin());
create policy "admins update tickets" on public.tickets
  for update to authenticated using (private.is_queue_admin()) with check (private.is_queue_admin());
create policy "display reads today's calls" on public.display_calls
  for select to anon, authenticated
  using (business_date = (pg_catalog.now() at time zone 'America/Sao_Paulo')::date);
create policy "display reads active media" on public.display_media
  for select to anon, authenticated using (is_active);
create policy "admins read inactive media" on public.display_media
  for select to authenticated using (private.is_queue_admin());
create policy "admins manage media" on public.display_media
  for all to authenticated using (private.is_queue_admin()) with check (private.is_queue_admin());

revoke all on public.ticket_types, public.tickets, public.display_calls, public.display_media from public, anon, authenticated;
grant select on public.ticket_types, public.display_calls, public.display_media to anon, authenticated;
grant insert, update, delete on public.ticket_types, public.display_media to authenticated;
grant select, update on public.tickets to authenticated;
revoke all on private.admin_users, private.daily_ticket_sequences from public, anon, authenticated;

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
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'Authentication required'; end if;
  if not private.is_queue_admin() and coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception using errcode = 'P0001', message = 'Ticket issuance is limited to anonymous kiosk or staff sessions';
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
    insert into public.tickets as ticket (
      business_date, service_type_id, sequence_number, ticket_number, customer_name
    ) values (
      v_business_date, p_type_id, v_sequence,
      v_type.prefix || '-' || pg_catalog.lpad(v_sequence::text, 3, '0'),
      nullif(pg_catalog.btrim(p_customer_name), '')
    ) returning ticket.id, ticket.business_date, ticket.sequence_number, ticket.ticket_number,
      ticket.service_type_id, v_type.name, ticket.status, ticket.created_at;
end
$$;

create or replace function private.record_display_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'called' and (tg_op = 'INSERT' or old.status is distinct from 'called' or old.called_at is distinct from new.called_at) then
    insert into public.display_calls (business_date, ticket_number, service_type_id, service_type_name, counter_label, called_at)
      select new.business_date, new.ticket_number, new.service_type_id, types.name,
        coalesce(new.counter_label, 'Atendimento'), coalesce(new.called_at, pg_catalog.clock_timestamp())
      from public.ticket_types as types where types.id = new.service_type_id;
  end if;
  return new;
end
$$;
create trigger tickets_record_display_call after insert or update of status, called_at on public.tickets
  for each row execute function private.record_display_call();
revoke all on function private.record_display_call() from public, anon, authenticated;

create or replace function private.call_next_ticket(p_type_id uuid, p_counter_label text default null)
returns table (id uuid, ticket_number text, service_type_id uuid, service_type_name text, counter_label text, called_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if not private.is_queue_admin() then raise exception using errcode = 'P0001', message = 'Admin access required'; end if;
  select * into v_ticket from public.tickets as ticket
    where ticket.business_date = private.business_date(pg_catalog.now())
      and ticket.service_type_id = p_type_id and ticket.status = 'waiting'
    order by ticket.sequence_number for update skip locked limit 1;
  if not found then raise exception using errcode = 'P0001', message = 'No waiting tickets'; end if;
  update public.tickets as ticket set status = 'called',
    counter_label = nullif(pg_catalog.btrim(p_counter_label), ''), called_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    where ticket.id = v_ticket.id returning * into v_ticket;
  return query select event.id, event.ticket_number, event.service_type_id,
    event.service_type_name, event.counter_label, event.called_at
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
  if not private.is_queue_admin() then raise exception using errcode = 'P0001', message = 'Admin access required'; end if;
  update public.tickets as ticket set called_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    where ticket.id = p_ticket_id and ticket.status = 'called';
  if not found then raise exception using errcode = 'P0001', message = 'Only a called ticket can be repeated'; end if;
  return query select event.id, event.ticket_number, event.service_type_id,
    event.service_type_name, event.counter_label, event.called_at
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
  if not private.is_queue_admin() then raise exception using errcode = 'P0001', message = 'Admin access required'; end if;
  update public.tickets as ticket set status = p_to_status,
    started_at = case when p_to_status = 'serving' then pg_catalog.clock_timestamp() else ticket.started_at end,
    completed_at = case when p_to_status in ('completed', 'cancelled') then pg_catalog.clock_timestamp() else ticket.completed_at end,
    cancelled_at = case when p_to_status = 'cancelled' then pg_catalog.clock_timestamp() else ticket.cancelled_at end,
    updated_at = pg_catalog.clock_timestamp()
    where ticket.id = p_ticket_id and (
      (ticket.status = 'called' and p_to_status = 'serving') or
      (ticket.status in ('waiting', 'called') and p_to_status = 'cancelled') or
      (ticket.status = 'serving' and p_to_status = 'completed')
    ) returning * into v_ticket;
  if not found then raise exception using errcode = 'P0001', message = 'Invalid ticket status transition'; end if;
  return query select v_ticket.id, v_ticket.sequence_number, v_ticket.ticket_number,
    v_ticket.customer_name, v_ticket.service_type_id, types.name, v_ticket.status,
    v_ticket.counter_label, v_ticket.created_at, v_ticket.called_at, v_ticket.started_at, v_ticket.completed_at, v_ticket.cancelled_at
    from public.ticket_types as types where types.id = v_ticket.service_type_id;
end
$$;

create or replace function public.issue_ticket(p_type_id uuid, p_customer_name text default null)
returns table (id uuid, business_date date, sequence_number integer, ticket_number text, service_type_id uuid, service_type_name text, status text, created_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.issue_ticket(p_type_id, p_customer_name) $$;
create or replace function public.is_queue_admin()
returns boolean
language sql security invoker set search_path = ''
as $$ select private.is_queue_admin() $$;
create or replace function public.call_next_ticket(p_type_id uuid, p_counter_label text default null)
returns table (id uuid, ticket_number text, service_type_id uuid, service_type_name text, counter_label text, called_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.call_next_ticket(p_type_id, p_counter_label) $$;
create or replace function public.repeat_ticket_call(p_ticket_id uuid)
returns table (id uuid, ticket_number text, service_type_id uuid, service_type_name text, counter_label text, called_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.repeat_ticket_call(p_ticket_id) $$;
create or replace function public.transition_ticket(p_ticket_id uuid, p_to_status text)
returns table (id uuid, sequence_number integer, ticket_number text, customer_name text, service_type_id uuid, service_type_name text, status text, counter_label text, created_at timestamptz, called_at timestamptz, started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.transition_ticket(p_ticket_id, p_to_status) $$;

revoke all on function private.issue_ticket(uuid, text), private.call_next_ticket(uuid, text), private.repeat_ticket_call(uuid), private.transition_ticket(uuid, text) from public, anon, authenticated;
grant execute on function private.issue_ticket(uuid, text) to authenticated;
grant execute on function private.call_next_ticket(uuid, text), private.repeat_ticket_call(uuid), private.transition_ticket(uuid, text) to authenticated;
revoke all on function public.issue_ticket(uuid, text), public.is_queue_admin(), public.call_next_ticket(uuid, text), public.repeat_ticket_call(uuid), public.transition_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.is_queue_admin() to authenticated;
grant execute on function public.issue_ticket(uuid, text) to authenticated;
grant execute on function public.call_next_ticket(uuid, text), public.repeat_ticket_call(uuid), public.transition_ticket(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.display_calls;
  end if;
exception when duplicate_object then null;
end
$$;

-- Direct thermal printing: private queue consumed by the Artvideo Windows print agent.
create table if not exists private.print_agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(name) between 2 and 80),
  agent_token text not null unique check (char_length(agent_token) >= 64),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz
);

create table if not exists private.print_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  agent_id uuid not null references private.print_agents (id) on delete restrict,
  requested_by uuid not null,
  ticket_number text not null,
  service_type_name text not null,
  issued_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'printed', 'error')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  error_message text
);
create index if not exists print_jobs_agent_status_created_idx
  on private.print_jobs (agent_id, status, created_at);

revoke all on private.print_agents, private.print_jobs from public, anon, authenticated;

create or replace function public.create_print_agent(p_name text, p_slug text default 'reception')
returns table (id uuid, slug text, name text, token text, is_active boolean, created_at timestamptz, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_agent record;
begin
  if not private.is_queue_admin() then raise exception using errcode = 'P0001', message = 'Admin access required'; end if;
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
  if not private.is_queue_admin() then raise exception using errcode = 'P0001', message = 'Admin access required'; end if;
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
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'Authentication required'; end if;
  if not private.is_queue_admin() and coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception using errcode = 'P0001', message = 'Ticket printing is limited to kiosk or staff sessions';
  end if;
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

create or replace function public.get_print_job_status(p_job_id uuid)
returns table (id uuid, status text, error_message text, completed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job record;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'Authentication required'; end if;
  select * into v_job from private.print_jobs as job where job.id = p_job_id;
  if not found or (v_job.requested_by <> auth.uid() and not private.is_queue_admin()) then
    raise exception using errcode = 'P0001', message = 'Print job not found';
  end if;
  return query select v_job.id, v_job.status, v_job.error_message, v_job.completed_at;
end
$$;

create or replace function public.claim_next_print_job(p_agent_slug text, p_agent_token text)
returns table (job_id uuid, ticket_number text, service_type_name text, issued_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_agent record;
  v_job record;
begin
  select * into v_agent from private.print_agents as agent
    where agent.slug = p_agent_slug and agent.agent_token = p_agent_token and agent.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'Invalid print agent credentials'; end if;
  update private.print_agents set last_seen_at = pg_catalog.clock_timestamp() where id = v_agent.id;
  update private.print_jobs set status = 'pending', claimed_at = null, error_message = 'Recovered after agent timeout'
    where agent_id = v_agent.id and status = 'processing'
      and claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes' and attempts < 3;
  update private.print_jobs set status = 'error', completed_at = pg_catalog.clock_timestamp(), error_message = 'Print agent stopped while processing'
    where agent_id = v_agent.id and status = 'processing'
      and claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes' and attempts >= 3;
  select * into v_job from private.print_jobs as job
    where job.agent_id = v_agent.id and job.status = 'pending'
    order by job.created_at for update skip locked limit 1;
  if not found then return; end if;
  update private.print_jobs set status = 'processing', attempts = attempts + 1,
    claimed_at = pg_catalog.clock_timestamp(), error_message = null
    where id = v_job.id returning * into v_job;
  return query select v_job.id, v_job.ticket_number, v_job.service_type_name, v_job.issued_at;
end
$$;

create or replace function public.complete_print_job(
  p_agent_slug text, p_agent_token text, p_job_id uuid, p_success boolean, p_error_message text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_agent record;
begin
  select * into v_agent from private.print_agents as agent
    where agent.slug = p_agent_slug and agent.agent_token = p_agent_token and agent.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'Invalid print agent credentials'; end if;
  update private.print_agents set last_seen_at = pg_catalog.clock_timestamp() where id = v_agent.id;
  update private.print_jobs
    set status = case when p_success then 'printed' else 'error' end,
        completed_at = pg_catalog.clock_timestamp(),
        error_message = case when p_success then null else left(coalesce(p_error_message, 'Unknown printer error'), 500) end
    where id = p_job_id and agent_id = v_agent.id and status = 'processing';
  if not found then raise exception using errcode = 'P0001', message = 'Print job not found or not processing'; end if;
  return true;
end
$$;

revoke all on function public.create_print_agent(text, text), public.list_print_agents(),
  public.request_ticket_print(uuid, text), public.get_print_job_status(uuid),
  public.claim_next_print_job(text, text), public.complete_print_job(text, text, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.create_print_agent(text, text), public.list_print_agents(),
  public.request_ticket_print(uuid, text), public.get_print_job_status(uuid) to authenticated;
grant execute on function public.claim_next_print_job(text, text),
  public.complete_print_job(text, text, uuid, boolean, text) to anon, authenticated;


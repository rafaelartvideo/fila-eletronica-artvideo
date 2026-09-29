-- Execute este script uma vez no Supabase usado pelo sistema de filas.

-- Direct thermal printing: private queue consumed by the Artvideo Windows print agent.
create schema if not exists private;
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

create or replace function public.create_print_agent(
  p_name text,
  p_slug text default 'reception'
)
returns table (
  id uuid,
  slug text,
  name text,
  token text,
  is_active boolean,
  created_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $
declare
  v_token text;
  v_agent record;
begin
  if not private.is_queue_admin() then
    raise exception using errcode = 'P0001', message = 'Admin access required';
  end if;

  if p_name is null or char_length(pg_catalog.btrim(p_name)) < 2 then
    raise exception using errcode = 'P0001', message = 'Print agent name is required';
  end if;

  if p_slug is null or pg_catalog.btrim(p_slug) !~ '^[a-z0-9][a-z0-9_-]{1,39}()
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

 then
    raise exception using errcode = 'P0001', message = 'Invalid print agent slug';
  end if;

  v_token :=
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '') ||
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into private.print_agents as pa (slug, name, agent_token, is_active)
  values (pg_catalog.btrim(p_slug), pg_catalog.btrim(p_name), v_token, true)
  on conflict on constraint print_agents_slug_key
  do update
    set name = excluded.name,
        agent_token = excluded.agent_token,
        is_active = true
  returning
    pa.id,
    pa.slug,
    pa.name,
    pa.is_active,
    pa.created_at,
    pa.last_seen_at
  into
    v_agent;

  return query
    select
      v_agent.id,
      v_agent.slug,
      v_agent.name,
      v_token,
      v_agent.is_active,
      v_agent.created_at,
      v_agent.last_seen_at;
end
$;

create or replace function public.list_print_agents()
returns table (
  id uuid,
  slug text,
  name text,
  is_active boolean,
  created_at timestamptz,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $
  select
    pa.id,
    pa.slug,
    pa.name,
    pa.is_active,
    pa.created_at,
    pa.last_seen_at
  from private.print_agents as pa
  where private.is_queue_admin()
  order by pa.created_at;
$;

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


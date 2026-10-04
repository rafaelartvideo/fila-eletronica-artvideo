begin;

alter table private.print_jobs
  add column if not exists os_access_code text;

do $$
begin
  alter table private.print_jobs
    add constraint print_jobs_os_access_code_check
    check (os_access_code is null or os_access_code ~ '^[0-9]{4}$');
exception when duplicate_object then null;
end
$$;

create or replace function public.request_ticket_print(
  p_ticket_id uuid,
  p_agent_slug text default 'reception'
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_agent record;
  v_service_name text;
  v_os_access_code text;
  v_job record;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'Authentication required';
  end if;

  if not private.is_queue_admin()
     and coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception using errcode = 'P0001', message = 'Ticket printing is limited to kiosk or staff sessions';
  end if;

  select *
    into v_ticket
  from public.tickets as ticket
  where ticket.id = p_ticket_id
    and ticket.business_date = private.business_date(pg_catalog.now());

  if not found then
    raise exception using errcode = 'P0001', message = 'Ticket not found for today';
  end if;

  select types.name
    into v_service_name
  from public.ticket_types as types
  where types.id = v_ticket.service_type_id;

  select code.access_code
    into v_os_access_code
  from private.ticket_os_codes as code
  where code.ticket_id = v_ticket.id;

  select *
    into v_agent
  from private.print_agents as agent
  where agent.slug = p_agent_slug
    and agent.is_active;

  if not found then
    raise exception using errcode = 'P0001', message = 'Print agent not configured';
  end if;

  insert into private.print_jobs (
    ticket_id,
    agent_id,
    requested_by,
    ticket_number,
    service_type_name,
    issued_at,
    os_access_code
  ) values (
    v_ticket.id,
    v_agent.id,
    auth.uid(),
    v_ticket.ticket_number,
    v_service_name,
    v_ticket.created_at,
    v_os_access_code
  )
  returning * into v_job;

  return query select v_job.id, v_job.status;
end
$$;

drop function if exists public.claim_next_print_job(text, text);

create function public.claim_next_print_job(
  p_agent_slug text,
  p_agent_token text
)
returns table (
  job_id uuid,
  ticket_number text,
  service_type_name text,
  issued_at timestamptz,
  os_access_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent record;
  v_job record;
begin
  select *
    into v_agent
  from private.print_agents as agent
  where agent.slug = p_agent_slug
    and agent.agent_token = p_agent_token
    and agent.is_active;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invalid print agent credentials';
  end if;

  update private.print_agents
    set last_seen_at = pg_catalog.clock_timestamp()
    where id = v_agent.id;

  update private.print_jobs
    set status = 'pending',
        claimed_at = null,
        error_message = 'Recovered after agent timeout'
    where agent_id = v_agent.id
      and status = 'processing'
      and claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes'
      and attempts < 3;

  update private.print_jobs
    set status = 'error',
        completed_at = pg_catalog.clock_timestamp(),
        error_message = 'Print agent stopped while processing'
    where agent_id = v_agent.id
      and status = 'processing'
      and claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes'
      and attempts >= 3;

  select *
    into v_job
  from private.print_jobs as job
  where job.agent_id = v_agent.id
    and job.status = 'pending'
  order by job.created_at
  for update skip locked
  limit 1;

  if not found then return; end if;

  update private.print_jobs
    set status = 'processing',
        attempts = attempts + 1,
        claimed_at = pg_catalog.clock_timestamp(),
        error_message = null
    where id = v_job.id
  returning * into v_job;

  return query
    select
      v_job.id,
      v_job.ticket_number,
      v_job.service_type_name,
      v_job.issued_at,
      v_job.os_access_code;
end
$$;

revoke all on function public.request_ticket_print(uuid, text),
  public.claim_next_print_job(text, text)
from public, anon, authenticated;

grant execute on function public.request_ticket_print(uuid, text) to authenticated;
grant execute on function public.claim_next_print_job(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

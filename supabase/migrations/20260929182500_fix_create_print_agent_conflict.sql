-- Avoid PL/pgSQL output-column ambiguity in create_print_agent.
create or replace function public.create_print_agent(p_name text, p_slug text default 'reception')
returns table (id uuid, slug text, name text, token text, is_active boolean, created_at timestamptz, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_agent private.print_agents%rowtype;
begin
  if not private.is_queue_admin() then
    raise exception using errcode = 'P0001', message = 'Admin access required';
  end if;

  if p_name is null or char_length(pg_catalog.btrim(p_name)) < 2 then
    raise exception using errcode = 'P0001', message = 'Print agent name is required';
  end if;

  if p_slug is null or pg_catalog.btrim(p_slug) !~ '^[a-z0-9][a-z0-9_-]{1,39}$' then
    raise exception using errcode = 'P0001', message = 'Invalid print agent slug';
  end if;

  v_token :=
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '') ||
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into private.print_agents as agent (slug, name, agent_token, is_active)
    values (pg_catalog.btrim(p_slug), pg_catalog.btrim(p_name), v_token, true)
    on conflict on constraint print_agents_slug_key
    do update
      set name = excluded.name,
          agent_token = excluded.agent_token,
          is_active = true
    returning agent.* into v_agent;

  return query
    select v_agent.id, v_agent.slug, v_agent.name, v_token,
      v_agent.is_active, v_agent.created_at, v_agent.last_seen_at;
end
$$;

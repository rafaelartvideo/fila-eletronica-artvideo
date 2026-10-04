-- Exposição interna de métricas da Fila para a ponte do CRM.
-- Apenas service_role pode executar; não altera o funcionamento da fila.

begin;

create or replace function public.crm_queue_usage_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'queue_units', 1,
    'active_attendants', (select count(*) from public.queue_users where is_active),
    'active_ticket_types', (select count(*) from public.ticket_types where is_active),
    'active_media', (select count(*) from public.display_media where is_active),
    'tickets_total', (select count(*) from public.tickets),
    'tickets_today', (select count(*) from public.tickets where business_date = current_date),
    'tickets_30d', (select count(*) from public.tickets where created_at >= now() - interval '30 days'),
    'calls_30d', (select count(*) from public.display_calls where called_at >= now() - interval '30 days'),
    'database_bytes', pg_catalog.pg_database_size(current_database()),
    'storage_bytes', (
      select coalesce(sum(nullif((metadata ->> 'size')::bigint, 0)), 0)
      from storage.objects
      where coalesce(is_delete_marker, false) = false
    ),
    'storage_objects', (
      select count(*)
      from storage.objects
      where coalesce(is_delete_marker, false) = false
    ),
    'measured_at', now()
  );
$$;

revoke all on function public.crm_queue_usage_snapshot_v1() from public, anon, authenticated;
grant execute on function public.crm_queue_usage_snapshot_v1() to service_role;

commit;

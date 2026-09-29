begin;
select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'queue-test@local.invalid', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now())
on conflict (id) do nothing;
insert into private.admin_users (user_id)
values ('00000000-0000-4000-8000-000000000001') on conflict do nothing;

-- The authenticated caller is provisioned as an admin by the test setup.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.ticket_types (id, name, prefix, is_active, sort_order)
values ('10000000-0000-4000-8000-000000000001', 'Conserto', 'C', true, 1);
insert into public.ticket_types (id, name, prefix, is_active, sort_order)
values ('10000000-0000-4000-8000-000000000002', 'Orçamento', 'O', false, 2);

select is(
  (select sequence_number from public.issue_ticket('10000000-0000-4000-8000-000000000001', 'Cliente A')),
  1,
  'first ticket starts at one'
);
select is(
  (select sequence_number from public.issue_ticket('10000000-0000-4000-8000-000000000001', 'Cliente B')),
  2,
  'numbers increment sequentially'
);
select throws_ok(
  $$select public.issue_ticket('10000000-0000-4000-8000-000000000002', null)$$,
  'P0001', null, 'inactive or unknown service is rejected'
);

select is((select ticket_number from public.call_next_ticket('10000000-0000-4000-8000-000000000001', 'Balcão 1')), 'C001', 'call returns formatted public ticket');
select is((select status from public.transition_ticket((select id from public.tickets where sequence_number = 1), 'serving')), 'serving', 'called ticket can start service');
select throws_ok(
  $$select public.transition_ticket((select id from public.tickets where sequence_number = 1), 'waiting')$$,
  'P0001', null, 'invalid transition is rejected'
);
select is((select status from public.transition_ticket((select id from public.tickets where sequence_number = 1), 'completed')), 'completed', 'serving ticket can complete');
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'display_calls'
      and column_name in ('customer_name', 'customer_phone', 'email')
  ),
  'display table has no customer identity columns'
);
select ok(
  exists (select 1 from public.display_calls where ticket_number = 'C001' and counter_label = 'Balcão 1'),
  'call event is copied to sanitized display feed'
);
select is(
  private.business_date('2026-01-02 02:59:59+00')::text,
  '2026-01-01',
  'business day before Sao Paulo midnight uses the previous date'
);
select is(
  private.business_date('2026-01-02 03:00:00+00')::text,
  '2026-01-02',
  'business date rolls over at Sao Paulo midnight'
);
select is(public.is_queue_admin(), true, 'admin route check returns membership without exposing admin rows');
select ok(not has_table_privilege('anon', 'public.tickets', 'select'), 'anonymous role cannot read private ticket rows directly');
select ok(has_table_privilege('anon', 'public.ticket_types', 'select'), 'anonymous role can discover public service types');
select ok(not has_function_privilege('anon', 'public.issue_ticket(uuid,text)', 'execute'), 'ticket issuance requires an Auth session');

select * from finish();
rollback;

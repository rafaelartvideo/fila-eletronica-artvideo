import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migrationPath = new URL('../supabase/migrations/20260929120708_queue_system.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;
  `);
  await db.exec(migration);

  const adminId = '00000000-0000-4000-8000-000000000001';
  const serviceId = '10000000-0000-4000-8000-000000000001';
  const kioskServiceId = '10000000-0000-4000-8000-000000000002';
  await db.query(`insert into auth.users (id) values ($1)`, [adminId]);
  await db.query(`insert into private.admin_users (user_id) values ($1)`, [adminId]);
  await db.query(`insert into public.ticket_types (id, name, prefix) values ($1, 'Conserto', 'C')`, [serviceId]);
  await db.query(`insert into public.ticket_types (id, name, prefix) values ($1, 'Retirada', 'R')`, [kioskServiceId]);
  await db.exec(`set role anon`);
  const publicTypes = await db.query(`select name from public.ticket_types order by name`);
  assert.deepEqual(publicTypes.rows.map(({ name }) => name), ['Conserto', 'Retirada'], 'anonymous kiosk can list active service types without private schema access');
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [adminId]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: adminId, role: 'authenticated' })]);

  const first = await db.query(`select * from public.issue_ticket($1, 'Cliente A')`, [serviceId]);
  const second = await db.query(`select * from public.issue_ticket($1, 'Cliente B')`, [serviceId]);
  assert.equal(first.rows[0].sequence_number, 1, 'first daily ticket starts at 1');
  assert.equal(second.rows[0].sequence_number, 2, 'daily tickets increment');

  const kioskId = '00000000-0000-4000-8000-000000000002';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [kioskId]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: kioskId, role: 'authenticated' })]);
  await assert.rejects(
    db.query(`select * from public.issue_ticket($1, null)`, [kioskServiceId]),
    /anonymous kiosk or staff sessions/i,
    'regular authenticated users cannot issue kiosk tickets',
  );
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: kioskId, role: 'authenticated', is_anonymous: true })]);
  const kioskTicket = await db.query(`select * from public.issue_ticket($1, null)`, [kioskServiceId]);
  assert.equal(kioskTicket.rows[0].sequence_number, 1, 'anonymous kiosk session can issue tickets');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [adminId]);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: adminId, role: 'authenticated' })]);

  await assert.rejects(
    db.query(`select * from public.issue_ticket($1, null)`, ['10000000-0000-4000-8000-000000000099']),
    /service|type|active|not found/i,
    'unknown/inactive service is rejected',
  );

  const called = await db.query(`select * from public.call_next_ticket($1, 'Balcão 1')`, [serviceId]);
  assert.equal(called.rows[0].ticket_number, 'C-001');
  assert.equal(called.rows[0].counter_label, 'Balcão 1');
  const serving = await db.query(`select * from public.transition_ticket($1, 'serving')`, [first.rows[0].id]);
  assert.equal(serving.rows[0].status, 'serving');
  await assert.rejects(
    db.query(`select * from public.transition_ticket($1, 'waiting')`, [first.rows[0].id]),
    /transition|status/i,
    'invalid transition is rejected',
  );
  const completed = await db.query(`select * from public.transition_ticket($1, 'completed')`, [first.rows[0].id]);
  assert.equal(completed.rows[0].status, 'completed');

  const columns = await db.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='display_calls'
  `);
  assert(!columns.rows.some(({ column_name }) => /customer|phone|email|ticket_id/.test(column_name)), 'display feed contains no customer or private identifiers');
  const ticketReadGrant = await db.query(`select has_table_privilege('anon', 'public.tickets', 'select') as granted`);
  assert.equal(ticketReadGrant.rows[0].granted, false, 'anonymous role cannot read ticket rows directly');
  const kioskGrants = await db.query(`select has_table_privilege('anon', 'public.ticket_types', 'select') as can_list, has_function_privilege('anon', 'public.issue_ticket(uuid,text)', 'execute') as can_issue`);
  assert.deepEqual(kioskGrants.rows[0], { can_list: true, can_issue: false }, 'anonymous can list services but must sign in before issuing');
  const events = await db.query(`select * from public.display_calls where ticket_number='C-001' and counter_label='Balcão 1'`);
  assert.equal(events.rows.length, 1, 'call trigger creates sanitized display event');

  const saoPauloDate = await db.query(`select private.business_date('2026-01-02 02:59:59+00')::text as before, private.business_date('2026-01-02 03:00:00+00')::text as after`);
  assert.deepEqual(saoPauloDate.rows[0], { before: '2026-01-01', after: '2026-01-02' }, 'business date rolls over at Sao Paulo midnight');

  console.log('Database contract passed: public service access, kiosk Auth, sequence, transitions, sanitized calls, São Paulo midnight.');
} finally {
  await db.close();
}

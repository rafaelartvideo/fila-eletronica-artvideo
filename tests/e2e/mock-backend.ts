import type { Page } from '@playwright/test';

type Ticket = {
  id: string; business_date: string; service_type_id: string; sequence_number: number; ticket_number: string;
  customer_name: string | null; status: string; counter_label: string | null; created_at: string;
  called_at: string | null; started_at: string | null; completed_at: string | null; cancelled_at: string | null;
};

export async function mockBackend(page: Page) {
  const service = { id: 'service-repair', name: 'Conserto', prefix: 'C', is_active: true, sort_order: 0 };
  const tickets: Ticket[] = [];
  const calls: Array<Record<string, unknown>> = [];
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    if (url.pathname === '/auth/v1/token') {
      const now = Math.floor(Date.now() / 1000);
      return json({ access_token: 'e2e-access-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'e2e-refresh-token', user: { id: 'staff-1', aud: 'authenticated', role: 'authenticated', email: 'staff@artvideo.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() } });
    }
    if (url.pathname === '/auth/v1/signup') {
      const now = Math.floor(Date.now() / 1000);
      return json({ access_token: 'e2e-anonymous-access-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'e2e-anonymous-refresh-token', user: { id: 'anonymous-1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: { provider: 'anonymous', providers: ['anonymous'] }, user_metadata: {}, created_at: new Date().toISOString() } });
    }
    if (url.pathname === '/rest/v1/rpc/is_queue_admin') return json(true);
    if (url.pathname === '/rest/v1/ticket_types') return json([service]);
    if (url.pathname === '/rest/v1/display_media') return json([]);
    if (url.pathname === '/rest/v1/display_calls') return json([...calls].reverse());
    if (url.pathname === '/rest/v1/tickets' && request.method() === 'GET') return json(tickets.map((ticket) => ({ ...ticket, ticket_types: { name: service.name } })));
    if (url.pathname === '/rest/v1/rpc/issue_ticket') {
      const body = request.postDataJSON() as { p_type_id: string; p_customer_name: string | null };
      const sequence = tickets.filter((ticket) => ticket.service_type_id === body.p_type_id).length + 1;
      const ticket: Ticket = { id: `ticket-${sequence}`, business_date: '2026-09-29', service_type_id: body.p_type_id, sequence_number: sequence, ticket_number: `C${String(sequence).padStart(3, '0')}`, customer_name: body.p_customer_name ?? null, status: 'waiting', counter_label: null, created_at: new Date().toISOString(), called_at: null, started_at: null, completed_at: null, cancelled_at: null };
      tickets.push(ticket);
      return json([{ id: ticket.id, business_date: ticket.business_date, sequence_number: sequence, ticket_number: ticket.ticket_number, service_type_id: service.id, service_type_name: service.name, status: ticket.status, created_at: ticket.created_at }]);
    }
    if (url.pathname === '/rest/v1/rpc/call_next_ticket') {
      const body = request.postDataJSON() as { p_type_id: string; p_counter_label: string };
      const ticket = tickets.find((row) => row.service_type_id === body.p_type_id && row.status === 'waiting');
      if (!ticket) return json({ message: 'No waiting tickets' }, 400);
      ticket.status = 'called'; ticket.counter_label = body.p_counter_label; ticket.called_at = new Date().toISOString();
      const call = { id: `call-${calls.length + 1}`, ticket_number: ticket.ticket_number, service_type_id: service.id, service_type_name: service.name, counter_label: ticket.counter_label, called_at: ticket.called_at };
      calls.push(call);
      return json([call]);
    }
    if (url.pathname === '/rest/v1/rpc/transition_ticket') {
      const body = request.postDataJSON() as { p_ticket_id: string; p_to_status: string };
      const ticket = tickets.find((row) => row.id === body.p_ticket_id);
      if (!ticket) return json({ message: 'Ticket not found' }, 404);
      ticket.status = body.p_to_status;
      if (body.p_to_status === 'serving') ticket.started_at = new Date().toISOString();
      if (body.p_to_status === 'completed') ticket.completed_at = new Date().toISOString();
      return json([{ ...ticket, service_type_name: service.name }]);
    }
    if (url.pathname === '/rest/v1/rpc/repeat_ticket_call') return json(calls.length ? [calls.at(-1)] : []);
    return json({ message: `Unmocked API route: ${request.method()} ${url.pathname}` }, 404);
  });
}

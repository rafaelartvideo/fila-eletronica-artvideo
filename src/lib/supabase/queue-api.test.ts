import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, getSession } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getSession: vi.fn() }));
vi.mock('./client', () => ({ supabase: { rpc, from, auth: { getSession } }, requireSupabase: () => ({ rpc, from, auth: { getSession } }) }));

import { callNextTicket, issueTicket, repeatTicketCall, transitionTicket } from './queue-api';

describe('queue API', () => {
  beforeEach(() => {
    rpc.mockReset(); getSession.mockReset().mockResolvedValue({ data: { session: { user: { is_anonymous: false } } }, error: null });
  });

  it('maps issue ticket inputs to the database RPC contract', async () => {
    rpc.mockResolvedValue({ data: [{ id: 't1', sequence_number: 8, ticket_number: 'C-008', service_type_id: 'type1', service_type_name: 'Conserto', status: 'waiting', created_at: '2026-01-01T12:00:00Z' }], error: null });
    await expect(issueTicket({ typeId: 'type1', customerName: 'João' })).resolves.toMatchObject({ ticketNumber: 'C-008', customerName: null });
    expect(rpc).toHaveBeenCalledWith('issue_ticket_v2', { p_type_id: 'type1', p_customer_name: 'João' });
  });

  it('blocks ticket issuance without a staff session', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(issueTicket({ typeId: 'type1' })).rejects.toThrow('Entre no painel da equipe para gerar uma senha.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps queue actions to their RPCs and parameters', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'event1', ticket_number: 'C-001', service_type_id: 'type2', service_type_name: 'Conserto', counter_label: 'Balcão 3', called_at: '2026-01-01T12:00:00Z' }], error: null });
    await callNextTicket('Balcão 3');
    await repeatTicketCall('ticket1');
    await transitionTicket('ticket2', 'serving');
    expect(rpc.mock.calls).toEqual([
      ['call_next_waiting_ticket', { p_counter_label: 'Balcão 3' }],
      ['repeat_ticket_call', { p_ticket_id: 'ticket1' }],
      ['transition_ticket', { p_ticket_id: 'ticket2', p_to_status: 'serving' }],
    ]);
  });

  it('turns database failures into a useful Portuguese message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'No waiting tickets' } });
    await expect(callNextTicket()).rejects.toThrow('Não há senhas aguardando na fila.');
  });
});

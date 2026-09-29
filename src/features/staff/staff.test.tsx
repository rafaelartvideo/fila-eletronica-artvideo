import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listTicketTypes, listQueueTickets, callNextTicket, issueTicket, transitionTicket, repeatTicketCall, authState } = vi.hoisted(() => ({
  listTicketTypes: vi.fn(), listQueueTickets: vi.fn(), callNextTicket: vi.fn(), issueTicket: vi.fn(), transitionTicket: vi.fn(), repeatTicketCall: vi.fn(),
  authState: { session: null as unknown, isAdmin: false, loading: false },
}));
vi.mock('../../lib/supabase/queue-api', () => ({ listTicketTypes, listQueueTickets, callNextTicket, issueTicket, transitionTicket, repeatTicketCall }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ ...authState, signOut: vi.fn() }) }));

import { RequireAdmin } from '../auth/RequireAdmin';
import { StaffPage } from './StaffPage';

const service = { id: 'service-1', name: 'Conserto', prefix: 'C', isActive: true, sortOrder: 0 };
const ticket = { id: 'ticket-1', ticketNumber: 'C001', sequenceNumber: 1, businessDate: '2026-01-01', serviceTypeId: 'service-1', serviceTypeName: 'Conserto', customerName: 'Maria', status: 'waiting' as const, counterLabel: null, createdAt: '2026-01-01T12:00:00Z', calledAt: null, servingAt: null, completedAt: null, cancelledAt: null };

describe('staff panel', () => {
  beforeEach(() => {
    listTicketTypes.mockReset().mockResolvedValue([service]);
    listQueueTickets.mockReset().mockResolvedValue([ticket]);
    callNextTicket.mockReset().mockResolvedValue({});
    issueTicket.mockReset().mockResolvedValue({});
    transitionTicket.mockReset().mockResolvedValue({});
    repeatTicketCall.mockReset().mockResolvedValue({});
    authState.session = null;
    authState.isAdmin = false;
    authState.loading = false;
  });

  it('denies the staff page without an administrator session', () => {
    render(<MemoryRouter initialEntries={['/painel']}><Routes><Route path="/painel" element={<RequireAdmin><div>painel secreto</div></RequireAdmin>} /><Route path="/painel/login" element={<div>Entre na sua conta</div>} /></Routes></MemoryRouter>);
    expect(screen.getByText('Entre na sua conta')).toBeInTheDocument();
    expect(screen.queryByText('painel secreto')).not.toBeInTheDocument();
  });

  it('disables the next-call action while the request is pending', async () => {
    authState.session = {};
    authState.isAdmin = true;
    let finish!: (value: unknown) => void;
    callNextTicket.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MemoryRouter><StaffPage /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: /chamar próxima/i });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    finish({});
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('lets staff issue a ticket and prepare a WhatsApp message', async () => {
    authState.session = {};
    authState.isAdmin = true;
    issueTicket.mockResolvedValue({ ticketNumber: 'C002', serviceTypeName: 'Conserto' });
    render(<MemoryRouter><StaffPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /gerar senha/i }));
    fireEvent.change(screen.getByLabelText(/WhatsApp/i), { target: { value: '11912345678' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar e gerar/i }));
    await waitFor(() => expect(issueTicket).toHaveBeenCalledWith({ typeId: 'service-1' }));
    expect(await screen.findByRole('link', { name: /Enviar pelo WhatsApp/i })).toHaveAttribute('href', expect.stringContaining('C002'));
  });

  it('reloads the queue after midnight in São Paulo', async () => {
    authState.session = {};
    authState.isAdmin = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T02:59:30Z'));
    try {
      render(<MemoryRouter><StaffPage /></MemoryRouter>);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(listQueueTickets).toHaveBeenCalledWith('2026-01-01');
      listQueueTickets.mockClear();

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(listQueueTickets).toHaveBeenCalledWith('2026-01-02');
    } finally {
      vi.useRealTimers();
    }
  });
});

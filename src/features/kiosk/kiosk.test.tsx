import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listTicketTypes, issueTicket, subscribeToQueueChanges, requestTicketPrint, getPrintJobStatus } = vi.hoisted(() => ({
  listTicketTypes: vi.fn(), issueTicket: vi.fn(), subscribeToQueueChanges: vi.fn(), requestTicketPrint: vi.fn(), getPrintJobStatus: vi.fn(),
}));
vi.mock('../../lib/supabase/queue-api', () => ({ listTicketTypes, issueTicket, subscribeToQueueChanges, requestTicketPrint, getPrintJobStatus }));
import { KioskPage } from './KioskPage';

const types = [
  { id: 'repair', name: 'Conserto', prefix: 'C', priority: 'normal', isActive: true, sortOrder: 0 },
  { id: 'pickup', name: 'Retirada', prefix: 'R', priority: 'normal', isActive: false, sortOrder: 1 },
];

function openKiosk() {
  return render(<MemoryRouter><KioskPage /></MemoryRouter>);
}

describe('customer kiosk', () => {
  beforeEach(() => {
    listTicketTypes.mockReset().mockResolvedValue(types);
    issueTicket.mockReset().mockResolvedValue({ id: 'ticket-8', ticketNumber: 'C008', sequenceNumber: 8, serviceTypeName: 'Conserto', createdAt: '2026-09-29T14:00:00-03:00', osAccessCode: '4821', trackingToken: '11111111-1111-4111-8111-111111111111' });
    subscribeToQueueChanges.mockReset().mockReturnValue({ unsubscribe: vi.fn() });
    requestTicketPrint.mockReset().mockResolvedValue({ id: 'print-1', status: 'pending' });
    getPrintJobStatus.mockReset().mockResolvedValue({ id: 'print-1', status: 'printed', errorMessage: null, completedAt: '2026-09-29T14:00:01-03:00' });
  });

  it('shows active service types only and issues a ticket without a name', async () => {
    openKiosk();
    expect(await screen.findByRole('button', { name: /Conserto/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirada/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Conserto/i }));
    expect(screen.queryByLabelText(/seu nome/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gerar senha/i }));
    expect(await screen.findByText('C008')).toBeInTheDocument();
    expect(issueTicket).toHaveBeenCalledWith({ typeId: 'repair' });
    expect(screen.getByText('Conserto')).toBeInTheDocument();
    expect(screen.getByText('4821')).toBeInTheDocument();
    expect(screen.getByText(/Código para abrir a OS/i)).toBeInTheDocument();
  });

  it('accepts an optional phone to prepare a WhatsApp message after issue', async () => {
    openKiosk();
    fireEvent.click(await screen.findByRole('button', { name: /Conserto/i }));
    fireEvent.change(screen.getByLabelText(/WhatsApp/i), { target: { value: '(11) 91234-5678' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar senha/i }));
    expect(await screen.findByRole('link', { name: /Enviar pelo WhatsApp/i })).toHaveAttribute('href', expect.stringContaining('wa.me/5511912345678'));
  });

  it('shows an error and lets the customer retry', async () => {
    issueTicket.mockRejectedValueOnce(new Error('Tente novamente'));
    openKiosk();
    fireEvent.click(await screen.findByRole('button', { name: /Conserto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar senha/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente novamente');
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText('C008')).toBeInTheDocument();
  });

  it('sends the ticket to the direct-print agent and keeps controls hidden for browser print', async () => {
    openKiosk();
    fireEvent.click(await screen.findByRole('button', { name: /Conserto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar senha/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Imprimir senha/i }));
    await waitFor(() => expect(requestTicketPrint).toHaveBeenCalledWith('ticket-8'));
    await waitFor(() => expect(getPrintJobStatus).toHaveBeenCalledWith('print-1'));
    expect(await screen.findByText('Senha impressa.')).toBeInTheDocument();
    expect(screen.getByTestId('kiosk-controls')).toHaveClass('no-print');
  });
});

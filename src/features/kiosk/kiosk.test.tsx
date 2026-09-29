import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listTicketTypes, issueTicket } = vi.hoisted(() => ({ listTicketTypes: vi.fn(), issueTicket: vi.fn() }));
vi.mock('../../lib/supabase/queue-api', () => ({ listTicketTypes, issueTicket }));
import { KioskPage } from './KioskPage';

const types = [
  { id: 'repair', name: 'Conserto', prefix: 'C', isActive: true, sortOrder: 0 },
  { id: 'pickup', name: 'Retirada', prefix: 'R', isActive: false, sortOrder: 1 },
];

function openKiosk() {
  return render(<MemoryRouter><KioskPage /></MemoryRouter>);
}

describe('customer kiosk', () => {
  beforeEach(() => {
    listTicketTypes.mockReset().mockResolvedValue(types);
    issueTicket.mockReset().mockResolvedValue({ ticketNumber: 'C008', sequenceNumber: 8, serviceTypeName: 'Conserto' });
  });

  it('shows active service types only and issues a ticket with a trimmed optional name', async () => {
    openKiosk();
    expect(await screen.findByRole('button', { name: /Conserto/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirada/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Conserto/i }));
    fireEvent.change(screen.getByLabelText(/seu nome/i), { target: { value: '  Joana  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar minha senha/i }));
    expect(await screen.findByText('C008')).toBeInTheDocument();
    expect(issueTicket).toHaveBeenCalledWith({ typeId: 'repair', customerName: 'Joana' });
    expect(screen.getByText('Conserto')).toBeInTheDocument();
  });

  it('allows the name to be left blank', async () => {
    openKiosk();
    fireEvent.click(await screen.findByRole('button', { name: /Conserto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar minha senha/i }));
    await waitFor(() => expect(issueTicket).toHaveBeenCalledWith({ typeId: 'repair', customerName: null }));
  });

  it('shows an error and lets the customer retry', async () => {
    issueTicket.mockRejectedValueOnce(new Error('Tente novamente'));
    openKiosk();
    fireEvent.click(await screen.findByRole('button', { name: /Conserto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar minha senha/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente novamente');
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText('C008')).toBeInTheDocument();
  });

  it('prints the ticket and marks controls as hidden for print', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true });
    openKiosk();
    fireEvent.click(await screen.findByRole('button', { name: /Conserto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar minha senha/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Imprimir senha/i }));
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByTestId('kiosk-controls')).toHaveClass('no-print');
  });
});

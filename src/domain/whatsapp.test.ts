import { describe, expect, it } from 'vitest';
import { ticketWhatsAppUrl } from './whatsapp';

describe('ticket WhatsApp link', () => {
  const ticket = { ticketNumber: 'C008', serviceTypeName: 'Conserto', osAccessCode: '5831' };
  it('accepts a Brazilian mobile number and includes the issued ticket', () => {
    const url = new URL(ticketWhatsAppUrl('(11) 91234-5678', ticket)!);
    expect(url.pathname).toBe('/5511912345678');
    expect(url.searchParams.get('text')).toContain('C008');
    expect(url.searchParams.get('text')).toContain('Conserto');
    expect(url.searchParams.get('text')).toContain('5831');
  });
  it('does not make a link for an invalid phone', () => {
    expect(ticketWhatsAppUrl('123', ticket)).toBeNull();
  });
});

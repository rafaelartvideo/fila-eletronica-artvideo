export function formatBrazilianPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${ddd}) ${number}`;

  if (digits.length <= 10) {
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4, 8)}`;
  }

  return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5, 9)}`;
}

export function ticketWhatsAppUrl(phone: string, ticket: { ticketNumber: string; serviceTypeName: string; osAccessCode?: string | null }): string | null {
  const digits = phone.replace(/\D/g, '');
  const brazilianNumber = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(brazilianNumber) && !/^[1-9][0-9][2-8][0-9]{7}$/.test(brazilianNumber)) return null;
  const osCode = ticket.osAccessCode ? ` Código para abrir a OS: ${ticket.osAccessCode}.` : "";
  const message = `Union Fila: sua senha é ${ticket.ticketNumber} (${ticket.serviceTypeName}).${osCode} Acompanhe a chamada no painel de atendimento.`;
  return `https://wa.me/55${brazilianNumber}?text=${encodeURIComponent(message)}`;
}

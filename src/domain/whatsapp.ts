export function ticketWhatsAppUrl(phone: string, ticket: { ticketNumber: string; serviceTypeName: string }): string | null {
  const digits = phone.replace(/\D/g, '');
  const brazilianNumber = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(brazilianNumber) && !/^[1-9][0-9][2-8][0-9]{7}$/.test(brazilianNumber)) return null;
  const message = `Eletrônica Artvideo: sua senha é ${ticket.ticketNumber} (${ticket.serviceTypeName}). Acompanhe a chamada no painel de atendimento.`;
  return `https://wa.me/55${brazilianNumber}?text=${encodeURIComponent(message)}`;
}

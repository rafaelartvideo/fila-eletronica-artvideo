import { Check, MessageCircle, Printer, RotateCcw, TicketCheck } from 'lucide-react';
import type { QueueTicket } from '../../domain/queue';
import { ticketWhatsAppUrl } from '../../domain/whatsapp';

export function TicketConfirmation({ ticket, phone = '', onNewTicket }: { ticket: QueueTicket; phone?: string; onNewTicket: () => void }) {
  const whatsappUrl = phone ? ticketWhatsAppUrl(phone, ticket) : null;
  return <section className="issued-ticket-screen" aria-live="polite">
    <div className="ticket-success-mark"><Check size={25} /></div>
    <span className="section-kicker">SENHA EMITIDA</span>
    <h1>Pronto, sua vez está garantida.</h1>
    <p>Aguarde a chamada no painel de senhas.</p>
    <article className="print-ticket" aria-label="Sua senha">
      <div className="print-ticket-brand"><TicketCheck size={18} /><strong>FILA DE ATENDIMENTO</strong></div>
      <span className="print-service-label">{ticket.serviceTypeName}</span>
      <strong className="print-ticket-number">{ticket.ticketNumber}</strong>
      <span className="print-ticket-date">Senha emitida · {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.createdAt || Date.now()))}</span>
      <div className="print-ticket-message">Aguarde sua chamada na tela.</div>
    </article>
    <div className="kiosk-controls no-print" data-testid="kiosk-controls">
      {whatsappUrl && <a className="whatsapp-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> Enviar pelo WhatsApp</a>}
      {phone && !whatsappUrl && <small className="phone-error">Número inválido. Use DDD + número brasileiro para enviar pelo WhatsApp.</small>}
      <button className="kiosk-print-button" onClick={() => window.print()}><Printer size={19} /> Imprimir senha</button>
      <button className="kiosk-new-button" onClick={onNewTicket}><RotateCcw size={17} /> Emitir outra senha</button>
    </div>
  </section>;
}

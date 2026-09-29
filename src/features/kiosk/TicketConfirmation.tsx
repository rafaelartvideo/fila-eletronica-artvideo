import { Check, Printer, RotateCcw, TicketCheck } from 'lucide-react';
import type { QueueTicket } from '../../domain/queue';

export function TicketConfirmation({ ticket, onNewTicket }: { ticket: QueueTicket; onNewTicket: () => void }) {
  return <section className="issued-ticket-screen" aria-live="polite">
    <div className="ticket-success-mark"><Check size={25} /></div>
    <span className="section-kicker">SENHA EMITIDA</span>
    <h1>Pronto, sua vez está garantida.</h1>
    <p>Aguarde a chamada no painel de senhas.</p>
    <article className="print-ticket" aria-label="Sua senha">
      <div className="print-ticket-brand"><span className="staff-brand-icon"><TicketCheck size={18} /></span><strong>ELETRÔNICA ARTVIDEO</strong></div>
      <span className="print-service-label">{ticket.serviceTypeName}</span>
      <strong className="print-ticket-number">{ticket.ticketNumber}</strong>
      <span className="print-ticket-date">Senha emitida · {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.createdAt || Date.now()))}</span>
      <div className="print-ticket-message">Aguarde sua chamada na tela.</div>
    </article>
    <div className="kiosk-controls no-print" data-testid="kiosk-controls">
      <button className="kiosk-print-button" onClick={() => window.print()}><Printer size={19} /> Imprimir senha</button>
      <button className="kiosk-new-button" onClick={onNewTicket}><RotateCcw size={17} /> Emitir outra senha</button>
    </div>
  </section>;
}

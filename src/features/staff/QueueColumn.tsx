import { Check, ChevronRight, CircleOff, Megaphone, RotateCcw, TicketPlus, X } from 'lucide-react';
import type { QueueTicket, TicketType } from '../../domain/queue';

interface Props {
  type: TicketType;
  tickets: QueueTicket[];
  busy: boolean;
  onCall: () => void;
  onIssue: () => void;
  onRepeat: (ticketId: string) => void;
  onTransition: (ticketId: string, status: 'serving' | 'completed' | 'cancelled') => void;
}

export function QueueColumn({ type, tickets, busy, onCall, onIssue, onRepeat, onTransition }: Props) {
  const waiting = tickets.filter((ticket) => ticket.status === 'waiting');
  const active = tickets.filter((ticket) => ['called', 'serving'].includes(ticket.status));
  const completed = tickets.filter((ticket) => ['completed', 'cancelled'].includes(ticket.status));
  return (
    <section className="queue-card">
      <header className="queue-card-head">
        <div><span className="queue-count">{waiting.length} aguardando</span><h2>{type.name}</h2></div>
        <span className="queue-total">{tickets.length}</span>
      </header>
      <button className="call-next-button" onClick={onCall} disabled={busy || waiting.length === 0}>
        {waiting.length === 0 ? <><CircleOff size={17} /> Fila vazia</> : <><Megaphone size={17} /> Chamar próxima <ChevronRight size={17} /></>}
      </button>
      <button className="issue-walkin-button" onClick={onIssue} disabled={busy}><TicketPlus size={18} /> Gerar senha</button>
      <div className="queue-list">
        {active.map((ticket) => <article key={ticket.id} className={`queue-ticket ${ticket.status}`}>
          <div className="ticket-number-small">{ticket.ticketNumber}</div>
          <div className="ticket-person"><strong>{ticket.serviceTypeName}</strong><small>{ticket.status === 'called' ? 'Chamado · ' + (ticket.counterLabel ?? 'Balcão 1') : 'Em atendimento'}</small></div>
          <div className="ticket-actions">
            {ticket.status === 'called' && <button title="Repetir chamada" aria-label={`Repetir chamada ${ticket.ticketNumber}`} disabled={busy} onClick={() => onRepeat(ticket.id)}><RotateCcw size={16} /></button>}
            {ticket.status === 'called' && <button title="Iniciar atendimento" aria-label={`Iniciar ${ticket.ticketNumber}`} disabled={busy} onClick={() => onTransition(ticket.id, 'serving')}><ChevronRight size={17} /></button>}
            {ticket.status === 'serving' && <button title="Concluir atendimento" aria-label={`Concluir ${ticket.ticketNumber}`} disabled={busy} onClick={() => onTransition(ticket.id, 'completed')}><Check size={16} /></button>}
            <button title="Cancelar senha" aria-label={`Cancelar ${ticket.ticketNumber}`} disabled={busy} onClick={() => onTransition(ticket.id, 'cancelled')}><X size={16} /></button>
          </div>
        </article>)}
        {waiting.map((ticket) => <article key={ticket.id} className="queue-ticket waiting">
          <div className="ticket-number-small">{ticket.ticketNumber}</div>
          <div className="ticket-person"><strong>{ticket.serviceTypeName}</strong><small>Na fila</small></div>
          <div className="ticket-actions"><button title="Cancelar senha" aria-label={`Cancelar ${ticket.ticketNumber}`} disabled={busy} onClick={() => onTransition(ticket.id, 'cancelled')}><X size={16} /></button></div>
        </article>)}
        {active.length === 0 && waiting.length === 0 && <div className="queue-empty"><Check size={20} /> Nenhuma senha pendente</div>}
        {completed.length > 0 && <details className="queue-history"><summary>Atendidos hoje ({completed.length})</summary>{completed.slice(-4).reverse().map((ticket) => <div key={ticket.id}><span>{ticket.ticketNumber}</span><small>{ticket.status === 'completed' ? 'Concluído' : 'Cancelado'}</small></div>)}</details>}
      </div>
    </section>
  );
}

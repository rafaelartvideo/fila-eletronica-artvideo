import { Check, ChevronRight, TicketPlus, X } from 'lucide-react';
import type { QueueTicket, TicketType } from '../../domain/queue';

interface Props {
  type: TicketType;
  tickets: QueueTicket[];
  busy: boolean;
  onIssue: () => void;
  onOpen: (ticketId: string) => void;
  onTransition: (ticketId: string, status: 'serving' | 'completed' | 'cancelled') => void;
}

export function QueueColumn({ type, tickets, busy, onIssue, onOpen, onTransition }: Props) {
  const waiting = tickets.filter((ticket) => ticket.status === 'waiting');
  const active = tickets.filter((ticket) => ['called', 'serving'].includes(ticket.status));
  const completed = tickets.filter((ticket) => ['completed', 'cancelled'].includes(ticket.status));

  return (
    <section className="queue-card">
      <header className="queue-card-head">
        <div><span className="queue-count">{waiting.length} aguardando</span><h2>{type.name}</h2></div>
        <span className="queue-total">{tickets.length}</span>
      </header>

      <button className="issue-walkin-button" onClick={onIssue} disabled={busy}><TicketPlus size={18} /> Gerar senha</button>

      <div className="queue-list">
        {active.map((ticket) => <button
          type="button"
          key={ticket.id}
          className={`queue-ticket queue-ticket-open ${ticket.status}`}
          disabled={busy}
          onClick={() => onOpen(ticket.id)}
          aria-label={`Abrir atendimento ${ticket.ticketNumber}`}
        >
          <div className="ticket-number-small">{ticket.ticketNumber}</div>
          <div className="ticket-person">
            <strong>{ticket.serviceTypeName}</strong>
            <small>{ticket.status === 'called' ? `Aguardando cliente · ${ticket.counterLabel ?? 'Balcão 1'}` : `Em atendimento · ${ticket.counterLabel ?? 'Balcão 1'}`}</small>
          </div>
          <ChevronRight className="ticket-open-arrow" size={18} />
        </button>)}

        {waiting.map((ticket) => <article key={ticket.id} className="queue-ticket waiting">
          <div className="ticket-number-small">{ticket.ticketNumber}</div>
          <div className="ticket-person"><strong>{ticket.serviceTypeName}</strong><small>Na fila</small></div>
          <div className="ticket-actions"><button title="Cancelar senha" aria-label={`Cancelar ${ticket.ticketNumber}`} disabled={busy} onClick={() => onTransition(ticket.id, 'cancelled')}><X size={16} /></button></div>
        </article>)}

        {active.length === 0 && waiting.length === 0 && <div className="queue-empty"><Check size={20} /> Nenhuma senha pendente</div>}

        {completed.length > 0 && <details className="queue-history">
          <summary>Atendidos hoje ({completed.length})</summary>
          {completed.slice(-4).reverse().map((ticket) => <div key={ticket.id}><span>{ticket.ticketNumber}</span><small>{ticket.status === 'completed' ? 'Concluído' : 'Cancelado'}</small></div>)}
        </details>}
      </div>
    </section>
  );
}

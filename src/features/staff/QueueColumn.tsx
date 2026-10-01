import { Check, ChevronRight, Megaphone, Pin, TicketPlus, X, Zap } from 'lucide-react';
import { Button, EmptyState, Surface } from '../../components/ui';
import type { QueueTicket, TicketType } from '../../domain/queue';
import { ticketPriorityLabel } from '../../domain/queue';

interface Props {
  type: TicketType;
  tickets: QueueTicket[];
  busy: boolean;
  canIssue: boolean;
  canCall: boolean;
  canServe: boolean;
  onIssue: () => void;
  onCall: (ticketId: string) => void;
  onOpen: (ticketId: string) => void;
  onTransition: (ticketId: string, status: 'serving' | 'completed' | 'cancelled') => void;
}

export function QueueColumn({ type, tickets, busy, canIssue, canCall, canServe, onIssue, onCall, onOpen, onTransition }: Props) {
  const waiting = tickets.filter((ticket) => ticket.status === 'waiting');
  const active = tickets.filter((ticket) => ['called', 'serving'].includes(ticket.status));
  const completed = tickets.filter((ticket) => ['completed', 'cancelled'].includes(ticket.status));

  return (
    <Surface className={`queue-card ${type.isPinned ? 'is-pinned' : ''} ${type.isQuick ? 'is-quick' : ''}`}>
      <header className="queue-card-head">
        <div>
          <span className="queue-count">{waiting.length} aguardando</span>
          <span className="queue-type-title">
            <h2>{type.name}</h2>
            {type.isPinned && <Pin className="queue-pin" size={14} aria-label="Fila fixada" />}
          </span>
          <span className="queue-header-badges">
            <span className={`priority-badge ${type.priority}`}>{ticketPriorityLabel(type.priority)}</span>
            {type.isQuick && <span className="service-flag quick"><Zap size={12} /> Rápido</span>}
          </span>
        </div>
        <span className="queue-total">{tickets.length}</span>
      </header>

      {canIssue && <Button className="issue-walkin-button" variant="secondary" size="sm" onClick={onIssue} disabled={busy} startIcon={<TicketPlus size={18} />}>Gerar senha</Button>}

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

        {waiting.map((ticket) => <article key={ticket.id} className={`queue-ticket waiting ${type.isQuick ? 'quick-ticket' : ''}`}>
          <div className="ticket-number-small">{ticket.ticketNumber}</div>
          <div className="ticket-person"><strong>{ticket.serviceTypeName}</strong><small>{type.isQuick ? 'Atendimento rápido · prioridade máxima' : `Na fila · Prioridade ${ticketPriorityLabel(type.priority)}`}</small></div>
          {(canServe || (canCall && type.isQuick)) && <div className="ticket-actions">
            {canCall && type.isQuick && <Button className="quick-call-button" variant="primary" size="sm" iconOnly title="Chamar esta senha" aria-label={`Chamar ${ticket.ticketNumber}`} disabled={busy} onClick={() => onCall(ticket.id)}><Megaphone size={16} /></Button>}
            {canServe && <Button variant="ghost" size="sm" iconOnly title="Cancelar senha" aria-label={`Cancelar ${ticket.ticketNumber}`} disabled={busy} onClick={() => onTransition(ticket.id, 'cancelled')}><X size={16} /></Button>}
          </div>}
        </article>)}

        {active.length === 0 && waiting.length === 0 && <EmptyState className="queue-empty" icon={<Check size={20} />}>Nenhuma senha pendente</EmptyState>}

        {completed.length > 0 && <details className="queue-history">
          <summary>Atendidos hoje ({completed.length})</summary>
          {completed.slice(-4).reverse().map((ticket) => <div key={ticket.id}><span>{ticket.ticketNumber}</span><small>{ticket.status === 'completed' ? 'Concluído' : 'Cancelado'}</small></div>)}
        </details>}
      </div>
    </Surface>
  );
}

import { useEffect, useState } from 'react';
import { Check, Maximize2, Minimize2, Play, RotateCcw, Save, UserRound, X } from 'lucide-react';
import type { QueueTicket } from '../../domain/queue';
import { ticketPriorityLabel } from '../../domain/queue';

interface Props {
  ticket: QueueTicket;
  busy: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onRepeat: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onSaveRequest: (value: string) => void;
}

function formatTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function CurrentServicePanel({
  ticket,
  busy,
  minimized,
  onMinimize,
  onRestore,
  onRepeat,
  onStart,
  onComplete,
  onCancel,
  onSaveRequest,
}: Props) {
  const isCalled = ticket.status === 'called';
  const statusLabel = isCalled ? 'Aguardando cliente' : 'Em atendimento';
  const tone = isCalled ? 'called' : 'serving';
  const [request, setRequest] = useState(ticket.customerRequest ?? '');

  useEffect(() => {
    setRequest(ticket.customerRequest ?? '');
  }, [ticket.id, ticket.customerRequest]);

  if (minimized) {
    return <button className={`service-session-dock ${tone}`} type="button" onClick={onRestore} aria-label={`Abrir atendimento ${ticket.ticketNumber}`}>
      <span className="service-session-dot" aria-hidden="true" />
      <span className="service-session-dock-copy">
        <small>{statusLabel}</small>
        <strong>{ticket.ticketNumber} · {ticket.serviceTypeName}</strong>
      </span>
      <Maximize2 size={18} />
    </button>;
  }

  const requestChanged = request.trim() !== (ticket.customerRequest ?? '').trim();

  return <div className="service-session-overlay">
    <section className={`service-session-modal ${tone}`} role="dialog" aria-modal="true" aria-labelledby="service-session-title">
      <header className="service-session-header">
        <div>
          <span className={`service-session-status ${tone}`}><i /> {statusLabel}</span>
          <small>ATENDIMENTO ATUAL</small>
        </div>
        <button type="button" className="service-session-minimize" onClick={onMinimize} aria-label="Minimizar atendimento" title="Minimizar">
          <Minimize2 size={19} />
        </button>
      </header>

      <div className="service-session-hero">
        <strong id="service-session-title">{ticket.ticketNumber}</strong>
        <span>{ticket.serviceTypeName}</span>
      </div>

      <div className="service-session-details">
        <div><small>Balcão</small><strong>{ticket.counterLabel ?? 'Balcão 1'}</strong></div>
        <div><small>Chegada</small><strong>{formatTime(ticket.createdAt)}</strong></div>
        <div><small>Chamada</small><strong>{formatTime(ticket.calledAt)}</strong></div>
        <div><small>Prioridade</small><strong><span className={`priority-badge ${ticket.servicePriority}`}>{ticketPriorityLabel(ticket.servicePriority)}</span></strong></div>
        {ticket.customerName && <div><small>Cliente</small><strong><UserRound size={14} /> {ticket.customerName}</strong></div>}
      </div>

      {!isCalled && <div className="service-customer-request">
        <label htmlFor={`customer-request-${ticket.id}`}>O que o cliente queria</label>
        <textarea
          id={`customer-request-${ticket.id}`}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Descreva de forma objetiva o que o cliente solicitou."
          maxLength={1000}
          rows={4}
        />
        <div>
          <small>{request.length}/1000</small>
          <button type="button" className="service-request-save" disabled={busy || !requestChanged} onClick={() => onSaveRequest(request)}>
            <Save size={16} /> Salvar
          </button>
        </div>
      </div>}

      <footer className="service-session-actions">
        {isCalled && <button type="button" className="service-action secondary" disabled={busy} onClick={onRepeat}><RotateCcw size={17} /> Repetir chamada</button>}
        {isCalled && <button type="button" className="service-action primary" disabled={busy} onClick={onStart}><Play size={17} /> Iniciar atendimento</button>}
        {!isCalled && <button type="button" className="service-action success" disabled={busy} onClick={onComplete}><Check size={17} /> Encerrar atendimento</button>}
        {isCalled && <button type="button" className="service-action danger" disabled={busy} onClick={onCancel}><X size={17} /> Cancelar</button>}
      </footer>
    </section>
  </div>;
}

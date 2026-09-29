import { useEffect, useState } from 'react';
import { Check, Maximize2, Minimize2, Play, RotateCcw, UserRound, X } from 'lucide-react';
import type { QueueTicket } from '../../domain/queue';
import { ticketPriorityLabel } from '../../domain/queue';

interface Props {
  ticket: QueueTicket;
  busy: boolean;
  minimized: boolean;
  canCall: boolean;
  canServe: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onRepeat: () => void;
  onStart: () => void;
  onComplete: (customerRequest: string) => void;
  onCancel: () => void;
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
  canCall,
  canServe,
  onMinimize,
  onRestore,
  onRepeat,
  onStart,
  onComplete,
  onCancel,
}: Props) {
  const isCalled = ticket.status === 'called';
  const statusLabel = isCalled ? 'Aguardando cliente' : 'Em atendimento';
  const tone = isCalled ? 'called' : 'serving';
  const [request, setRequest] = useState(ticket.customerRequest ?? '');
  const [requestError, setRequestError] = useState('');

  useEffect(() => {
    setRequest(ticket.customerRequest ?? '');
    setRequestError('');
  }, [ticket.id, ticket.customerRequest]);

  function complete() {
    const normalized = request.trim();
    if (!normalized) {
      setRequestError('Informe o que o cliente queria antes de encerrar o atendimento.');
      return;
    }
    setRequestError('');
    onComplete(normalized);
  }

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

      {!isCalled && canServe && <div className={`service-customer-request ${requestError ? 'has-error' : ''}`}>
        <label htmlFor={`customer-request-${ticket.id}`}>O que o cliente queria <span>*</span></label>
        <textarea
          id={`customer-request-${ticket.id}`}
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            if (event.target.value.trim()) setRequestError('');
          }}
          placeholder="Descreva de forma objetiva o que o cliente solicitou."
          maxLength={1000}
          rows={4}
          required
          aria-invalid={Boolean(requestError)}
          aria-describedby={requestError ? `customer-request-error-${ticket.id}` : undefined}
        />
        <div className="service-request-meta">
          <small>{request.length}/1000 · obrigatório para encerrar</small>
        </div>
        {requestError && <div id={`customer-request-error-${ticket.id}`} className="service-request-feedback" role="alert">{requestError}</div>}
      </div>}

      <footer className="service-session-actions">
        {isCalled && canCall && <button type="button" className="service-action secondary" disabled={busy} onClick={onRepeat}><RotateCcw size={17} /> Repetir chamada</button>}
        {isCalled && canServe && <button type="button" className="service-action primary" disabled={busy} onClick={onStart}><Play size={17} /> Iniciar atendimento</button>}
        {!isCalled && canServe && <button type="button" className="service-action success" disabled={busy} onClick={complete}><Check size={17} /> Encerrar atendimento</button>}
        {isCalled && canServe && <button type="button" className="service-action danger" disabled={busy} onClick={onCancel}><X size={17} /> Cancelar</button>}
      </footer>
    </section>
  </div>;
}

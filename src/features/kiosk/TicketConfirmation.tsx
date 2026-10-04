import { useState } from 'react';
import { Check, MessageCircle, Printer, RotateCcw, TicketCheck } from 'lucide-react';
import { Button, Notice } from '../../components/ui';
import type { QueueTicket } from '../../domain/queue';
import { ticketWhatsAppUrl } from '../../domain/whatsapp';
import { getPrintJobStatus, requestTicketPrint } from '../../lib/supabase/queue-api';
import { TicketTrackingQr } from '../tracking/TicketTrackingQr';

export function TicketConfirmation({ ticket, phone = '', onNewTicket }: { ticket: QueueTicket; phone?: string; onNewTicket: () => void }) {
  const whatsappUrl = phone ? ticketWhatsAppUrl(phone, ticket) : null;
  const [printState, setPrintState] = useState<'idle' | 'sending' | 'waiting' | 'printed' | 'error'>('idle');
  const [printMessage, setPrintMessage] = useState('');

  async function printDirect() {
    setPrintState('sending');
    setPrintMessage('');
    try {
      const job = await requestTicketPrint(ticket.id);
      setPrintState('waiting');
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const status = await getPrintJobStatus(job.id);
        if (status.status === 'printed') {
          setPrintState('printed');
          setPrintMessage('Senha impressa.');
          return;
        }
        if (status.status === 'error') throw new Error(status.errorMessage || 'A impressora não concluiu a impressão.');
        if (attempt < 11) await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      setPrintMessage('Pedido enviado. A impressão sairá assim que o agente estiver conectado.');
    } catch (cause) {
      setPrintState('error');
      setPrintMessage(cause instanceof Error ? cause.message : 'Não foi possível enviar para a impressora.');
    }
  }

  return <section className="issued-ticket-screen" aria-live="polite">
    <div className="ticket-success-mark"><Check size={25} /></div>
    <span className="ui-eyebrow">SENHA EMITIDA</span>
    <h1>Pronto, sua vez está garantida.</h1>
    <p>Aguarde a chamada no painel de senhas.</p>
    <article className="print-ticket" aria-label="Sua senha">
      <div className="print-ticket-brand"><TicketCheck size={18} /><strong>FILA DE ATENDIMENTO</strong></div>
      <span className="print-service-label">{ticket.serviceTypeName}</span>
      <strong className="print-ticket-number">{ticket.ticketNumber}</strong>
      <span className="print-ticket-date">Senha emitida · {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.createdAt || Date.now()))}</span>
      {ticket.osAccessCode && <div className="print-ticket-message"><strong>Código para abrir OS: {ticket.osAccessCode}</strong></div>}
      <div className="print-ticket-message">Aguarde sua chamada na tela.</div>
      <div className="print-feed-spacer" aria-hidden="true" />
    </article>
    {ticket.trackingToken && <TicketTrackingQr token={ticket.trackingToken} />}
    <div className="kiosk-controls no-print" data-testid="kiosk-controls">
      {whatsappUrl && <a className="ui-button ui-button--success ui-button--md whatsapp-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> <span className="ui-button__label">Enviar pelo WhatsApp</span></a>}
      {phone && !whatsappUrl && <Notice tone="warning" className="phone-error">Número inválido. Use DDD + número brasileiro para enviar pelo WhatsApp.</Notice>}
      <Button
        variant="primary"
        onClick={() => void printDirect()}
        disabled={printState === 'sending' || printState === 'waiting' || printState === 'printed'}
        startIcon={<Printer size={18} />}
      >
        {printState === 'sending' ? 'Enviando…' : printState === 'waiting' ? 'Aguardando impressora…' : printState === 'printed' ? 'Senha impressa' : 'Imprimir senha'}
      </Button>
      {printMessage && <Notice tone={printState === 'error' ? 'danger' : printState === 'printed' ? 'success' : 'info'} className={'print-status ' + printState}>{printMessage}</Notice>}
      {printState === 'error' && <Button variant="secondary" onClick={() => window.print()} startIcon={<Printer size={17} />}>Usar impressão do navegador</Button>}
      <Button variant="secondary" onClick={onNewTicket} startIcon={<RotateCcw size={17} />}>Emitir outra senha</Button>
    </div>
  </section>;
}

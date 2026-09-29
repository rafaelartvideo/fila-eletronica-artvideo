import { useState } from 'react';
import { Check, MessageCircle, Printer, RotateCcw, TicketCheck } from 'lucide-react';
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
    <span className="section-kicker">SENHA EMITIDA</span>
    <h1>Pronto, sua vez está garantida.</h1>
    <p>Aguarde a chamada no painel de senhas.</p>
    <article className="print-ticket" aria-label="Sua senha">
      <div className="print-ticket-brand"><TicketCheck size={18} /><strong>FILA DE ATENDIMENTO</strong></div>
      <span className="print-service-label">{ticket.serviceTypeName}</span>
      <strong className="print-ticket-number">{ticket.ticketNumber}</strong>
      <span className="print-ticket-date">Senha emitida · {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.createdAt || Date.now()))}</span>
      <div className="print-ticket-message">Aguarde sua chamada na tela.</div>
      <div className="print-feed-spacer" aria-hidden="true" />
    </article>
    {ticket.trackingToken && <TicketTrackingQr token={ticket.trackingToken} />}
    <div className="kiosk-controls no-print" data-testid="kiosk-controls">
      {whatsappUrl && <a className="whatsapp-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> Enviar pelo WhatsApp</a>}
      {phone && !whatsappUrl && <small className="phone-error">Número inválido. Use DDD + número brasileiro para enviar pelo WhatsApp.</small>}
      <button className="kiosk-print-button" onClick={() => void printDirect()} disabled={printState === 'sending' || printState === 'waiting' || printState === 'printed'}><Printer size={19} /> {printState === 'sending' ? 'Enviando…' : printState === 'waiting' ? 'Aguardando impressora…' : printState === 'printed' ? 'Senha impressa' : 'Imprimir senha'}</button>
      {printMessage && <small className={'print-status ' + printState}>{printMessage}</small>}
      {printState === 'error' && <button className="kiosk-new-button" onClick={() => window.print()}><Printer size={17} /> Usar impressão do navegador</button>}
      <button className="kiosk-new-button" onClick={onNewTicket}><RotateCcw size={17} /> Emitir outra senha</button>
    </div>
  </section>;
}

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, ClipboardList, Ticket } from 'lucide-react';
import { Link } from 'react-router';
import type { QueueTicket, TicketType } from '../../domain/queue';
import { issueTicket, listTicketTypes, subscribeToQueueChanges } from '../../lib/supabase/queue-api';
import { TicketConfirmation } from './TicketConfirmation';

export function KioskPage() {
  const [types, setTypes] = useState<TicketType[]>([]);
  const [selectedType, setSelectedType] = useState<TicketType | null>(null);
  const [phone, setPhone] = useState('');
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTypes = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const nextTypes = (await listTicketTypes()).filter((type) => type.isActive);
      setTypes(nextTypes);
      setSelectedType((current) => current ? nextTypes.find((type) => type.id === current.id) ?? null : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os atendimentos.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadTypes(true);
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['ticket_types'], () => { if (active) void loadTypes(); }, (status) => {
        if (active && status === 'SUBSCRIBED') void loadTypes();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, [loadTypes]);

  async function createTicket() {
    if (!selectedType) return;
    setBusy(true); setError('');
    try { setTicket(await issueTicket({ typeId: selectedType.id })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível emitir a senha. Tente novamente.'); }
    finally { setBusy(false); }
  }

  function reset() { setSelectedType(null); setPhone(''); setTicket(null); setError(''); }

  const viewportLocked = Boolean(selectedType || ticket);
  useEffect(() => {
    if (!viewportLocked) return;
    document.documentElement.classList.add('kiosk-viewport-locked');
    document.body.classList.add('kiosk-viewport-locked');
    return () => {
      document.documentElement.classList.remove('kiosk-viewport-locked');
      document.body.classList.remove('kiosk-viewport-locked');
    };
  }, [viewportLocked]);

  return <main className={`kiosk-page ${selectedType && !ticket ? 'kiosk-selection-active' : ''} ${ticket ? 'kiosk-ticket-active' : ''} ${viewportLocked ? 'kiosk-viewport-active' : ''}`}>
    <header className="kiosk-topbar no-print">
      <Link to="/" className="auth-back"><ArrowLeft size={17} /> Voltar</Link>
      <div className="kiosk-brand"><Ticket size={20} /><strong>RETIRADA DE SENHA</strong></div>
      <span className="kiosk-help"><CircleHelp size={16} /> Precisa de ajuda? Chame nossa equipe</span>
    </header>
    <div className="kiosk-content">
      {ticket ? <TicketConfirmation ticket={ticket} phone={phone} onNewTicket={reset} /> : <>
        <div className="kiosk-welcome"><span className="section-kicker">GERAR SENHA</span><h1>{selectedType ? 'Confirme seu atendimento' : 'Como podemos ajudar?'}</h1><p>{selectedType ? `Você selecionou ${selectedType.name}. Seu WhatsApp é opcional.` : 'Escolha o atendimento para gerar sua senha.'}</p></div>
        {error && <div role="alert" className="kiosk-error">{error}{selectedType && <button onClick={() => void createTicket()}>Tentar novamente</button>}{!selectedType && <button onClick={() => void loadTypes(true)}>Recarregar</button>}</div>}
        {loading ? <div className="kiosk-loading">Carregando atendimentos…</div> : selectedType ? <section className="kiosk-step-card">
          <div className="selected-service"><div><small>ATENDIMENTO</small><strong>{selectedType.name}</strong></div><button className="change-service" onClick={() => { setSelectedType(null); setError(''); }}>Alterar</button></div>
          <label className="kiosk-name-label" htmlFor="kiosk-phone">WhatsApp do cliente <span>(opcional)</span></label>
          <input id="kiosk-phone" className="kiosk-name-input" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 91234-5678" maxLength={20} autoComplete="tel" />
          <p className="kiosk-privacy">Após gerar, você poderá abrir uma mensagem pronta no WhatsApp. O envio precisa ser confirmado no aplicativo.</p>
          <button className="kiosk-generate-button" onClick={() => void createTicket()} disabled={busy}>{busy ? 'Gerando senha…' : <>Gerar senha <ArrowRight size={19} /></>}</button>
        </section> : types.length === 0 ? <div className="kiosk-no-services">Nenhum atendimento está disponível neste momento. Por favor, chame nossa equipe.</div> : <div className="kiosk-service-grid">{types.map((type) => <button key={type.id} className="kiosk-service-card" onClick={() => { setSelectedType(type); setError(''); }}><span className="kiosk-service-icon"><ClipboardList size={21} /></span><span><strong>{type.name}</strong><small>Retire uma senha</small></span><ArrowRight className="kiosk-service-arrow" size={19} /></button>)}</div>}
        {!selectedType && !loading && !error && <p className="kiosk-small-print">O atendimento será realizado por ordem de chegada.</p>}
      </>}
    </div>
    <footer className="system-footer no-print">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
  </main>;
}

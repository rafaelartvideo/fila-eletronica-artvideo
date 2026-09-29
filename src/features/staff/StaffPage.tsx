import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarDays, Clapperboard, LogOut, RefreshCw, Settings2, TicketCheck, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import type { QueueTicket, TicketStatus, TicketType } from '../../domain/queue';
import { callNextTicket, issueTicket, listQueueTickets, listTicketTypes, repeatTicketCall, transitionTicket } from '../../lib/supabase/queue-api';
import { useAuth } from '../auth/AuthProvider';
import { AdminBadge } from '../auth/RequireAdmin';
import { QueueColumn } from './QueueColumn';
import { ServiceTypeSettings } from './ServiceTypeSettings';
import { MediaSettings } from './MediaSettings';

type Tab = 'queue' | 'services' | 'media';
function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function StaffPage() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');
  const [types, setTypes] = useState<TicketType[]>([]);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [counter, setCounter] = useState('Balcão 1');
  const [day, setDay] = useState(todayInSaoPaulo);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDay = todayInSaoPaulo();
      setDay((current) => current === currentDay ? current : currentDay);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextTypes, nextTickets] = await Promise.all([listTicketTypes(), listQueueTickets(day)]);
      setTypes(nextTypes.filter((type) => type.isActive));
      setTickets(nextTickets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a fila.');
    }
  }, [day]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30_000); return () => window.clearInterval(timer); }, [refresh]);

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'A ação não foi concluída.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await signOut(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível encerrar a sessão.'); }
  }

  const waiting = tickets.filter((ticket) => ticket.status === 'waiting').length;
  const serving = tickets.filter((ticket) => ticket.status === 'serving' || ticket.status === 'called').length;
  const served = tickets.filter((ticket) => ticket.status === 'completed').length;
  const transition = (ticketId: string, status: Extract<TicketStatus, 'serving' | 'completed' | 'cancelled'>) => runAction(() => transitionTicket(ticketId, status));

  return <main className="staff-app">
    <header className="staff-topbar">
      <Link to="/" className="staff-brand"><span className="staff-brand-icon"><Wrench size={19} /></span><span><strong>ARTVIDEO</strong><small>PAINEL DA EQUIPE</small></span></Link>
      <div className="staff-top-actions"><AdminBadge /><button className="staff-logout" onClick={() => void logout()}><LogOut size={16} /> Sair</button></div>
    </header>

    <section className="staff-main">
      <div className="staff-heading"><div><span className="section-kicker">OPERAÇÃO DA LOJA</span><h1>Fila de atendimento</h1><p>Gerencie as senhas e acompanhe os atendimentos em andamento.</p></div><div className="date-pill"><CalendarDays size={16} /> {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date())}</div></div>
      <div className="staff-metrics">
        <div className="staff-metric"><span className="metric-icon amber"><Activity size={17} /></span><div><small>Aguardando</small><strong>{waiting}</strong></div></div>
        <div className="staff-metric"><span className="metric-icon blue"><TicketCheck size={17} /></span><div><small>Em atendimento</small><strong>{serving}</strong></div></div>
        <div className="staff-metric"><span className="metric-icon green"><TicketCheck size={17} /></span><div><small>Concluídos hoje</small><strong>{served}</strong></div></div>
      </div>
      <nav className="staff-tabs" aria-label="Seções do painel">
        <button className={tab === 'queue' ? 'selected' : ''} onClick={() => setTab('queue')}><TicketCheck size={16} /> Fila</button>
        <button className={tab === 'services' ? 'selected' : ''} onClick={() => setTab('services')}><Settings2 size={16} /> Atendimentos</button>
        <button className={tab === 'media' ? 'selected' : ''} onClick={() => setTab('media')}><Clapperboard size={16} /> Vídeos do display</button>
        {tab === 'queue' && <label className="counter-field">Balcão<input aria-label="Balcão de atendimento" value={counter} onChange={(event) => setCounter(event.target.value)} maxLength={40} /></label>}
        <button className="refresh-button" aria-label="Atualizar fila" onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} /> Atualizar</button>
      </nav>
      {error && <div className="staff-error" role="alert">{error}<button onClick={() => void refresh()}>Tentar novamente</button></div>}
      {tab === 'queue' && <div className="queue-grid">{types.length === 0 ? <div className="empty-services"><Wrench size={22} /><h2>Nenhum atendimento ativo</h2><p>Cadastre um tipo de atendimento para começar a receber senhas.</p><button className="blue-button" onClick={() => setTab('services')}>Configurar atendimentos</button></div> : types.map((type) => <QueueColumn key={type.id} type={type} tickets={tickets.filter((ticket) => ticket.serviceTypeId === type.id)} busy={busy} onCall={() => void runAction(() => callNextTicket(type.id, counter))} onIssue={() => void runAction(() => issueTicket({ typeId: type.id, customerName: null }))} onRepeat={(id) => void runAction(() => repeatTicketCall(id))} onTransition={(id, status) => void transition(id, status)} />)}</div>}
      {tab === 'services' && <ServiceTypeSettings onChanged={() => void refresh()} />}
      {tab === 'media' && <MediaSettings onChanged={() => void refresh()} />}
    </section>
    <footer className="staff-footer">ARTVIDEO <span>•</span> Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
  </main>;
}

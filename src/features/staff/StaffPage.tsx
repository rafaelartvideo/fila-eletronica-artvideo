import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarDays, Clapperboard, LogOut, MessageCircle, Moon, Settings2, Sun, TicketCheck, Wrench, X } from 'lucide-react';
import { Link } from 'react-router';
import type { QueueTicket, TicketStatus, TicketType } from '../../domain/queue';
import { ticketWhatsAppUrl } from '../../domain/whatsapp';
import { callNextTicket, issueTicket, listQueueTickets, listTicketTypes, repeatTicketCall, subscribeToQueueChanges, transitionTicket } from '../../lib/supabase/queue-api';
import { useAuth } from '../auth/AuthProvider';
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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [tab, setTab] = useState<Tab>('queue');
  const [types, setTypes] = useState<TicketType[]>([]);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [counter, setCounter] = useState('Balcão 1');
  const [issueType, setIssueType] = useState<TicketType | null>(null);
  const [issuePhone, setIssuePhone] = useState('');
  const [issuedTicket, setIssuedTicket] = useState<QueueTicket | null>(null);
  const [day, setDay] = useState(todayInSaoPaulo);

  useEffect(() => {
    const syncTheme = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

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

  useEffect(() => {
    let active = true;
    void refresh();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['tickets', 'ticket_types'], () => { if (active) void refresh(); }, (status) => {
        if (active && status === 'SUBSCRIBED') void refresh();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, [refresh]);

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'A ação não foi concluída.'); }
    finally { setBusy(false); }
  }

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    try { window.localStorage.setItem('fila-theme', nextTheme); } catch {}
  }

  async function logout() {
    try { await signOut(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível encerrar a sessão.'); }
  }

  async function issueFromStaff() {
    if (!issueType) return;
    setBusy(true); setError('');
    try {
      const issued = await issueTicket({ typeId: issueType.id });
      setIssuedTicket(issued);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a senha.'); }
    finally { setBusy(false); }
  }

  function closeIssue() { setIssueType(null); setIssuePhone(''); setIssuedTicket(null); setError(''); }

  const waiting = tickets.filter((ticket) => ticket.status === 'waiting').length;
  const serving = tickets.filter((ticket) => ticket.status === 'serving' || ticket.status === 'called').length;
  const served = tickets.filter((ticket) => ticket.status === 'completed').length;
  const transition = (ticketId: string, status: Extract<TicketStatus, 'serving' | 'completed' | 'cancelled'>) => runAction(() => transitionTicket(ticketId, status));

  return <main className="staff-app">
    <header className="staff-topbar">
      <Link to="/" className="staff-brand" aria-label="Página inicial"><span className="staff-brand-icon"><TicketCheck size={19} /></span><span><strong>PAINEL DE ATENDIMENTO</strong><small>GESTÃO DA FILA</small></span></Link>
      <div className="staff-top-actions"><button className="staff-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Claro' : 'Escuro'}</span></button><button className="staff-logout" onClick={() => void logout()}><LogOut size={16} /> Sair</button></div>
    </header>

    <section className="staff-main">
      <div className="staff-heading"><div><span className="section-kicker">OPERAÇÃO DA LOJA</span><h1>Fila de atendimento</h1><p>Gerencie as senhas e acompanhe os atendimentos em andamento.</p></div><div className="date-pill"><CalendarDays size={16} /> {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date())}</div></div>
      <div className="staff-metrics">
        <div className="staff-metric waiting-metric"><span className="metric-icon amber"><Activity size={17} /></span><div><small>Aguardando</small><strong>{waiting}</strong></div></div>
        <div className="staff-metric called-metric"><span className="metric-icon green"><TicketCheck size={17} /></span><div><small>Chamadas / atendimento</small><strong>{serving}</strong></div></div>
        <div className="staff-metric"><span className="metric-icon blue"><TicketCheck size={17} /></span><div><small>Concluídos hoje</small><strong>{served}</strong></div></div>
      </div>
      <nav className="staff-tabs" aria-label="Seções do painel">
        <button className={tab === 'queue' ? 'selected' : ''} onClick={() => setTab('queue')}><TicketCheck size={16} /> Fila</button>
        <button className={tab === 'services' ? 'selected' : ''} onClick={() => setTab('services')}><Settings2 size={16} /> Atendimentos</button>
        <button className={tab === 'media' ? 'selected' : ''} onClick={() => setTab('media')}><Clapperboard size={16} /> Conteúdo do display</button>
        {tab === 'queue' && <label className="counter-field">Balcão<input aria-label="Balcão de atendimento" value={counter} onChange={(event) => setCounter(event.target.value)} maxLength={40} /></label>}
      </nav>
      {error && <div className="staff-error" role="alert">{error}<button onClick={() => void refresh()}>Tentar novamente</button></div>}
      {tab === 'queue' && <div className="queue-grid">{types.length === 0 ? <div className="empty-services"><Wrench size={22} /><h2>Nenhum atendimento ativo</h2><p>Cadastre um tipo de atendimento para começar a receber senhas.</p><button className="blue-button" onClick={() => setTab('services')}>Configurar atendimentos</button></div> : types.map((type) => <QueueColumn key={type.id} type={type} tickets={tickets.filter((ticket) => ticket.serviceTypeId === type.id)} busy={busy} onCall={() => void runAction(() => callNextTicket(type.id, counter))} onIssue={() => { setIssueType(type); setIssuedTicket(null); }} onRepeat={(id) => void runAction(() => repeatTicketCall(id))} onTransition={(id, status) => void transition(id, status)} />)}</div>}
      {tab === 'services' && <ServiceTypeSettings onChanged={() => void refresh()} />}
      {tab === 'media' && <MediaSettings onChanged={() => void refresh()} />}
    </section>

    {issueType && <div className="issue-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeIssue(); }}><section className="issue-dialog" role="dialog" aria-modal="true" aria-labelledby="issue-title">
      <button className="issue-close" aria-label="Fechar" onClick={closeIssue}><X size={20} /></button>
      <span className="section-kicker">GERAR SENHA</span>
      <h2 id="issue-title">{issuedTicket ? 'Senha gerada' : issueType.name}</h2>
      {issuedTicket ? <><strong className="issue-result">{issuedTicket.ticketNumber}</strong><p>Entregue ou informe a senha ao cliente.</p>{issuePhone && ticketWhatsAppUrl(issuePhone, issuedTicket) ? <a className="whatsapp-button" href={ticketWhatsAppUrl(issuePhone, issuedTicket)!} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> Enviar pelo WhatsApp</a> : issuePhone && <small className="phone-error">Número inválido. Use DDD + número brasileiro.</small>}<button className="kiosk-new-button" onClick={closeIssue}>Fechar</button></> : <><p>O número do WhatsApp é opcional. O envio será confirmado no aplicativo após a emissão.</p><label htmlFor="staff-phone">WhatsApp do cliente</label><input id="staff-phone" type="tel" inputMode="tel" placeholder="(11) 91234-5678" autoComplete="tel" maxLength={20} value={issuePhone} onChange={(event) => setIssuePhone(event.target.value)} /><button className="kiosk-generate-button" disabled={busy} onClick={() => void issueFromStaff()}>{busy ? 'Gerando…' : 'Confirmar e gerar'}</button></>}
    </section></div>}

    <footer className="system-footer">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
  </main>;
}

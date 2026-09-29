import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Clapperboard, History, LogOut, Megaphone, MessageCircle, Moon, Printer, Settings2, ShieldCheck, Sun, TicketCheck, TicketPlus, Users, Wrench, X } from 'lucide-react';
import { Link } from 'react-router';
import type { QueueTicket, TicketStatus, TicketType } from '../../domain/queue';
import { ticketWhatsAppUrl } from '../../domain/whatsapp';
import { callNextTicket, completeTicket, issueTicket, listQueueTickets, listTicketTypes, repeatTicketCall, subscribeToQueueChanges, transitionTicket } from '../../lib/supabase/queue-api';
import { useAuth } from '../auth/AuthProvider';
import { QueueColumn } from './QueueColumn';
import { CurrentServicePanel } from './CurrentServicePanel';
import { TicketTrackingQr } from '../tracking/TicketTrackingQr';
import { ServiceTypeSettings } from './ServiceTypeSettings';
import { MediaSettings } from './MediaSettings';
import { PrinterSettings } from './PrinterSettings';
import { AttendanceHistory } from './AttendanceHistory';
import { UsersSettings } from './UsersSettings';
import { RolesSettings } from './RolesSettings';

type Tab = 'queue' | 'attendance' | 'services' | 'users' | 'roles' | 'media' | 'printer';

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function StaffPage() {
  const { signOut, hasPermission, userName, roleName } = useAuth();
  const canQueue = hasPermission('queue.view');
  const canIssue = hasPermission('queue.issue');
  const canCall = hasPermission('queue.call');
  const canServe = hasPermission('queue.serve');
  const canAttendance = hasPermission('attendance.view');
  const canServices = hasPermission('service_types.manage');
  const canUsers = hasPermission('users.view') || hasPermission('users.manage');
  const canRoles = hasPermission('roles.view') || hasPermission('roles.manage');
  const canMedia = hasPermission('display.manage');
  const canPrinter = hasPermission('printer.manage');

  const availableTabs = useMemo(() => [
    canQueue && 'queue',
    canAttendance && 'attendance',
    canServices && 'services',
    canUsers && 'users',
    canRoles && 'roles',
    canMedia && 'media',
    canPrinter && 'printer',
  ].filter(Boolean) as Tab[], [canQueue, canAttendance, canServices, canUsers, canRoles, canMedia, canPrinter]);

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
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [servicePanelMinimized, setServicePanelMinimized] = useState(false);
  const [day, setDay] = useState(todayInSaoPaulo);

  useEffect(() => {
    if (!availableTabs.includes(tab) && availableTabs[0]) setTab(availableTabs[0]);
  }, [availableTabs, tab]);

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
    if (!canQueue) return null;
    setError('');
    try {
      const [nextTypes, nextTickets] = await Promise.all([listTicketTypes(), listQueueTickets(day)]);
      setTypes(nextTypes.filter((type) => type.isActive));
      setTickets(nextTickets);
      return nextTickets;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a fila.');
      return null;
    }
  }, [day, canQueue]);

  useEffect(() => {
    if (!canQueue) return;
    let active = true;
    void refresh();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['tickets', 'ticket_types'], () => { if (active) void refresh(); }, (status) => {
        if (active && status === 'SUBSCRIBED') void refresh();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, [refresh, canQueue]);

  useEffect(() => {
    const current = activeTicketId
      ? tickets.find((ticket) => ticket.id === activeTicketId && (ticket.status === 'called' || ticket.status === 'serving'))
      : null;
    if (current) return;

    const candidate = tickets
      .filter((ticket) => (ticket.status === 'called' || ticket.status === 'serving') && ticket.counterLabel === counter)
      .sort((a, b) => Date.parse(b.calledAt ?? b.createdAt) - Date.parse(a.calledAt ?? a.createdAt))[0] ?? null;
    setActiveTicketId(candidate?.id ?? null);
  }, [tickets, counter, activeTicketId]);

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
    if (!issueType || !canIssue) return;
    setBusy(true); setError('');
    try {
      const issued = await issueTicket({ typeId: issueType.id });
      setIssuedTicket(issued);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a senha.'); }
    finally { setBusy(false); }
  }

  function closeIssue() { setIssueType(null); setIssuePhone(''); setIssuedTicket(null); setError(''); }

  async function callNext() {
    if (!canCall) return;
    setBusy(true); setError('');
    try {
      const call = await callNextTicket(counter);
      const nextTickets = await refresh();
      const calledTicket = nextTickets?.find((ticket) => ticket.ticketNumber === call.ticketNumber && ticket.status === 'called') ?? null;
      if (calledTicket) {
        setActiveTicketId(calledTicket.id);
        setServicePanelMinimized(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível chamar a próxima senha.');
    } finally {
      setBusy(false);
    }
  }

  async function repeatCurrentTicket(ticketId: string) {
    if (!canCall) return;
    setBusy(true); setError('');
    try {
      await repeatTicketCall(ticketId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível repetir a chamada.');
    } finally {
      setBusy(false);
    }
  }

  async function changeTicketStatus(ticketId: string, status: Extract<TicketStatus, 'serving' | 'completed' | 'cancelled'>) {
    if (!canServe) return;
    setBusy(true); setError('');
    try {
      await transitionTicket(ticketId, status);
      const nextTickets = await refresh();
      if (status === 'serving') {
        setActiveTicketId(ticketId);
        setServicePanelMinimized(false);
      } else if (activeTicketId === ticketId) {
        const nextActive = nextTickets
          ?.filter((ticket) => (ticket.status === 'called' || ticket.status === 'serving') && ticket.counterLabel === counter)
          .sort((a, b) => Date.parse(b.calledAt ?? b.createdAt) - Date.parse(a.calledAt ?? a.createdAt))[0] ?? null;
        setActiveTicketId(nextActive?.id ?? null);
        setServicePanelMinimized(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o atendimento.');
    } finally {
      setBusy(false);
    }
  }

  async function completeCurrentTicket(ticketId: string, customerRequest: string) {
    if (!canServe) return;
    setBusy(true); setError('');
    try {
      await completeTicket(ticketId, customerRequest);
      const nextTickets = await refresh();
      if (activeTicketId === ticketId) {
        const nextActive = nextTickets
          ?.filter((ticket) => (ticket.status === 'called' || ticket.status === 'serving') && ticket.counterLabel === counter)
          .sort((a, b) => Date.parse(b.calledAt ?? b.createdAt) - Date.parse(a.calledAt ?? a.createdAt))[0] ?? null;
        setActiveTicketId(nextActive?.id ?? null);
        setServicePanelMinimized(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível encerrar o atendimento.');
    } finally {
      setBusy(false);
    }
  }

  function openCurrentTicket(ticketId: string) {
    setActiveTicketId(ticketId);
    setServicePanelMinimized(false);
  }

  const waiting = tickets.filter((ticket) => ticket.status === 'waiting').length;
  const serving = tickets.filter((ticket) => ticket.status === 'serving' || ticket.status === 'called').length;
  const served = tickets.filter((ticket) => ticket.status === 'completed').length;
  const currentTicket = activeTicketId
    ? tickets.find((ticket) => ticket.id === activeTicketId && (ticket.status === 'called' || ticket.status === 'serving')) ?? null
    : null;
  const counterHasActive = tickets.some((ticket) =>
    (ticket.status === 'called' || ticket.status === 'serving') && ticket.counterLabel === counter
  );

  const heading = {
    queue: ['Fila de atendimento', 'Gerencie as senhas e acompanhe os atendimentos em andamento.'],
    attendance: ['Atendimentos', 'Histórico completo das senhas e atendimentos realizados.'],
    services: ['Tipos de atendimento', 'Configure tipos, prefixos e prioridades da fila.'],
    users: ['Usuários', 'Gerencie quem pode acessar o sistema.'],
    roles: ['Cargos e permissões', 'Controle as funções disponíveis para cada cargo.'],
    media: ['Conteúdo do display', 'Gerencie vídeos e mensagens exibidas na tela de chamadas.'],
    printer: ['Impressora', 'Configure o agente local de impressão de senhas.'],
  }[tab];

  return <main className="staff-app">
    <header className="staff-topbar">
      <Link to="/" className="staff-brand" aria-label="Página inicial"><span className="staff-brand-icon"><TicketCheck size={19} /></span><span><strong>PAINEL DE ATENDIMENTO</strong><small>{userName || 'EQUIPE'} · {roleName || 'USUÁRIO'}</small></span></Link>
      <div className="staff-top-actions">
        {canIssue && <Link className="staff-kiosk-link" to="/totem"><TicketPlus size={16} /> <span>Gerar senhas</span></Link>}
        <button className="staff-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Claro' : 'Escuro'}</span></button>
        <button className="staff-logout" onClick={() => void logout()}><LogOut size={16} /> Sair</button>
      </div>
    </header>

    <section className="staff-main">
      <div className="staff-heading"><div><span className="section-kicker">OPERAÇÃO DA LOJA</span><h1>{heading[0]}</h1><p>{heading[1]}</p></div><div className="date-pill"><CalendarDays size={16} /> {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date())}</div></div>

      {canQueue && <div className="staff-metrics">
        <div className="staff-metric waiting-metric"><span className="metric-icon amber"><Activity size={17} /></span><div><small>Aguardando</small><strong>{waiting}</strong></div></div>
        <div className="staff-metric called-metric"><span className="metric-icon green"><TicketCheck size={17} /></span><div><small>Chamadas / atendimento</small><strong>{serving}</strong></div></div>
        <div className="staff-metric"><span className="metric-icon blue"><TicketCheck size={17} /></span><div><small>Concluídos hoje</small><strong>{served}</strong></div></div>
      </div>}

      <nav className="staff-tabs staff-tabs-expanded" aria-label="Seções do painel">
        {canQueue && <button className={tab === 'queue' ? 'selected' : ''} onClick={() => setTab('queue')}><TicketCheck size={16} /> Fila</button>}
        {canAttendance && <button className={tab === 'attendance' ? 'selected' : ''} onClick={() => setTab('attendance')}><History size={16} /> Atendimentos</button>}
        {canServices && <button className={tab === 'services' ? 'selected' : ''} onClick={() => setTab('services')}><Settings2 size={16} /> Tipos de atendimento</button>}
        {canUsers && <button className={tab === 'users' ? 'selected' : ''} onClick={() => setTab('users')}><Users size={16} /> Usuários</button>}
        {canRoles && <button className={tab === 'roles' ? 'selected' : ''} onClick={() => setTab('roles')}><ShieldCheck size={16} /> Cargos e permissões</button>}
        {canMedia && <button className={tab === 'media' ? 'selected' : ''} onClick={() => setTab('media')}><Clapperboard size={16} /> Display</button>}
        {canPrinter && <button className={tab === 'printer' ? 'selected' : ''} onClick={() => setTab('printer')}><Printer size={16} /> Impressora</button>}
        {tab === 'queue' && canCall && <>
          <label className="counter-field">Balcão<input aria-label="Balcão de atendimento" value={counter} onChange={(event) => setCounter(event.target.value)} maxLength={40} /></label>
          <button className="global-call-button" disabled={busy || waiting === 0 || counterHasActive} onClick={() => void callNext()}>
            <Megaphone size={16} /> {counterHasActive ? 'Atendimento em andamento' : waiting === 0 ? 'Fila vazia' : 'Chamar próximo'}
          </button>
        </>}
      </nav>

      {error && <div className="staff-error" role="alert">{error}<button onClick={() => void refresh()}>Tentar novamente</button></div>}
      {tab === 'queue' && canQueue && <div className="queue-grid">{types.length === 0 ? <div className="empty-services"><Wrench size={22} /><h2>Nenhum atendimento ativo</h2><p>Cadastre um tipo de atendimento para começar a receber senhas.</p>{canServices && <button className="blue-button" onClick={() => setTab('services')}>Configurar atendimentos</button>}</div> : types.map((type) => <QueueColumn key={type.id} type={type} tickets={tickets.filter((ticket) => ticket.serviceTypeId === type.id)} busy={busy} canIssue={canIssue} canServe={canServe} onIssue={() => { setIssueType(type); setIssuedTicket(null); }} onOpen={openCurrentTicket} onTransition={(id, status) => void changeTicketStatus(id, status)} />)}</div>}
      {tab === 'attendance' && canAttendance && <AttendanceHistory />}
      {tab === 'services' && canServices && <ServiceTypeSettings onChanged={() => void refresh()} />}
      {tab === 'users' && canUsers && <UsersSettings />}
      {tab === 'roles' && canRoles && <RolesSettings />}
      {tab === 'media' && canMedia && <MediaSettings onChanged={() => void refresh()} />}
      {tab === 'printer' && canPrinter && <PrinterSettings />}
      {availableTabs.length === 0 && <div className="attendance-empty">Seu usuário não possui nenhum módulo liberado.</div>}
    </section>

    {currentTicket && canQueue && <CurrentServicePanel
      ticket={currentTicket}
      busy={busy}
      minimized={servicePanelMinimized}
      canCall={canCall}
      canServe={canServe}
      onMinimize={() => setServicePanelMinimized(true)}
      onRestore={() => setServicePanelMinimized(false)}
      onRepeat={() => void repeatCurrentTicket(currentTicket.id)}
      onStart={() => void changeTicketStatus(currentTicket.id, 'serving')}
      onComplete={(value) => void completeCurrentTicket(currentTicket.id, value)}
      onCancel={() => void changeTicketStatus(currentTicket.id, 'cancelled')}
    />}

    {issueType && canIssue && <div className="issue-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeIssue(); }}><section className="issue-dialog" role="dialog" aria-modal="true" aria-labelledby="issue-title">
      <button className="issue-close" aria-label="Fechar" onClick={closeIssue}><X size={20} /></button>
      <span className="section-kicker">GERAR SENHA</span>
      <h2 id="issue-title">{issuedTicket ? 'Senha gerada' : issueType.name}</h2>
      {issuedTicket ? <><strong className="issue-result">{issuedTicket.ticketNumber}</strong>{issuedTicket.trackingToken && <TicketTrackingQr token={issuedTicket.trackingToken} compact />}<p>Entregue ou informe a senha ao cliente.</p>{issuePhone && ticketWhatsAppUrl(issuePhone, issuedTicket) ? <a className="whatsapp-button" href={ticketWhatsAppUrl(issuePhone, issuedTicket)!} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> Enviar pelo WhatsApp</a> : issuePhone && <small className="phone-error">Número inválido. Use DDD + número brasileiro.</small>}<button className="kiosk-new-button" onClick={closeIssue}>Fechar</button></> : <><p>O número do WhatsApp é opcional. O envio será confirmado no aplicativo após a emissão.</p><label htmlFor="staff-phone">WhatsApp do cliente</label><input id="staff-phone" type="tel" inputMode="tel" placeholder="(11) 91234-5678" autoComplete="tel" maxLength={20} value={issuePhone} onChange={(event) => setIssuePhone(event.target.value)} /><button className="kiosk-generate-button" disabled={busy} onClick={() => void issueFromStaff()}>{busy ? 'Gerando…' : 'Confirmar e gerar'}</button></>}
    </section></div>}

    <footer className="system-footer">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
  </main>;
}

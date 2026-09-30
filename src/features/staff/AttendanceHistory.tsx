import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Search } from 'lucide-react';
import { Button, EmptyState, Notice, SectionHeader, SelectField, TextField } from '../../components/ui';
import type { AttendanceRecord } from '../../lib/supabase/queue-api';
import { listAttendanceHistory } from '../../lib/supabase/queue-api';

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function duration(start: string | null, end: string | null) {
  if (!start) return '—';
  const ms = Math.max(0, Date.parse(end ?? new Date().toISOString()) - Date.parse(start));
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function dateTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

const statusLabels: Record<string, string> = {
  waiting: 'Aguardando',
  called: 'Aguardando cliente',
  serving: 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export function AttendanceHistory() {
  const [from, setFrom] = useState('2020-01-01');
  const [to, setTo] = useState(today);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRecords(await listAttendanceHistory(from, to));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os atendimentos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [from, to]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (status !== 'all' && record.status !== status) return false;
      if (!needle) return true;
      return [record.ticketNumber, record.serviceTypeName, record.customerRequest, record.attendantName, record.attendantUsername]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }, [records, status, query]);

  return <section className="attendance-panel">
    <SectionHeader
      eyebrow="HISTÓRICO"
      title="Atendimentos"
      description="Consulte todas as senhas, pedidos dos clientes, status e tempos da operação."
      actions={<div className="attendance-count"><strong>{filtered.length}</strong><small>registros</small></div>}
    />

    <div className="attendance-filters">
      <TextField label="De" icon={<CalendarDays size={15} />} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      <TextField label="Até" icon={<CalendarDays size={15} />} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      <TextField className="attendance-search" label="Buscar" icon={<Search size={15} />} placeholder="Senha, pedido ou atendente" value={query} onChange={(event) => setQuery(event.target.value)} />
      <SelectField label="Status" aria-label="Status do atendimento" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="all">Todos os status</option>
        <option value="waiting">Aguardando</option>
        <option value="called">Aguardando cliente</option>
        <option value="serving">Em atendimento</option>
        <option value="completed">Concluído</option>
        <option value="cancelled">Cancelado</option>
      </SelectField>
    </div>

    {error && <Notice tone="danger">{error}<Button variant="ghost" size="sm" onClick={() => void load()}>Tentar novamente</Button></Notice>}
    {loading ? <EmptyState icon={<Clock3 size={20} />}>Carregando atendimentos…</EmptyState> :
      filtered.length === 0 ? <EmptyState>Nenhum atendimento encontrado nesse período.</EmptyState> :
      <div className="attendance-table-wrap">
        <table className="attendance-table">
          <thead><tr>
            <th>Senha</th><th>Atendimento / pedido</th><th>Status</th><th>Atendente</th><th>Espera</th><th>Atendimento</th><th>Entrada</th><th>Final</th>
          </tr></thead>
          <tbody>{filtered.map((record) => {
            const waitingEnd = record.calledAt ?? record.cancelledAt;
            const finishedAt = record.completedAt ?? record.cancelledAt;
            return <tr key={record.id}>
              <td><strong className="attendance-ticket">{record.ticketNumber}</strong><small>{record.counterLabel ?? '—'}</small></td>
              <td><strong>{record.serviceTypeName}</strong><p>{record.customerRequest || (record.status === 'cancelled' ? 'Senha cancelada antes do atendimento.' : 'Sem descrição registrada.')}</p></td>
              <td><span className={`attendance-status ${record.status}`}>{statusLabels[record.status] ?? record.status}</span></td>
              <td><strong>{record.attendantName ?? '—'}</strong><small>{record.attendantUsername ? `@${record.attendantUsername}` : ''}</small></td>
              <td>{duration(record.createdAt, waitingEnd)}</td>
              <td>{duration(record.startedAt, record.completedAt)}</td>
              <td>{dateTime(record.createdAt)}</td>
              <td>{dateTime(finishedAt)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
  </section>;
}

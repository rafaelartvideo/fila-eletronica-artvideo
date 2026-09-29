import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, X } from 'lucide-react';
import type { TicketPriority, TicketType } from '../../domain/queue';
import { ticketPriorityLabel } from '../../domain/queue';
import { listTicketTypes, saveTicketType, subscribeToQueueChanges } from '../../lib/supabase/queue-api';

const priorities: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export function ServiceTypeSettings({ onChanged }: { onChanged: () => void }) {
  const [types, setTypes] = useState<TicketType[]>([]);
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try { setTypes(await listTicketTypes()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar atendimentos.'); }
  }

  useEffect(() => {
    let active = true;
    void refresh();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['ticket_types'], () => {
        if (active) void refresh();
      }, (status) => {
        if (active && status === 'SUBSCRIBED') void refresh();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, []);

  function openCreate() {
    setEditing(null);
    setName('');
    setPrefix('');
    setPriority('normal');
    setError('');
    setModalOpen(true);
  }

  function openEdit(type: TicketType) {
    setEditing(type);
    setName(type.name);
    setPrefix(type.prefix);
    setPriority(type.priority);
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setEditing(null);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveTicketType({
        id: editing?.id,
        name,
        prefix,
        priority,
        isActive: editing?.isActive ?? true,
      });
      setModalOpen(false);
      setEditing(null);
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(type: TicketType) {
    setBusy(true); setError('');
    try {
      await saveTicketType({
        id: type.id,
        name: type.name,
        prefix: type.prefix,
        priority: type.priority,
        isActive: !type.isActive,
      });
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="settings-panel">
    <header className="service-settings-header">
      <div>
        <span className="section-kicker">CONFIGURAÇÕES</span>
        <h2>Tipos de atendimento</h2>
        <p>Organize os atendimentos, prefixos e a prioridade usada na fila.</p>
      </div>
      <button className="blue-button service-new-button" type="button" onClick={openCreate}><Plus size={16} /> Novo atendimento</button>
    </header>

    {error && !modalOpen && <div role="alert" className="form-error">{error}</div>}

    <div className="settings-list service-type-grid">
      {types.map((type) => <div key={type.id} className="setting-row service-type-card">
        <div className={`service-dot ${type.isActive ? 'on' : ''}`} />
        <div className="service-type-copy">
          <strong>{type.name}</strong>
          <small>Prefixo {type.prefix}</small>
          <span className={`priority-badge ${type.priority}`}>{ticketPriorityLabel(type.priority)}</span>
        </div>
        <div className="service-type-actions">
          <button className="subtle-button" type="button" disabled={busy} onClick={() => openEdit(type)}><Pencil size={15} /> Editar</button>
          <button className="subtle-button" type="button" disabled={busy} onClick={() => void toggle(type)}><Power size={15} /> {type.isActive ? 'Desativar' : 'Ativar'}</button>
        </div>
      </div>)}
    </div>

    {modalOpen && <div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <section className="service-type-modal" role="dialog" aria-modal="true" aria-labelledby="service-type-modal-title">
        <button className="service-type-modal-close" type="button" aria-label="Fechar" disabled={busy} onClick={closeModal}><X size={19} /></button>
        <span className="section-kicker">{editing ? 'EDITAR ATENDIMENTO' : 'NOVO ATENDIMENTO'}</span>
        <h2 id="service-type-modal-title">{editing ? editing.name : 'Criar atendimento'}</h2>
        <p>A prioridade define a ordem da fila antes do horário de chegada.</p>

        <form className="service-type-modal-form" onSubmit={submit}>
          <label>Nome do atendimento<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Conserto" required maxLength={80} /></label>
          <label>Prefixo<input value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))} placeholder="C" required maxLength={3} /></label>
          <label>Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
            {priorities.map((value) => <option key={value} value={value}>{ticketPriorityLabel(value)}</option>)}
          </select></label>
          {error && <div role="alert" className="form-error">{error}</div>}
          <div className="service-type-modal-actions">
            <button className="subtle-button" type="button" disabled={busy} onClick={closeModal}>Cancelar</button>
            <button className="blue-button" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Criar atendimento'}</button>
          </div>
        </form>
      </section>
    </div>}
  </section>;
}

import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { GripVertical, Pencil, Pin, Plus, Power, Trash2, X, Zap } from 'lucide-react';
import { Button, Checkbox, Notice, SectionHeader, SelectField, Surface, TextAreaField, TextField } from '../../components/ui';
import { isServiceTypeImageUrl, ServiceTypeIcon, serviceTypeExtraIconOptions, serviceTypeIconOptions } from '../../components/ServiceTypeIcon';
import { ModalPortal } from '../../components/ModalPortal';
import type { TicketPriority, TicketType } from '../../domain/queue';
import { ticketPriorityLabel } from '../../domain/queue';
import { deleteTicketType, listTicketTypes, reorderTicketTypes, saveTicketType, subscribeToQueueChanges } from '../../lib/supabase/queue-api';

const priorities: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export function ServiceTypeSettings({ onChanged }: { onChanged: () => void }) {
  const [types, setTypes] = useState<TicketType[]>([]);
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [deleting, setDeleting] = useState<TicketType | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('clipboard');
  const [extraIcons, setExtraIcons] = useState<string[]>([]);
  const [extraIconUrl, setExtraIconUrl] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [quick, setQuick] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setTypes(await listTicketTypes());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar atendimentos.');
    }
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
    setDescription('');
    setIcon('clipboard');
    setExtraIcons([]);
    setExtraIconUrl('');
    setPriority('normal');
    setQuick(false);
    setPinned(false);
    setError('');
    setModalOpen(true);
  }

  function openEdit(type: TicketType) {
    setEditing(type);
    setName(type.name);
    setPrefix(type.prefix);
    setDescription(type.description ?? '');
    setIcon(type.icon || 'clipboard');
    setExtraIcons(type.extraIcons?.slice(0, 4) ?? []);
    setExtraIconUrl('');
    setPriority(type.priority);
    setQuick(type.isQuick);
    setPinned(type.isPinned);
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setEditing(null);
    setError('');
  }

  function toggleExtraIcon(value: string) {
    setExtraIcons((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= 4) return current;
      return [...current, value];
    });
  }

  function addExtraIconUrl() {
    const value = extraIconUrl.trim();
    if (!value) return;
    if (!isServiceTypeImageUrl(value)) {
      setError('Informe uma URL válida para o ícone adicional.');
      return;
    }
    setExtraIcons((current) => current.includes(value) || current.length >= 4 ? current : [...current, value]);
    setExtraIconUrl('');
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
        description,
        icon,
        extraIcons,
        priority,
        isQuick: quick,
        isPinned: pinned,
        isActive: editing?.isActive ?? true,
        sortOrder: editing?.sortOrder ?? types.length,
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
    setBusy(true);
    setError('');
    try {
      await saveTicketType({
        id: type.id,
        name: type.name,
        prefix: type.prefix,
        description: type.description,
        icon: type.icon,
        extraIcons: type.extraIcons ?? [],
        priority: type.priority,
        isQuick: type.isQuick,
        isPinned: type.isPinned,
        isActive: !type.isActive,
        sortOrder: type.sortOrder,
      });
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await deleteTicketType(deleting.id);
      setDeleting(null);
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o atendimento.');
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  async function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId || busy) {
      setDraggedId(null);
      return;
    }
    const fromIndex = types.findIndex((type) => type.id === draggedId);
    const toIndex = types.findIndex((type) => type.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedId(null);
      return;
    }

    const next = [...types];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setTypes(next.map((type, index) => ({ ...type, sortOrder: index })));
    setDraggedId(null);
    setBusy(true);
    setError('');
    try {
      await reorderTicketTypes(next.map((type) => type.id));
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a ordem.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, id: string) {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  return <section className="settings-panel">
    <SectionHeader
      eyebrow="CONFIGURAÇÕES"
      title="Tipos de atendimento"
      description="Defina apresentação, prioridade, comportamento e ordem dos atendimentos."
      actions={<Button variant="primary" type="button" onClick={openCreate} startIcon={<Plus size={16} />}>Novo atendimento</Button>}
    />

    {error && !modalOpen && <Notice tone="danger">{error}</Notice>}

    <div className="service-type-sort-area">
      <div className="service-type-sort-hint">
        <GripVertical size={18} />
        <div><strong>Ordem na geração de senha</strong><small>Arraste os atendimentos para a posição desejada.</small></div>
      </div>

      <div className="settings-list service-type-grid">
        {types.map((type) => <Surface
          as="article"
          key={type.id}
          className={`setting-row service-type-card ${draggedId === type.id ? 'is-dragging' : ''}`}
          draggable={!busy}
          onDragStart={(event) => handleDragStart(event, type.id)}
          onDragEnd={() => setDraggedId(null)}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={(event) => { event.preventDefault(); void dropOn(type.id); }}
        >
          <button className="service-type-drag-handle" type="button" aria-label={`Arrastar ${type.name}`} tabIndex={-1}><GripVertical size={17} /></button>
          <span className="service-type-icon-preview"><ServiceTypeIcon name={type.icon} size={21} /></span>
          <div className="service-type-copy">
            <div className="service-type-title-line">
              <strong>{type.name}</strong>
              {type.isPinned && <Pin size={14} aria-label="Fixado" />}
            </div>
            <small>{type.description || `Prefixo ${type.prefix}`}</small>
            {(type.extraIcons?.length ?? 0) > 0 && <div className="service-type-extra-icons" aria-label="Ícones adicionais">
              {(type.extraIcons ?? []).map((extraIcon, index) => <span key={`${extraIcon}-${index}`} title={serviceTypeExtraIconOptions.find((option) => option.value === extraIcon)?.label || 'Ícone adicional'}>
                <ServiceTypeIcon name={extraIcon} size={17} />
              </span>)}
            </div>}
            <div className="service-type-badges">
              <span className={`priority-badge ${type.priority}`}>{ticketPriorityLabel(type.priority)}</span>
              {type.isQuick && <span className="service-flag quick"><Zap size={12} /> Rápido</span>}
              {type.isPinned && <span className="service-flag pinned"><Pin size={12} /> Fixado</span>}
              {!type.isActive && <span className="service-flag inactive">Inativo</span>}
            </div>
          </div>
          <div className="service-type-actions">
            <Button variant="secondary" size="sm" type="button" disabled={busy} onClick={() => openEdit(type)} startIcon={<Pencil size={15} />}>Editar</Button>
            <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => void toggle(type)} startIcon={<Power size={15} />}>
              {type.isActive ? 'Desativar' : 'Ativar'}
            </Button>
            <Button className="service-type-delete-button" variant="ghost" size="sm" iconOnly type="button" disabled={busy} onClick={() => setDeleting(type)} aria-label={`Excluir ${type.name}`} title="Excluir atendimento">
              <Trash2 size={16} />
            </Button>
          </div>
        </Surface>)}
      </div>
    </div>

    {modalOpen && <ModalPortal><div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <Surface tone="raised" className="service-type-modal service-type-editor-modal" role="dialog" aria-modal="true" aria-labelledby="service-type-modal-title">
        <Button className="service-type-modal-close" variant="ghost" size="sm" iconOnly type="button" aria-label="Fechar" disabled={busy} onClick={closeModal}><X size={19} /></Button>
        <span className="ui-eyebrow">{editing ? 'EDITAR ATENDIMENTO' : 'NOVO ATENDIMENTO'}</span>
        <h2 id="service-type-modal-title">{editing ? editing.name : 'Criar atendimento'}</h2>
        <p>As informações abaixo também aparecem na tela de geração de senha.</p>

        <form className="service-type-modal-form service-type-editor-form" onSubmit={submit}>
          <TextField label="Nome do atendimento" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Troca rápida de botão" required maxLength={80} />
          <TextAreaField label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explique de forma curta quando o cliente deve escolher este atendimento." maxLength={180} rows={3} />
          <div className="service-type-form-row">
            <TextField label="Prefixo" value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))} placeholder="C" required maxLength={3} />
            <SelectField label="Ícone principal" value={icon} onChange={(event) => setIcon(event.target.value)}>
              {serviceTypeIconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
          </div>
          <div className="service-extra-editor">
            <div className="service-extra-editor-head">
              <div><strong>Ícones adicionais</strong><small>Mostrados no card além do ícone principal.</small></div>
              <span>{extraIcons.length}/4</span>
            </div>
            <div className="service-extra-options">
              {serviceTypeExtraIconOptions.map((option) => {
                const selected = extraIcons.includes(option.value);
                return <button
                  key={option.value}
                  className={`service-extra-option ${selected ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => toggleExtraIcon(option.value)}
                  disabled={!selected && extraIcons.length >= 4}
                >
                  <ServiceTypeIcon name={option.value} size={18} />
                  <span>{option.label}</span>
                </button>;
              })}
            </div>
            <div className="service-extra-url-row">
              <TextField
                label="URL de outro ícone ou imagem"
                type="url"
                value={extraIconUrl}
                onChange={(event) => setExtraIconUrl(event.target.value)}
                placeholder="https://..."
                hint="PNG, WebP ou SVG. O total, incluindo os ícones prontos, é de 4."
              />
              <Button variant="secondary" type="button" onClick={addExtraIconUrl} disabled={!extraIconUrl.trim() || extraIcons.length >= 4}>Adicionar</Button>
            </div>
            {extraIcons.some(isServiceTypeImageUrl) && <div className="service-extra-custom-list">
              {extraIcons.filter(isServiceTypeImageUrl).map((extraIcon) => <button key={extraIcon} type="button" className="service-extra-custom-chip" onClick={() => setExtraIcons((current) => current.filter((item) => item !== extraIcon))} title="Remover imagem">
                <ServiceTypeIcon name={extraIcon} size={18} />
                <span>Imagem personalizada</span>
                <X size={13} />
              </button>)}
            </div>}
          </div>
          <SelectField label="Prioridade" value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
            {priorities.map((value) => <option key={value} value={value}>{ticketPriorityLabel(value)}</option>)}
          </SelectField>
          <div className="service-type-options">
            <Checkbox label="Atendimento rápido" checked={quick} onChange={(event) => setQuick(event.target.checked)} />
            <small>Permite chamar uma senha específica e recebe prioridade máxima no “Chamar próximo”.</small>
            <Checkbox label="Fixar na fila" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <small>Mantém este tipo no topo da seção de filas, sem alterar a ordem de geração de senha.</small>
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="service-type-modal-actions">
            <Button variant="secondary" type="button" disabled={busy} onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={busy}>{editing ? 'Salvar' : 'Criar atendimento'}</Button>
          </div>
        </form>
      </Surface>
    </div></ModalPortal>}

    {deleting && <ModalPortal><div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeleting(null); }}>
      <Surface tone="raised" className="service-type-modal service-type-delete-modal" role="dialog" aria-modal="true">
        <Button className="service-type-modal-close" variant="ghost" size="sm" iconOnly type="button" onClick={() => setDeleting(null)} disabled={busy} aria-label="Fechar"><X size={19} /></Button>
        <span className="ui-eyebrow">EXCLUIR ATENDIMENTO</span>
        <h2>{deleting.name}</h2>
        <p>O tipo será apagado do banco. Se já houver senhas vinculadas, a exclusão será bloqueada para preservar o histórico.</p>
        <div className="ui-modal-actions">
          <Button variant="secondary" type="button" onClick={() => setDeleting(null)} disabled={busy}>Cancelar</Button>
          <Button className="danger-action-button" variant="secondary" type="button" loading={busy} onClick={() => void confirmDelete()}>Excluir</Button>
        </div>
      </Surface>
    </div></ModalPortal>}
  </section>;
}

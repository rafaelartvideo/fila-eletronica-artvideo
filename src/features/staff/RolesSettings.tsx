import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LockKeyhole, Pencil, Plus, ShieldCheck, X } from 'lucide-react';
import { Badge, Button, Checkbox, Notice, SectionHeader, Surface, TextField } from '../../components/ui';
import type { QueuePermission, QueueRole } from '../../lib/supabase/queue-api';
import { listQueuePermissions, listQueueRoles, saveQueueRole } from '../../lib/supabase/queue-api';
import { useAuth } from '../auth/AuthProvider';

export function RolesSettings() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('roles.manage');
  const [roles, setRoles] = useState<QueueRole[]>([]);
  const [permissions, setPermissions] = useState<QueuePermission[]>([]);
  const [editing, setEditing] = useState<QueueRole | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [nextRoles, nextPermissions] = await Promise.all([listQueueRoles(), listQueuePermissions()]);
      setRoles(nextRoles);
      setPermissions(nextPermissions.filter((permission) => permission.key !== 'system.admin'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar cargos e permissões.');
    }
  }

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, QueuePermission[]>();
    permissions.forEach((permission) => {
      const list = groups.get(permission.moduleName) ?? [];
      list.push(permission);
      groups.set(permission.moduleName, list);
    });
    return [...groups.entries()];
  }, [permissions]);

  function create() {
    setEditing(null);
    setName('');
    setDescription('');
    setSelected([]);
    setActive(true);
    setError('');
    setOpen(true);
  }

  function edit(role: QueueRole) {
    if (role.isSystem) return;
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? '');
    setSelected(role.permissions.filter((key) => key !== 'system.admin'));
    setActive(role.isActive);
    setError('');
    setOpen(true);
  }

  function toggle(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveQueueRole({ id: editing?.id, name, description, isActive: active, permissions: selected });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cargo.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="access-panel">
    <SectionHeader
      eyebrow="ACESSOS"
      title="Cargos e permissões"
      description="Defina quais módulos e ações cada cargo pode utilizar."
      actions={canManage ? <Button variant="primary" type="button" onClick={create} startIcon={<Plus size={16} />}>Novo cargo</Button> : null}
    />

    {error && !open && <Notice tone="danger">{error}<Button variant="ghost" size="sm" onClick={() => void load()}>Tentar novamente</Button></Notice>}

    <div className="roles-grid">
      {roles.map((role) => <Surface tone="soft" as="article" key={role.id} className="role-card">
        <div className="role-card-head">
          <span>{role.isSystem ? <LockKeyhole size={18} /> : <ShieldCheck size={18} />}</span>
          <div><strong>{role.name}</strong><small>{role.isActive ? 'Ativo' : 'Inativo'}</small></div>
        </div>
        <p>{role.description || 'Sem descrição.'}</p>
        <Badge tone="info">{role.permissions.length} permissões</Badge>
        {role.isSystem
          ? <small className="role-system-note">Cargo protegido do sistema.</small>
          : canManage
            ? <Button variant="secondary" size="sm" type="button" onClick={() => edit(role)} startIcon={<Pencil size={15} />}>Editar cargo</Button>
            : <small className="role-system-note">Somente visualização.</small>}
      </Surface>)}
    </div>

    {open && <div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <Surface tone="raised" className="service-type-modal role-modal" role="dialog" aria-modal="true">
        <Button className="service-type-modal-close" variant="ghost" size="sm" iconOnly type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Fechar"><X size={19} /></Button>
        <span className="ui-eyebrow">{editing ? 'EDITAR CARGO' : 'NOVO CARGO'}</span>
        <h2>{editing ? editing.name : 'Criar cargo'}</h2>
        <form className="role-form ui-form-grid" onSubmit={submit}>
          <div className="ui-form-grid ui-form-grid--2">
            <TextField label="Nome" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
            <TextField label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} />
          </div>
          <div className="permission-groups">
            {grouped.map(([moduleName, items]) => <Surface tone="soft" key={moduleName}>
              <h3>{moduleName}</h3>
              {items.map((permission) => <Checkbox
                key={permission.key}
                className="permission-row"
                checked={selected.includes(permission.key)}
                onChange={() => toggle(permission.key)}
                label={permission.label}
                description={permission.description}
              />)}
            </Surface>)}
          </div>
          <Checkbox label="Cargo ativo" checked={active} onChange={(event) => setActive(event.target.checked)} />
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="ui-modal-actions">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={busy}>Salvar cargo</Button>
          </div>
        </form>
      </Surface>
    </div>}
  </section>;
}

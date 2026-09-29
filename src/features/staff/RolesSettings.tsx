import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LockKeyhole, Pencil, Plus, ShieldCheck, X } from 'lucide-react';
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
    <header className="panel-section-header">
      <div><span className="section-kicker">ACESSOS</span><h2>Cargos e permissões</h2><p>Defina quais módulos e ações cada cargo pode utilizar.</p></div>
      {canManage && <button className="blue-button" type="button" onClick={create}><Plus size={16} /> Novo cargo</button>}
    </header>

    {error && !open && <div className="staff-error" role="alert">{error}<button onClick={() => void load()}>Tentar novamente</button></div>}

    <div className="roles-grid">
      {roles.map((role) => <article key={role.id} className="role-card">
        <div className="role-card-head"><span>{role.isSystem ? <LockKeyhole size={18} /> : <ShieldCheck size={18} />}</span><div><strong>{role.name}</strong><small>{role.isActive ? 'Ativo' : 'Inativo'}</small></div></div>
        <p>{role.description || 'Sem descrição.'}</p>
        <div className="role-permission-summary">{role.permissions.length} permissões</div>
        {role.isSystem ? <small className="role-system-note">Cargo protegido do sistema.</small> : canManage ? <button className="subtle-button" type="button" onClick={() => edit(role)}><Pencil size={15} /> Editar cargo</button> : <small className="role-system-note">Somente visualização.</small>}
      </article>)}
    </div>

    {open && <div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="service-type-modal role-modal" role="dialog" aria-modal="true">
        <button className="service-type-modal-close" type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Fechar"><X size={19} /></button>
        <span className="section-kicker">{editing ? 'EDITAR CARGO' : 'NOVO CARGO'}</span>
        <h2>{editing ? editing.name : 'Criar cargo'}</h2>
        <form className="role-form" onSubmit={submit}>
          <div className="role-fields"><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label><label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} /></label></div>
          <div className="permission-groups">{grouped.map(([moduleName, items]) => <section key={moduleName}><h3>{moduleName}</h3>{items.map((permission) => <label key={permission.key} className="permission-row"><input type="checkbox" checked={selected.includes(permission.key)} onChange={() => toggle(permission.key)} /><span><strong>{permission.label}</strong><small>{permission.description}</small></span></label>)}</section>)}</div>
          <label className="user-active-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> <span>Cargo ativo</span></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="service-type-modal-actions"><button className="subtle-button" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button><button className="blue-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar cargo'}</button></div>
        </form>
      </section>
    </div>}
  </section>;
}

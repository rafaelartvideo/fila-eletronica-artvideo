import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, UserRound, X } from 'lucide-react';
import type { QueueRole, QueueUser } from '../../lib/supabase/queue-api';
import { listQueueRoles, listQueueUsers, saveQueueUser } from '../../lib/supabase/queue-api';
import { normalizeUsername } from '../auth/username';

export function UsersSettings() {
  const [users, setUsers] = useState<QueueUser[]>([]);
  const [roles, setRoles] = useState<QueueRole[]>([]);
  const [editing, setEditing] = useState<QueueUser | null>(null);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [nextUsers, nextRoles] = await Promise.all([listQueueUsers(), listQueueRoles()]);
      setUsers(nextUsers);
      setRoles(nextRoles.filter((role) => role.isActive));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os usuários.');
    }
  }

  useEffect(() => { void load(); }, []);

  function create() {
    setEditing(null);
    setFullName('');
    setUsername('');
    setRoleId(roles.find((role) => role.name === 'Atendente')?.id ?? roles[0]?.id ?? '');
    setPassword('');
    setActive(true);
    setError('');
    setOpen(true);
  }

  function edit(user: QueueUser) {
    setEditing(user);
    setFullName(user.fullName);
    setUsername(user.username);
    setRoleId(user.roleId);
    setPassword('');
    setActive(user.isActive);
    setError('');
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveQueueUser({
        userId: editing?.userId,
        fullName,
        username: normalizeUsername(username),
        roleId,
        password,
        isActive: active,
      });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o usuário.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="access-panel">
    <header className="panel-section-header">
      <div><span className="section-kicker">ACESSOS</span><h2>Usuários</h2><p>Crie logins por usuário e vincule cada pessoa ao seu cargo.</p></div>
      <button className="blue-button" type="button" onClick={create}><Plus size={16} /> Novo usuário</button>
    </header>

    {error && !open && <div className="staff-error" role="alert">{error}<button onClick={() => void load()}>Tentar novamente</button></div>}

    <div className="users-list">
      {users.map((user) => <article key={user.userId} className="user-row">
        <span className="user-avatar"><UserRound size={19} /></span>
        <div><strong>{user.fullName}</strong><small>@{user.username}</small></div>
        <div><small>Cargo</small><strong>{user.roleName}</strong></div>
        <span className={`user-status ${user.isActive ? 'active' : 'inactive'}`}>{user.isActive ? 'Ativo' : 'Inativo'}</span>
        <button className="subtle-button" type="button" onClick={() => edit(user)}><Pencil size={15} /> Editar</button>
      </article>)}
      {users.length === 0 && <div className="attendance-empty">Nenhum usuário cadastrado.</div>}
    </div>

    {open && <div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="service-type-modal user-modal" role="dialog" aria-modal="true">
        <button className="service-type-modal-close" type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Fechar"><X size={19} /></button>
        <span className="section-kicker">{editing ? 'EDITAR USUÁRIO' : 'NOVO USUÁRIO'}</span>
        <h2>{editing ? editing.fullName : 'Criar usuário'}</h2>
        <p>O login será feito pelo campo Usuário. O e-mail técnico do Supabase não fica visível para o atendente.</p>
        <form className="service-type-modal-form" onSubmit={submit}>
          <label>Nome<input value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} /></label>
          <label>Usuário<input value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} required minLength={3} maxLength={32} autoComplete="off" spellCheck={false} placeholder="ex.: joao.silva" /></label>
          <label>Cargo<select value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
            <option value="">Selecione</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select></label>
          <label>{editing ? 'Nova senha (opcional)' : 'Senha'}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!editing} minLength={8} autoComplete="new-password" placeholder={editing ? 'Deixe vazio para manter' : 'Mínimo de 8 caracteres'} /></label>
          <label className="user-active-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> <span>Usuário ativo</span></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="service-type-modal-actions"><button className="subtle-button" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button><button className="blue-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
        </form>
      </section>
    </div>}
  </section>;
}

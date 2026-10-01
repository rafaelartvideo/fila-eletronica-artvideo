import { useEffect, useState, type FormEvent } from 'react';
import { Pause, Pencil, Play, Plus, UserRound, X } from 'lucide-react';
import { Badge, Button, Checkbox, EmptyState, Notice, SectionHeader, SelectField, Surface, TextField } from '../../components/ui';
import { ModalPortal } from '../../components/ModalPortal';
import type { QueueRole, QueueUser } from '../../lib/supabase/queue-api';
import { listQueueRoles, listQueueUsers, saveQueueUser } from '../../lib/supabase/queue-api';
import { normalizeUsername } from '../auth/username';
import { useAuth } from '../auth/AuthProvider';

export function UsersSettings() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('users.manage');
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

  async function toggleUser(user: QueueUser) {
    setBusy(true);
    setError('');
    try {
      await saveQueueUser({
        userId: user.userId,
        fullName: user.fullName,
        username: user.username,
        roleId: user.roleId,
        password: '',
        isActive: !user.isActive,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o status do usuário.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="access-panel">
    <SectionHeader
      eyebrow="ACESSOS"
      title="Usuários"
      description="Crie logins por usuário e vincule cada pessoa ao seu cargo."
      actions={canManage ? <Button variant="primary" type="button" onClick={create} startIcon={<Plus size={16} />}>Novo usuário</Button> : null}
    />

    {error && !open && <Notice tone="danger">{error}<Button variant="ghost" size="sm" onClick={() => void load()}>Tentar novamente</Button></Notice>}

    <div className="users-list">
      {users.map((user) => <Surface tone="soft" as="article" key={user.userId} className="user-row">
        <span className="user-avatar"><UserRound size={19} /></span>
        <div><strong>{user.fullName}</strong><small>@{user.username}</small></div>
        <div><small>Cargo</small><strong>{user.roleName}</strong></div>
        <Badge tone={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Ativo' : 'Inativo'}</Badge>
        {canManage && <div className="user-row-actions">
          <Button variant="secondary" size="sm" type="button" disabled={busy} onClick={() => edit(user)} startIcon={<Pencil size={15} />}>Editar</Button>
          <Button
            className={`user-active-toggle ${user.isActive ? 'pause' : 'play'}`}
            variant="ghost"
            size="sm"
            iconOnly
            type="button"
            disabled={busy}
            onClick={() => void toggleUser(user)}
            aria-label={user.isActive ? `Inativar ${user.fullName}` : `Ativar ${user.fullName}`}
            title={user.isActive ? 'Inativar usuário' : 'Ativar usuário'}
          >
            {user.isActive ? <Pause size={16} /> : <Play size={16} />}
          </Button>
        </div>}
      </Surface>)}
      {users.length === 0 && <EmptyState icon={<UserRound size={18} />}>Nenhum usuário cadastrado.</EmptyState>}
    </div>

    {open && <ModalPortal><div className="service-type-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <Surface tone="raised" className="service-type-modal user-modal" role="dialog" aria-modal="true">
        <Button className="service-type-modal-close" variant="ghost" size="sm" iconOnly type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Fechar"><X size={19} /></Button>
        <span className="ui-eyebrow">{editing ? 'EDITAR USUÁRIO' : 'NOVO USUÁRIO'}</span>
        <h2>{editing ? editing.fullName : 'Criar usuário'}</h2>
        <p>O login será feito pelo campo Usuário. O e-mail técnico do Supabase não fica visível para o atendente.</p>

        <form className="ui-form-grid" onSubmit={submit}>
          <TextField label="Nome" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} />
          <TextField label="Usuário" value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} required minLength={3} maxLength={32} autoComplete="off" spellCheck={false} placeholder="ex.: joao.silva" />
          <SelectField label="Cargo" value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
            <option value="">Selecione</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </SelectField>
          <TextField
            label={editing ? 'Nova senha (opcional)' : 'Senha'}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required={!editing}
            minLength={8}
            autoComplete="new-password"
            placeholder={editing ? 'Deixe vazio para manter' : 'Mínimo de 8 caracteres'}
          />
          <Checkbox label="Usuário ativo" checked={active} onChange={(event) => setActive(event.target.checked)} />
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="ui-modal-actions">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={busy}>Salvar</Button>
          </div>
        </form>
      </Surface>
    </div></ModalPortal>}
  </section>;
}

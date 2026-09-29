import { FunctionsHttpError } from '@supabase/supabase-js';
import { requireSupabase } from '../../lib/supabase/client';
import { isValidUsername, normalizeUsername } from './username';

export type QueueAccess = {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
};

export const LEGACY_ADMIN_PERMISSIONS = [
  'system.admin',
  'queue.view',
  'queue.issue',
  'queue.call',
  'queue.serve',
  'attendance.view',
  'service_types.manage',
  'users.view',
  'users.manage',
  'roles.view',
  'roles.manage',
  'display.manage',
  'printer.manage',
];

async function functionMessage(error: unknown) {
  if (!(error instanceof FunctionsHttpError)) return '';
  try {
    const payload = await error.context.json();
    return typeof payload?.error === 'string' ? payload.error : '';
  } catch {
    return '';
  }
}

export async function signInWithUsername(identifier: string, password: string): Promise<void> {
  const client = requireSupabase();
  const raw = identifier.trim();

  // Temporary compatibility while the current administrator migrates from e-mail to username.
  if (raw.includes('@')) {
    const result = await client.auth.signInWithPassword({ email: raw.toLowerCase(), password });
    if (result.error) throw new Error('Usuário ou senha incorretos.');
    return;
  }

  const username = normalizeUsername(raw);
  if (!isValidUsername(username) || !password) throw new Error('Usuário ou senha incorretos.');

  const result = await client.functions.invoke('username-auth', {
    body: { username, password },
  });
  if (result.error) {
    const detail = await functionMessage(result.error);
    throw new Error(detail || 'Usuário ou senha incorretos.');
  }
  if (!result.data?.access_token || !result.data?.refresh_token) throw new Error('Usuário ou senha incorretos.');

  const session = await client.auth.setSession({
    access_token: String(result.data.access_token),
    refresh_token: String(result.data.refresh_token),
  });
  if (session.error || !session.data.user) throw new Error('Usuário ou senha incorretos.');
}

export async function getCurrentQueueAccess(): Promise<QueueAccess | null> {
  const client = requireSupabase();
  const result = await client.rpc('my_queue_access');
  if (!result.error) {
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (!row) return null;
    return {
      userId: String(row.user_id),
      username: String(row.username),
      fullName: String(row.full_name),
      roleId: String(row.role_id),
      roleName: String(row.role_name),
      permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    };
  }

  // Keeps the existing administrator working until the access migration is applied.
  if (/my_queue_access|PGRST202|could not find the function/i.test(result.error.message)) {
    const legacy = await client.rpc('is_queue_admin');
    if (legacy.error || legacy.data !== true) return null;
    const session = await client.auth.getSession();
    const email = session.data.session?.user.email ?? 'admin';
    const username = email.split('@')[0] || 'admin';
    return {
      userId: session.data.session?.user.id ?? '',
      username,
      fullName: username,
      roleId: 'legacy-admin',
      roleName: 'Administrador',
      permissions: [...LEGACY_ADMIN_PERMISSIONS],
    };
  }

  throw new Error(result.error.message);
}

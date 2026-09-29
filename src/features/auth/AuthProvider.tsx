import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCurrentQueueAccess, type QueueAccess } from './auth-api';
import { requireSupabase, supabase } from '../../lib/supabase/client';

interface AuthState {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  access: QueueAccess | null;
  permissions: string[];
  roleName: string;
  userName: string;
  hasPermission: (permission: string) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<QueueAccess | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);

  const verifyAccess = useCallback(async (current: Session | null) => {
    if (!current) { setAccess(null); return; }
    try { setAccess(await getCurrentQueueAccess()); } catch { setAccess(null); }
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const client = supabase;
    let active = true;

    const bootstrap = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!active) return;
        sessionUserIdRef.current = data.session?.user.id ?? null;
        setSession(data.session);
        await verifyAccess(data.session);
      } catch {
        if (active) {
          sessionUserIdRef.current = null;
          setSession(null);
          setAccess(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      const nextUserId = next?.user.id ?? null;
      const sameUser = Boolean(nextUserId && sessionUserIdRef.current === nextUserId);
      sessionUserIdRef.current = nextUserId;
      setSession(next);

      if (!next) {
        setAccess(null);
        setLoading(false);
        return;
      }

      if (sameUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) return;

      const blockUi = !sameUser;
      if (blockUi) setLoading(true);
      window.setTimeout(() => {
        if (!active) return;
        void verifyAccess(next).finally(() => {
          if (active && blockUi) setLoading(false);
        });
      }, 0);
    });

    void bootstrap();
    return () => { active = false; subscription.unsubscribe(); };
  }, [verifyAccess]);

  const signOut = useCallback(async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  }, []);

  const permissions = access?.permissions ?? [];
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const hasPermission = useCallback((permission: string) => permissionSet.has('system.admin') || permissionSet.has(permission), [permissionSet]);

  const value = useMemo(() => ({
    session,
    loading,
    isAdmin: Boolean(access),
    access,
    permissions,
    roleName: access?.roleName ?? '',
    userName: access?.fullName || access?.username || '',
    hasPermission,
    signOut,
    refresh: () => verifyAccess(session),
  }), [session, loading, access, permissions, hasPermission, signOut, verifyAccess]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return state;
}

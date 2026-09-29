import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isQueueAdmin } from '../../lib/supabase/queue-api';
import { requireSupabase, supabase } from '../../lib/supabase/client';

interface AuthState {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const verifyAdmin = useCallback(async (current: Session | null) => {
    if (!current) { setIsAdmin(false); return; }
    try { setIsAdmin(await isQueueAdmin()); } catch { setIsAdmin(false); }
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(true);
      window.setTimeout(() => { if (active) void verifyAdmin(next).finally(() => setLoading(false)); }, 0);
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await verifyAdmin(data.session);
      if (active) setLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [verifyAdmin]);

  const signOut = useCallback(async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(() => ({ session, loading, isAdmin, signOut, refresh: () => verifyAdmin(session) }), [session, loading, isAdmin, signOut, verifyAdmin]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return state;
}

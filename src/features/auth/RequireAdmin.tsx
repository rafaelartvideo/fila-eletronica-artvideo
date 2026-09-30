import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="auth-wait"><LoaderCircle className="spin" /> Verificando acesso seguro…</main>;
  if (!session || !isAdmin) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/painel/login" replace state={{ denied: Boolean(session), from }} />;
  }
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { loading, hasPermission } = useAuth();
  if (loading) return <main className="auth-wait"><LoaderCircle className="spin" /> Verificando permissão…</main>;
  if (!hasPermission(permission)) return <Navigate to="/painel" replace />;
  return <>{children}</>;
}

export function AdminBadge() {
  return <span className="admin-badge"><ShieldCheck size={15} /> Equipe autenticada</span>;
}

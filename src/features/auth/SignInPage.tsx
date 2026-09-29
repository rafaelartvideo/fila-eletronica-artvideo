import { useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, Wrench } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuth } from './AuthProvider';
import { requireSupabase, supabase } from '../../lib/supabase/client';

export function SignInPage() {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice] = useState(Boolean((location.state as { denied?: boolean } | null)?.denied));

  if (session && isAdmin && !loading) return <Navigate to="/painel" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { error: authError } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(/invalid login credentials/i.test(message) ? 'E-mail ou senha incorretos.' : message || 'Não foi possível entrar. Tente novamente.');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-back"><ArrowLeft size={16} /> Voltar ao início</Link>
      <section className="auth-card">
        <div className="auth-logo"><BrandLogo /></div>
        <span className="section-kicker">ÁREA RESTRITA</span>
        <h1>Bem-vindo de volta</h1>
        <p>Entre com sua conta da equipe para gerenciar a fila.</p>
        {notice && <div className="form-notice">Esta conta não tem acesso administrativo ao painel.</div>}
        {!supabase && <div className="form-error">Configure a conexão do Supabase para habilitar o login.</div>}
        <form onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div role="alert" className="form-error">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !supabase}>{busy ? 'Entrando…' : <><LockKeyhole size={16} /> Entrar no painel</>}</button>
        </form>
        <small>Acesso exclusivo para administradores.</small>
      </section>
    </main>
  );
}

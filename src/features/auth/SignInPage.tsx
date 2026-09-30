import { useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { signInWithUsername } from './auth-api';
import { supabase } from '../../lib/supabase/client';

export function SignInPage() {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice] = useState(Boolean((location.state as { denied?: boolean } | null)?.denied));

  if (session && isAdmin && !loading) return <Navigate to="/painel" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithUsername(username, password);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(message || 'Usuário ou senha incorretos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-back"><ArrowLeft size={16} /> Voltar ao início</Link>
      <section className="auth-card">
        <div className="auth-logo"><LockKeyhole size={24} /></div>
        <span className="section-kicker">ÁREA RESTRITA</span>
        <h1>Bem-vindo de volta</h1>
        <p>Entre com seu usuário e senha para acessar o sistema de atendimento.</p>
        {notice && <div className="form-notice">Este usuário não possui acesso ativo ao sistema.</div>}
        {!supabase && <div className="form-error">Configure a conexão do Supabase para habilitar o login.</div>}
        <form onSubmit={submit}>
          <label>Usuário<div className="auth-input-shell"><UserRound size={16} /><input type="text" autoComplete="username" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} required /></div></label>
          <label>Senha<div className="auth-input-shell"><LockKeyhole size={16} /><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div></label>
          {error && <div role="alert" className="form-error">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !supabase}>{busy ? 'Entrando…' : <><LockKeyhole size={16} /> Entrar no painel</>}</button>
        </form>
        <small>Acesso exclusivo para usuários autorizados.</small>
      </section>
      <footer className="system-footer">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
    </main>
  );
}

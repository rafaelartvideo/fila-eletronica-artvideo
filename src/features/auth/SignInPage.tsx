import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { Button, Notice, Surface, TextField } from '../../components/ui';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from './AuthProvider';
import { signInWithUsername } from './auth-api';

export function SignInPage() {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <Surface tone="raised" className="auth-card">
        <div className="auth-logo"><LockKeyhole size={24} /></div>
        <span className="ui-eyebrow">ÁREA RESTRITA</span>
        <h1>Bem-vindo de volta</h1>
        <p>Entre com seu usuário e senha para acessar o sistema de atendimento.</p>

        {notice && <Notice tone="warning">Este usuário não possui acesso ativo ao sistema.</Notice>}
        {!supabase && <Notice tone="danger">Configure a conexão do Supabase para habilitar o login.</Notice>}

        <form onSubmit={submit}>
          <TextField
            label="Usuário"
            icon={<UserRound />}
            type="text"
            autoComplete="username"
            spellCheck={false}
            placeholder="Digite seu usuário"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <TextField
            label="Senha"
            icon={<LockKeyhole />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            }
          />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button variant="primary" type="submit" loading={busy} disabled={!supabase} startIcon={<LockKeyhole size={16} />}>
            Entrar no painel
          </Button>
        </form>
        <small>Acesso exclusivo para usuários autorizados.</small>
      </Surface>
      <footer className="system-footer">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
    </main>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, Phone, Ticket } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState, Notice, Surface, TextField } from '../../components/ui';
import { ServiceTypeIcon } from '../../components/ServiceTypeIcon';
import type { QueueTicket, TicketType } from '../../domain/queue';
import { issueTicket, listTicketTypes, subscribeToQueueChanges } from '../../lib/supabase/queue-api';
import { TicketConfirmation } from './TicketConfirmation';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPanel } from '../auth/access-rules';

export function KioskPage() {
  const { hasPermission } = useAuth();
  const canReturnToPanel = canAccessPanel(hasPermission);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [selectedType, setSelectedType] = useState<TicketType | null>(null);
  const [phone, setPhone] = useState('');
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTypes = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const nextTypes = (await listTicketTypes()).filter((type) => type.isActive);
      setTypes(nextTypes);
      setSelectedType((current) => current ? nextTypes.find((type) => type.id === current.id) ?? null : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os atendimentos.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    const existingManifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const manifest = existingManifest ?? document.createElement('link');
    const previousManifestHref = existingManifest?.getAttribute('href') ?? null;

    document.title = 'Gerar senha | Fila Artvideo';

    if (!existingManifest) {
      manifest.rel = 'manifest';
      document.head.appendChild(manifest);
    }
    manifest.setAttribute('href', '/totem.webmanifest');

    return () => {
      document.title = previousTitle;
      if (!existingManifest) {
        manifest.remove();
      } else if (previousManifestHref) {
        manifest.setAttribute('href', previousManifestHref);
      } else {
        manifest.removeAttribute('href');
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadTypes(true);
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['ticket_types'], () => { if (active) void loadTypes(); }, (status) => {
        if (active && status === 'SUBSCRIBED') void loadTypes();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, [loadTypes]);

  async function createTicket() {
    if (!selectedType) return;
    setBusy(true);
    setError('');
    try {
      setTicket(await issueTicket({ typeId: selectedType.id }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível emitir a senha. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSelectedType(null);
    setPhone('');
    setTicket(null);
    setError('');
  }

  return <main className="kiosk-page">
    <header className="kiosk-topbar no-print">
      {canReturnToPanel && <Link to="/painel" className="auth-back"><ArrowLeft size={17} /> Painel</Link>}
      <div className="kiosk-brand"><Ticket size={20} /><strong>RETIRADA DE SENHA</strong></div>
      <span className="kiosk-help"><CircleHelp size={16} /> Precisa de ajuda? Chame nossa equipe</span>
    </header>

    <div className="kiosk-content">
      {ticket ? <TicketConfirmation ticket={ticket} phone={phone} onNewTicket={reset} /> : <>
        <div className="kiosk-welcome">
          <span className="ui-eyebrow">GERAR SENHA</span>
          <h1>{selectedType ? 'Confirme seu atendimento' : 'Como podemos ajudar?'}</h1>
          <p>{selectedType ? (selectedType.description || `Você selecionou ${selectedType.name}. Seu WhatsApp é opcional.`) : 'Escolha o atendimento para gerar sua senha.'}</p>
        </div>

        {error && <Notice tone="danger" className="kiosk-error">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void (selectedType ? createTicket() : loadTypes(true))}>
            {selectedType ? 'Tentar novamente' : 'Recarregar'}
          </Button>
        </Notice>}

        {loading ? <EmptyState>Carregando atendimentos…</EmptyState> : selectedType ? <Surface className="kiosk-step-card">
          <div className="selected-service">
            <div><small>ATENDIMENTO</small><strong>{selectedType.name}</strong></div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedType(null); setError(''); }}>Alterar</Button>
          </div>

          <TextField
            label={<>WhatsApp do cliente <span className="ui-label-muted">(opcional)</span></>}
            icon={<Phone />}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(11) 91234-5678"
            maxLength={20}
            autoComplete="tel"
            hint="Após gerar, você poderá abrir uma mensagem pronta no WhatsApp. O envio precisa ser confirmado no aplicativo."
          />

          <Button variant="primary" size="lg" onClick={() => void createTicket()} loading={busy} endIcon={<ArrowRight size={19} />}>
            Gerar senha
          </Button>
        </Surface> : types.length === 0 ? <EmptyState>Nenhum atendimento está disponível neste momento. Por favor, chame nossa equipe.</EmptyState> :
          <div className="kiosk-service-grid">
            {types.map((type) => <button
              key={type.id}
              type="button"
              className="kiosk-service-card"
              onClick={() => { setSelectedType(type); setError(''); }}
            >
              <span className="kiosk-service-icon"><ServiceTypeIcon name={type.icon} size={22} /></span>
              <span><strong>{type.name}</strong><small>{type.description || 'Retire uma senha'}</small></span>
              <ArrowRight className="kiosk-service-arrow" size={19} />
            </button>)}
          </div>
        }

        {!selectedType && !loading && !error && <p className="kiosk-small-print">O atendimento será realizado por ordem de chegada.</p>}
      </>}
    </div>

    <footer className="system-footer no-print">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>
  </main>;
}

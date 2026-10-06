import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleHelp, Phone, Ticket, X } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState, Notice, Surface, TextField } from '../../components/ui';
import { ServiceTypeIcon, serviceTypeExtraIconLabel } from '../../components/ServiceTypeIcon';
import { ModalPortal } from '../../components/ModalPortal';
import type { QueueTicket, TicketType } from '../../domain/queue';
import { issueTicket, listTicketTypes, subscribeToQueueChanges } from '../../lib/supabase/queue-api';
import { TicketConfirmation } from './TicketConfirmation';
import { formatBrazilianPhone } from '../../domain/whatsapp';

type ExtraIconInfo = { icon: string; title: string; description: string };

function ServiceExtraIconButtons({ type, onOpen }: { type: TicketType; onOpen: (info: ExtraIconInfo) => void }) {
  const icons = type.extraIcons ?? [];
  if (icons.length === 0) return null;

  return <span className="kiosk-service-extra-icons" aria-label="Informações adicionais do atendimento">
    {icons.map((extraIcon, index) => <button
      key={`${extraIcon}-${index}`}
      type="button"
      className="kiosk-service-extra-icon-button"
      aria-label={`Saiba mais: ${serviceTypeExtraIconLabel(extraIcon)}`}
      title={serviceTypeExtraIconLabel(extraIcon)}
      onClick={() => onOpen({
        icon: extraIcon,
        title: serviceTypeExtraIconLabel(extraIcon),
        description: type.extraIconDescriptions?.[extraIcon]?.trim() || 'Descrição ainda não configurada.',
      })}
    >
      <ServiceTypeIcon name={extraIcon} size={17} />
    </button>)}
  </span>;
}

export function KioskPage({ showPanelBack = true }: { showPanelBack?: boolean }) {
  const [types, setTypes] = useState<TicketType[]>([]);
  const [selectedType, setSelectedType] = useState<TicketType | null>(null);
  const [phone, setPhone] = useState('');
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extraIconInfo, setExtraIconInfo] = useState<ExtraIconInfo | null>(null);

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

    document.title = 'Gerar senha | Union Fila';

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
      {showPanelBack && <Link to="/painel" className="auth-back"><ArrowLeft size={17} /> Painel</Link>}
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
            <span className="selected-service-icon"><ServiceTypeIcon name={selectedType.icon} size={24} /></span>
            <div className="selected-service-copy">
              <small>ATENDIMENTO</small>
              <strong>{selectedType.name}</strong>
              <ServiceExtraIconButtons type={selectedType} onOpen={setExtraIconInfo} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedType(null); setError(''); }}>Alterar</Button>
          </div>

          <TextField
            label={<>WhatsApp do cliente <span className="ui-label-muted">(opcional)</span></>}
            icon={<Phone />}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatBrazilianPhone(event.target.value))}
            placeholder="(11) 91234-5678"
            maxLength={15}
            autoComplete="tel"
            hint="Após gerar, você poderá abrir uma mensagem pronta no WhatsApp. O envio precisa ser confirmado no aplicativo."
          />

          <Button variant="primary" size="lg" onClick={() => void createTicket()} loading={busy} endIcon={<ArrowRight size={19} />}>
            Gerar senha
          </Button>
        </Surface> : types.length === 0 ? <EmptyState>Nenhum atendimento está disponível neste momento. Por favor, chame nossa equipe.</EmptyState> :
          <div className="kiosk-service-grid">
            {types.map((type) => <div key={type.id} className="kiosk-service-card">
              <button
                type="button"
                className="kiosk-service-card-main"
                onClick={() => { setSelectedType(type); setError(''); }}
              >
                <span className="kiosk-service-icon"><ServiceTypeIcon name={type.icon} size={22} /></span>
                <span className="kiosk-service-copy">
                  <strong>{type.name}</strong>
                  <small>{type.description || 'Retire uma senha'}</small>
                </span>
                <ArrowRight className="kiosk-service-arrow" size={19} />
              </button>
              <ServiceExtraIconButtons type={type} onOpen={setExtraIconInfo} />
            </div>)}
          </div>
        }

        {!selectedType && !loading && !error && <p className="kiosk-small-print">O atendimento será realizado por ordem de chegada.</p>}
      </>}
    </div>

    <footer className="system-footer no-print">• Senhas do dia reiniciam automaticamente às 00h em São Paulo.</footer>

    {extraIconInfo && <ModalPortal><div className="service-type-modal-overlay kiosk-icon-info-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setExtraIconInfo(null); }}>
      <Surface tone="raised" className="service-type-modal kiosk-icon-info-modal" role="dialog" aria-modal="true" aria-labelledby="kiosk-icon-info-title">
        <Button className="service-type-modal-close" variant="ghost" size="sm" iconOnly type="button" aria-label="Fechar" onClick={() => setExtraIconInfo(null)}><X size={19} /></Button>
        <div className="kiosk-icon-info-body">
          <span className="kiosk-icon-info-symbol"><ServiceTypeIcon name={extraIconInfo.icon} size={46} /></span>
          <span className="ui-eyebrow">INFORMAÇÃO DO ATENDIMENTO</span>
          <h2 id="kiosk-icon-info-title">{extraIconInfo.title}</h2>
          <p>{extraIconInfo.description}</p>
        </div>
        <div className="ui-modal-actions">
          <Button variant="primary" type="button" onClick={() => setExtraIconInfo(null)}>Entendi</Button>
        </div>
      </Surface>
    </div></ModalPortal>}
  </main>;
}

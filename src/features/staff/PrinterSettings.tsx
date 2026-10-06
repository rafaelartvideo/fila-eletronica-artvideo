import { useEffect, useState, type FormEvent } from 'react';
import { Download, KeyRound, Printer, RefreshCw } from 'lucide-react';
import { Button, EmptyState, Notice, SectionHeader, Surface, TextField } from '../../components/ui';
import { getPublicSupabaseConfig } from '../../lib/supabase/client';
import { createPrintAgent, listPrintAgents, type CreatedPrintAgent, type PrintAgent } from '../../lib/supabase/queue-api';

function inPrinterOperatingHours(): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  return hour >= 7 && hour < 20;
}

function agentOnline(lastSeenAt: string | null): boolean {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 45_000);
}

function agentStatus(lastSeenAt: string | null): string {
  if (!inPrinterOperatingHours()) return 'Fora do horário · retoma às 07:00';
  if (agentOnline(lastSeenAt)) return 'Conectado';
  return lastSeenAt ? 'Offline' : 'Ainda não conectado';
}

export function PrinterSettings() {
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [name, setName] = useState('Recepção');
  const [slug, setSlug] = useState('reception');
  const [created, setCreated] = useState<CreatedPrintAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setAgents(await listPrintAgents());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os agentes de impressão.');
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const next = await createPrintAgent(name, slug);
      setCreated(next);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a chave do agente.');
    } finally {
      setBusy(false);
    }
  }

  function downloadConfig() {
    if (!created) return;
    const { url, key } = getPublicSupabaseConfig();
    const config = {
      supabaseUrl: url,
      supabaseKey: key,
      agentSlug: created.slug,
      agentToken: created.token,
      printerName: 'ELGIN i9',
      pollIntervalMs: 1000,
      idlePollIntervalMs: 10000,
      operatingStartHour: 7,
      operatingEndHour: 20,
      feedLines: 13,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'config.json';
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return <section className="settings-panel printer-settings">
    <SectionHeader
      eyebrow="IMPRESSÃO DIRETA"
      title="Agente da impressora"
      description="Conecte a Elgin i9 ao PC da recepção para imprimir senhas diretamente, sem abrir a janela do navegador."
      actions={<>
        <a className="ui-button ui-button--secondary ui-button--md" href="/print-agent/union-fila-print-agent.zip" download><Download size={15} /> <span className="ui-button__label">Baixar agente atualizado</span></a>
        <Button variant="secondary" onClick={() => void refresh()} startIcon={<RefreshCw size={15} />}>Atualizar</Button>
      </>}
    />

    <Notice tone="info" className="printer-update-notice">
      <span><strong>Para aplicar mudanças de impressão no PC:</strong> baixe o agente atualizado, extraia por cima da pasta atual sem apagar o <code>config.json</code> e execute <code>setup.ps1</code>. Depois disso, o setup passa a buscar automaticamente a versão mais recente do agente.</span>
    </Notice>

    {error && <Notice tone="danger">{error}</Notice>}

    <form className="printer-agent-form" onSubmit={generate}>
      <TextField label="Nome do computador" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
      <TextField label="Identificador" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40))} maxLength={40} required />
      <Button variant="primary" type="submit" loading={busy} startIcon={<KeyRound size={16} />}>Gerar nova chave</Button>
    </form>

    {created && <Surface tone="soft" className="printer-key-card">
      <div><strong>Configuração criada</strong><small>A chave abaixo só é exibida agora. Gerar outra chave invalida a anterior desse identificador.</small></div>
      <code>{created.token}</code>
      <Button variant="primary" type="button" onClick={downloadConfig} startIcon={<Download size={16} />}>Baixar config.json</Button>
    </Surface>}

    <div className="settings-list printer-agent-list">
      {agents.map((agent) => <Surface tone="soft" as="article" key={agent.id} className="setting-row">
        <div className={`printer-status-dot ${agentOnline(agent.lastSeenAt) ? 'online' : ''}`}><Printer size={16} /></div>
        <div><strong>{agent.name}</strong><small>{agent.slug} · {agentStatus(agent.lastSeenAt)}</small></div>
      </Surface>)}
      {agents.length === 0 && <EmptyState icon={<Printer size={18} />}>Nenhum agente configurado.</EmptyState>}
    </div>
  </section>;
}

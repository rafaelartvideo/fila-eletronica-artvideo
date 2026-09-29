import { useEffect, useState, type FormEvent } from 'react';
import { Download, KeyRound, Printer, RefreshCw } from 'lucide-react';
import { getPublicSupabaseConfig } from '../../lib/supabase/client';
import { createPrintAgent, listPrintAgents, type CreatedPrintAgent, type PrintAgent } from '../../lib/supabase/queue-api';

function agentOnline(lastSeenAt: string | null): boolean {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 45_000);
}

export function PrinterSettings() {
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [name, setName] = useState('Recepção');
  const [slug, setSlug] = useState('reception');
  const [created, setCreated] = useState<CreatedPrintAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try { setAgents(await listPrintAgents()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os agentes de impressão.'); }
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
      feedLines: 3,
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
    <header><div><span className="section-kicker">IMPRESSÃO DIRETA</span><h2>Agente da impressora</h2><p>Conecte a Elgin i9 ao PC da recepção para imprimir senhas diretamente, sem abrir a janela do navegador.</p></div><button className="subtle-button" onClick={() => void refresh()}><RefreshCw size={15} /> Atualizar</button></header>
    {error && <div role="alert" className="form-error">{error}</div>}
    <form className="printer-agent-form" onSubmit={generate}>
      <label>Nome do computador<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
      <label>Identificador<input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40))} maxLength={40} required /></label>
      <button className="blue-button" disabled={busy}><KeyRound size={16} /> {busy ? 'Gerando…' : 'Gerar nova chave'}</button>
    </form>

    {created && <div className="printer-key-card">
      <div><strong>Configuração criada</strong><small>A chave abaixo só é exibida agora. Gerar outra chave invalida a anterior desse identificador.</small></div>
      <code>{created.token}</code>
      <button className="blue-button" onClick={downloadConfig}><Download size={16} /> Baixar config.json</button>
    </div>}

    <div className="settings-list printer-agent-list">
      {agents.map((agent) => <div key={agent.id} className="setting-row">
        <div className={'printer-status-dot ' + (agentOnline(agent.lastSeenAt) ? 'online' : '')}><Printer size={16} /></div>
        <div><strong>{agent.name}</strong><small>{agent.slug} · {agentOnline(agent.lastSeenAt) ? 'Conectado' : agent.lastSeenAt ? 'Offline' : 'Ainda não conectado'}</small></div>
      </div>)}
      {agents.length === 0 && <div className="printer-empty">Nenhum agente configurado.</div>}
    </div>
  </section>;
}

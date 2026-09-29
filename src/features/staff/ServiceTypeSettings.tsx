import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Power } from 'lucide-react';
import type { TicketType } from '../../domain/queue';
import { listTicketTypes, saveTicketType } from '../../lib/supabase/queue-api';

export function ServiceTypeSettings({ onChanged }: { onChanged: () => void }) {
  const [types, setTypes] = useState<TicketType[]>([]);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() { try { setTypes(await listTicketTypes()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar serviços.'); } }
  useEffect(() => { void refresh(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await saveTicketType({ name, prefix, isActive: true }); setName(''); setPrefix(''); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  async function toggle(type: TicketType) {
    setBusy(true); setError('');
    try { await saveTicketType({ id: type.id, name: type.name, prefix: type.prefix, isActive: !type.isActive }); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.'); }
    finally { setBusy(false); }
  }

  return <section className="settings-panel"><header><div><span className="section-kicker">CONFIGURAÇÕES</span><h2>Tipos de atendimento</h2><p>Organize os serviços e as letras usadas nas senhas.</p></div></header>
    <form className="service-form" onSubmit={submit}>
      <label>Nome do atendimento<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Conserto" required maxLength={80} /></label>
      <label>Prefixo<input value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))} placeholder="C" required maxLength={3} /></label>
      <button className="blue-button" disabled={busy}><Plus size={16} /> Adicionar</button>
    </form>
    {error && <div role="alert" className="form-error">{error}</div>}
    <div className="settings-list">{types.map((type) => <div key={type.id} className="setting-row"><div className={`service-dot ${type.isActive ? 'on' : ''}`}></div><div><strong>{type.name}</strong><small>Prefixo {type.prefix}</small></div><button className="subtle-button" disabled={busy} onClick={() => void toggle(type)}><Power size={15} /> {type.isActive ? 'Desativar' : 'Ativar'}</button></div>)}</div>
  </section>;
}

import { useEffect, useState, type FormEvent } from 'react';
import { Clapperboard, Plus, Trash2 } from 'lucide-react';
import type { MediaItem } from '../../domain/queue';
import { normalizeMediaUrl } from '../../domain/media';
import { deleteDisplayMedia, listDisplayMedia, saveDisplayMedia, subscribeToQueueChanges } from '../../lib/supabase/queue-api';

export function MediaSettings({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() { try { setItems(await listDisplayMedia()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar vídeos.'); } }
  useEffect(() => {
    let active = true;
    void refresh();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['display_media'], () => {
        if (active) void refresh();
      }, (status) => {
        if (active && status === 'SUBSCRIBED') void refresh();
      });
    } catch {
      // Keep the current media list available if Realtime cannot connect.
    }
    return () => { active = false; void channel?.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const source = normalizeMediaUrl(url);
    if (source.kind === 'unsupported') { setError('Informe um link https:// válido de vídeo ou player incorporável.'); setBusy(false); return; }
    try { await saveDisplayMedia({ title: title.trim() || 'Vídeo da loja', url: url.trim(), sortOrder: items.length, isActive: true }); setTitle(''); setUrl(''); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o vídeo.'); }
    finally { setBusy(false); }
  }

  async function remove(item: MediaItem) {
    setBusy(true); setError('');
    try { await deleteDisplayMedia(item.id); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível remover.'); }
    finally { setBusy(false); }
  }

  return <section className="settings-panel"><header><div><span className="section-kicker">TELA DA LOJA</span><h2>Vídeos do display</h2><p>Adicione links do YouTube ou players que aceitem incorporação.</p></div></header>
    <form className="media-form" onSubmit={submit}><label>Nome do vídeo <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Dicas de manutenção" maxLength={120} /></label><label>URL do vídeo ou player<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required /></label><button className="blue-button" disabled={busy}><Plus size={16} /> Adicionar vídeo</button></form>
    {error && <div role="alert" className="form-error">{error}</div>}
    <div className="settings-list">{items.map((item, index) => <div key={item.id} className="setting-row"><div className="media-index"><Clapperboard size={16} /></div><div className="media-row-copy"><strong>{index + 1}. {item.title}</strong><small>{item.url}</small></div><button className="icon-danger" aria-label={`Remover ${item.title}`} disabled={busy} onClick={() => void remove(item)}><Trash2 size={16} /></button></div>)}</div>
  </section>;
}

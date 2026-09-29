import { useEffect, useState, type FormEvent } from 'react';
import { Clapperboard, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import type { MediaItem } from '../../domain/queue';
import { normalizeMediaUrl } from '../../domain/media';
import { deleteDisplayMedia, deleteDisplayNotice, listDisplayMedia, listDisplayNotices, saveDisplayMedia, saveDisplayNotice, subscribeToQueueChanges, type DisplayNotice } from '../../lib/supabase/queue-api';

export function MediaSettings({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [notices, setNotices] = useState<DisplayNotice[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      const [nextItems, nextNotices] = await Promise.all([listDisplayMedia(), listDisplayNotices()]);
      setItems(nextItems);
      setNotices(nextNotices);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o conteúdo do display.');
    }
  }

  useEffect(() => {
    let active = true;
    void refresh();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['display_media'], () => { if (active) void refresh(); }, (status) => {
        if (active && status === 'SUBSCRIBED') void refresh();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, []);

  async function submitNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await saveDisplayNotice(notice, notices.length);
      setNotice('');
      await refresh();
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a frase.'); }
    finally { setBusy(false); }
  }

  async function submitVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const source = normalizeMediaUrl(url);
    if (source.kind === 'unsupported') { setError('Informe um link https:// válido de vídeo ou player incorporável.'); setBusy(false); return; }
    try {
      await saveDisplayMedia({ title: title.trim() || 'Vídeo da loja', url: url.trim(), sortOrder: items.length, isActive: true });
      setTitle(''); setUrl('');
      await refresh();
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o vídeo.'); }
    finally { setBusy(false); }
  }

  async function removeVideo(item: MediaItem) {
    setBusy(true); setError('');
    try { await deleteDisplayMedia(item.id); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível remover o vídeo.'); }
    finally { setBusy(false); }
  }

  async function removeNotice(item: DisplayNotice) {
    setBusy(true); setError('');
    try { await deleteDisplayNotice(item.id); await refresh(); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível remover a frase.'); }
    finally { setBusy(false); }
  }

  return <section className="settings-panel display-content-settings">
    <header><div><span className="section-kicker">TELA DA LOJA</span><h2>Conteúdo do display</h2><p>Gerencie as frases do rodapé e a fila de vídeos exibida aos clientes.</p></div></header>
    {error && <div role="alert" className="form-error">{error}</div>}

    <div className="display-settings-block">
      <div className="settings-subheading"><MessageSquareText size={18} /><div><strong>Frases em movimento</strong><small>As frases aparecem no rodapé do display e atualizam em tempo real.</small></div></div>
      <form className="ticker-form" onSubmit={submitNotice}>
        <label>Nova frase<input value={notice} onChange={(event) => setNotice(event.target.value)} placeholder="Ex.: Aguarde sua senha ser chamada" required maxLength={120} /></label>
        <button className="blue-button" disabled={busy || !notice.trim()}><Plus size={16} /> Adicionar frase</button>
      </form>
      <div className="settings-list">{notices.map((item, index) => <div key={item.id} className="setting-row"><div className="media-index"><MessageSquareText size={16} /></div><div className="media-row-copy"><strong>{index + 1}. {item.text}</strong></div><button className="icon-danger" aria-label={`Remover frase ${item.text}`} disabled={busy} onClick={() => void removeNotice(item)}><Trash2 size={16} /></button></div>)}</div>
    </div>

    <div className="display-settings-block">
      <div className="settings-subheading"><Clapperboard size={18} /><div><strong>Fila de vídeos</strong><small>Você pode adicionar vários vídeos. Ao remover uma URL, ela sai da exibição do display.</small></div></div>
      <form className="media-form" onSubmit={submitVideo}><label>Nome do vídeo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Dicas de manutenção" maxLength={120} /></label><label>URL do vídeo ou player<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required /></label><button className="blue-button" disabled={busy}><Plus size={16} /> Adicionar vídeo</button></form>
      <div className="settings-list">{items.map((item, index) => <div key={item.id} className="setting-row"><div className="media-index"><Clapperboard size={16} /></div><div className="media-row-copy"><strong>{index + 1}. {item.title}</strong><small>{item.url}</small></div><button className="icon-danger" aria-label={`Remover ${item.title}`} disabled={busy} onClick={() => void removeVideo(item)}><Trash2 size={16} /></button></div>)}</div>
    </div>
  </section>;
}

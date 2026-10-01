import { useEffect, useState, type FormEvent } from 'react';
import { Clapperboard, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { Button, Notice, SectionHeader, Surface, TextField } from '../../components/ui';
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
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveDisplayNotice(notice, notices.length);
      setNotice('');
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a frase.');
    } finally {
      setBusy(false);
    }
  }

  async function submitVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const source = normalizeMediaUrl(url);
    if (source.kind === 'unsupported') {
      setError('Informe um link https:// válido de vídeo ou player incorporável.');
      setBusy(false);
      return;
    }
    try {
      await saveDisplayMedia({ title: title.trim() || 'Vídeo da loja', url: url.trim(), sortOrder: items.length, isActive: true });
      setTitle('');
      setUrl('');
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o vídeo.');
    } finally {
      setBusy(false);
    }
  }

  async function removeVideo(item: MediaItem) {
    setBusy(true);
    setError('');
    try {
      await deleteDisplayMedia(item.id);
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o vídeo.');
    } finally {
      setBusy(false);
    }
  }

  async function removeNotice(item: DisplayNotice) {
    setBusy(true);
    setError('');
    try {
      await deleteDisplayNotice(item.id);
      await refresh();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a frase.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="settings-panel display-content-settings">
    <SectionHeader
      eyebrow="TELA DA LOJA"
      title="Conteúdo do display"
      description="Gerencie as frases do rodapé e a fila de vídeos exibida aos clientes."
    />

    {error && <Notice tone="danger">{error}</Notice>}

    <Surface className="display-settings-block">
      <div className="settings-subheading">
        <span className="ui-icon-tile"><MessageSquareText size={18} /></span>
        <div><strong>Frases em movimento</strong><small>As frases aparecem no rodapé do display e atualizam em tempo real.</small></div>
      </div>
      <form className="ticker-form" onSubmit={submitNotice}>
        <TextField
          label="Nova frase"
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          placeholder="Ex.: Aguarde sua senha ser chamada"
          required
          maxLength={120}
        />
        <Button variant="primary" type="submit" disabled={busy || !notice.trim()} startIcon={<Plus size={16} />}>Adicionar frase</Button>
      </form>
      <div className="display-content-list-area">
        <div className="display-content-list-head">
          <strong>Frases cadastradas</strong>
          <span>{notices.length}</span>
        </div>
        <div className="settings-list">
          {notices.map((item, index) => <Surface tone="soft" key={item.id} className="setting-row">
            <div className="media-index"><MessageSquareText size={16} /></div>
            <div className="media-row-copy"><strong>{index + 1}. {item.text}</strong></div>
            <Button variant="danger" size="sm" iconOnly aria-label={`Remover frase ${item.text}`} disabled={busy} onClick={() => void removeNotice(item)}><Trash2 size={16} /></Button>
          </Surface>)}
        </div>
      </div>
    </Surface>

    <Surface className="display-settings-block">
      <div className="settings-subheading">
        <span className="ui-icon-tile"><Clapperboard size={18} /></span>
        <div><strong>Fila de vídeos</strong><small>Você pode adicionar vários vídeos. Ao remover uma URL, ela sai da exibição do display.</small></div>
      </div>
      <form className="media-form" onSubmit={submitVideo}>
        <TextField label="Nome do vídeo" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Dicas de manutenção" maxLength={120} />
        <TextField label="URL do vídeo ou player" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
        <Button variant="primary" type="submit" disabled={busy} startIcon={<Plus size={16} />}>Adicionar vídeo</Button>
      </form>
      <div className="display-content-list-area">
        <div className="display-content-list-head">
          <strong>Vídeos cadastrados</strong>
          <span>{items.length}</span>
        </div>
        <div className="settings-list">
          {items.map((item, index) => <Surface tone="soft" key={item.id} className="setting-row">
            <div className="media-index"><Clapperboard size={16} /></div>
            <div className="media-row-copy"><strong>{index + 1}. {item.title}</strong><small>{item.url}</small></div>
            <Button variant="danger" size="sm" iconOnly aria-label={`Remover ${item.title}`} disabled={busy} onClick={() => void removeVideo(item)}><Trash2 size={16} /></Button>
          </Surface>)}
        </div>
      </div>
    </Surface>
  </section>;
}

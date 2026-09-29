import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { MediaItem } from '../../domain/queue';
import { listDisplayMedia, listDisplayNotices, subscribeToQueueChanges } from '../../lib/supabase/queue-api';
import { CallAnnouncement } from './CallAnnouncement';
import { DisplayEnvironment } from './DisplayEnvironment';
import { MediaPlayer } from './MediaPlayer';
import { useDisplayCalls } from './useDisplayCalls';

const defaultNotices = [
  'AGUARDE SUA SENHA SER CHAMADA',
  'ACOMPANHE A CHAMADA NA TELA',
  'ATENDIMENTO POR ORDEM DE CHEGADA',
  'OBRIGADO PELA PREFERÊNCIA',
];

export function DisplayPage() {
  const { currentCall, recentCalls, connection } = useDisplayCalls();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [notices, setNotices] = useState<string[]>(defaultNotices);

  const refreshContent = useCallback(async () => {
    try {
      const [items, tickerItems] = await Promise.all([listDisplayMedia(), listDisplayNotices()]);
      setMedia(items.filter((item) => item.isActive));
      setNotices(tickerItems.length ? tickerItems.filter((item) => item.isActive).map((item) => item.text) : defaultNotices);
    } catch {
      // Keep the last known content if the connection is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshContent();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['display_media'], () => { if (active) void refreshContent(); }, (status) => {
        if (active && status === 'SUBSCRIBED') void refreshContent();
      });
    } catch {}
    return () => { active = false; void channel?.unsubscribe(); };
  }, [refreshContent]);

  return <main className="public-display">
    <header className="display-topbar">
      <DisplayEnvironment />
      <div className="display-status">
        <span className="display-live"><i /> AO VIVO</span>
        <div className={`display-connection ${connection}`}><Activity size={15} /><span>{connection === 'connected' ? 'Conectado' : connection === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</span></div>
      </div>
    </header>
    <div className="display-content">
      <div className="display-main-grid">
        <MediaPlayer items={media} />
        <div className="display-queue-column">
          <CallAnnouncement call={currentCall} />
          <section className="display-recent">
            <header><h2>Chamadas recentes</h2></header>
            {recentCalls.length
              ? <div className="recent-call-list">{recentCalls.slice(0, 4).map((call) => <div key={call.id} className="recent-call"><strong>{call.ticketNumber}</strong><span>{call.serviceTypeName}</span><small>{call.counterLabel || 'Balcão'}</small></div>)}</div>
              : <div className="recent-empty">As últimas chamadas aparecerão aqui.</div>}
          </section>
        </div>
      </div>
      {notices.length > 0 && <div className="display-ticker" aria-label="Informações para clientes">
        {[0, 1].map((copy) => <div key={copy} className="display-ticker-track" aria-hidden={copy === 1}>
          {notices.map((notice, index) => <span key={`${notice}-${index}`}>{notice}<i /></span>)}
        </div>)}
      </div>}
    </div>
  </main>;
}

import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { MediaItem } from '../../domain/queue';
import { listDisplayMedia, subscribeToQueueChanges } from '../../lib/supabase/queue-api';
import { BrandLogo } from '../../components/BrandLogo';
import { CallAnnouncement } from './CallAnnouncement';
import { MediaPlayer } from './MediaPlayer';
import { useDisplayCalls } from './useDisplayCalls';

const notices = [
  'AGUARDE SUA SENHA SER CHAMADA',
  'ACOMPANHE A CHAMADA NA TELA',
  'ATENDIMENTO POR ORDEM DE CHEGADA',
  'OBRIGADO PELA PREFERÊNCIA',
];

export function DisplayPage() {
  const { currentCall, recentCalls, connection } = useDisplayCalls();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const refreshMedia = useCallback(async () => {
    try {
      const items = await listDisplayMedia();
      setMedia(items.filter((item) => item.isActive));
    } catch {
      // Keep the last known playlist if the connection is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshMedia();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToQueueChanges(['display_media'], () => {
        if (active) void refreshMedia();
      }, (status) => {
        if (active && status === 'SUBSCRIBED') void refreshMedia();
      });
    } catch {
      // The current playlist remains available if Realtime cannot connect.
    }
    return () => { active = false; void channel?.unsubscribe(); };
  }, [refreshMedia]);

  return <main className="public-display">
    <header className="display-topbar">
      <div className="display-brand"><BrandLogo /></div>
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
            <header><div><span className="section-kicker">AGORA HÁ POUCO</span><h2>Chamadas recentes</h2></div></header>
            {recentCalls.length
              ? <div className="recent-call-list">{recentCalls.slice(0, 4).map((call) => <div key={call.id} className="recent-call"><strong>{call.ticketNumber}</strong><span>{call.serviceTypeName}</span><small>{call.counterLabel || 'Balcão'}</small></div>)}</div>
              : <div className="recent-empty">As últimas chamadas aparecerão aqui.</div>}
          </section>
        </div>
      </div>
      <div className="display-ticker" aria-label="Informações para clientes">
        {[0, 1].map((copy) => <div key={copy} className="display-ticker-track" aria-hidden={copy === 1}>
          {notices.map((notice) => <span key={notice}>{notice}<i /></span>)}
        </div>)}
      </div>
    </div>
  </main>;
}

import { useEffect, useState } from 'react';
import { Activity, MonitorPlay, Wrench } from 'lucide-react';
import type { MediaItem } from '../../domain/queue';
import { listDisplayMedia } from '../../lib/supabase/queue-api';
import { CallAnnouncement } from './CallAnnouncement';
import { MediaPlayer } from './MediaPlayer';
import { useDisplayCalls } from './useDisplayCalls';

export function DisplayPage() {
  const { currentCall, recentCalls, connection } = useDisplayCalls();
  const [media, setMedia] = useState<MediaItem[]>([]);
  useEffect(() => { let active = true; void listDisplayMedia().then((items) => { if (active) setMedia(items.filter((item) => item.isActive)); }).catch(() => {}); return () => { active = false; }; }, []);

  return <main className="public-display">
    <header className="display-topbar"><div className="display-brand"><span><Wrench size={18} /></span><div><strong>ELETRÔNICA ARTVIDEO</strong><small>ATENDIMENTO AO CLIENTE</small></div></div><div className={`display-connection ${connection}`}><Activity size={15} /><span>{connection === 'connected' ? 'Conectado' : connection === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</span></div></header>
    <div className="display-content">
      <div className="display-headline"><div><span className="section-kicker">PAINEL DE SENHAS</span><h1>Acompanhe sua chamada</h1></div><span className="display-live"><i /> AO VIVO</span></div>
      <div className="display-main-grid">
        <MediaPlayer items={media} />
        <div className="display-queue-column"><CallAnnouncement call={currentCall} /><section className="display-recent"><header><div><span className="section-kicker">AGORA HÁ POUCO</span><h2>Chamadas recentes</h2></div><MonitorPlay size={19} /></header>{recentCalls.length ? <div className="recent-call-list">{recentCalls.map((call) => <div key={call.id} className="recent-call"><strong>{call.ticketNumber}</strong><span>{call.serviceTypeName}</span><small>{call.counterLabel || 'Balcão'}</small></div>)}</div> : <div className="recent-empty">As últimas chamadas aparecerão aqui.</div>}</section></div>
      </div>
      <footer className="display-footer"><span>Eletrônica Artvideo</span><i /> Por favor, dirija-se ao balcão indicado quando sua senha for chamada.</footer>
    </div>
  </main>;
}

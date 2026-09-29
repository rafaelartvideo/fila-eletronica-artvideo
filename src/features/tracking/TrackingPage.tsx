import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, MapPin, TicketCheck, Volume2 } from 'lucide-react';
import { useParams } from 'react-router';
import type { TicketStatus } from '../../domain/queue';
import { getTicketTracking, type TicketTracking } from '../../lib/supabase/queue-api';

function statusContent(tracking: TicketTracking) {
  if (tracking.status === 'called') return {
    tone: 'called',
    title: 'É a sua vez!',
    text: tracking.counterLabel ? `Dirija-se ao ${tracking.counterLabel}.` : 'Dirija-se ao atendimento.',
  };
  if (tracking.status === 'serving') return { tone: 'serving', title: 'Em atendimento', text: 'Seu atendimento já foi iniciado.' };
  if (tracking.status === 'completed') return { tone: 'completed', title: 'Atendimento concluído', text: 'Seu atendimento foi finalizado.' };
  if (tracking.status === 'cancelled') return { tone: 'cancelled', title: 'Senha cancelada', text: 'Procure nossa equipe se precisar de ajuda.' };
  if (tracking.queueAhead === 0) return { tone: 'near', title: 'Você é o próximo', text: 'Fique atento: sua chamada está próxima.' };
  if (tracking.queueAhead <= 2) return { tone: 'near', title: 'Sua vez está chegando', text: `${tracking.queueAhead} senha${tracking.queueAhead === 1 ? '' : 's'} na sua frente.` };
  return { tone: 'waiting', title: 'Aguarde sua chamada', text: `${tracking.queueAhead} senhas na sua frente.` };
}

export function TrackingPage() {
  const { token = '' } = useParams();
  const [tracking, setTracking] = useState<TicketTracking | null>(null);
  const [error, setError] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const previousStatus = useRef<TicketStatus | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getTicketTracking(token);
      setTracking(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível acompanhar esta senha.');
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [load]);

  function playSound() {
    try {
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      void context.resume();
      const now = context.currentTime;
      [0, .2, .4].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = index === 1 ? 880 : 720;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + offset + .02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + .16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + .18);
      });
    } catch {}
  }

  useEffect(() => {
    if (!tracking) return;
    const becameCalled = tracking.status === 'called' && previousStatus.current !== 'called';
    if (becameCalled) {
      if ('vibrate' in navigator) navigator.vibrate([280, 120, 280, 120, 420]);
      if (alertsEnabled) playSound();
    }
    previousStatus.current = tracking.status;
  }, [tracking, alertsEnabled]);

  async function enableAlerts() {
    setAlertsEnabled(true);
    try {
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      await context.resume();
    } catch {}
    if (tracking?.status === 'called') playSound();
    if ('vibrate' in navigator) navigator.vibrate(100);
  }

  const content = tracking ? statusContent(tracking) : null;

  return <main className="tracking-page">
    <header className="tracking-header">
      <span><TicketCheck size={20} /></span>
      <div><strong>ACOMPANHAMENTO DA FILA</strong><small>Eletrônica Artvideo</small></div>
    </header>

    <section className="tracking-shell">
      {error ? <div className="tracking-error" role="alert">{error}</div> : !tracking || !content ? <div className="tracking-loading">Carregando sua posição…</div> : <>
        <div className={`tracking-status-card ${content.tone}`}>
          <span className="tracking-status-icon">{tracking.status === 'completed' ? <CheckCircle2 size={23} /> : tracking.status === 'called' ? <BellRing size={23} /> : <Clock3 size={23} />}</span>
          <div><small>STATUS DA SUA SENHA</small><h1>{content.title}</h1><p>{content.text}</p></div>
        </div>

        <div className={`tracking-ticket-number ${tracking.status === 'called' ? 'called' : ''}`}>
          <small>SUA SENHA</small>
          <strong>{tracking.ticketNumber}</strong>
          <span>{tracking.serviceTypeName}</span>
        </div>

        {tracking.status === 'waiting' && <div className="tracking-position">
          <span>{tracking.queueAhead}</span>
          <div><strong>{tracking.queueAhead === 1 ? 'senha na sua frente' : 'senhas na sua frente'}</strong><small>A posição considera a prioridade dos atendimentos.</small></div>
        </div>}

        {tracking.status === 'called' && tracking.counterLabel && <div className="tracking-counter"><MapPin size={20} /><div><small>DIRIJA-SE AO</small><strong>{tracking.counterLabel}</strong></div></div>}

        <button className={`tracking-alert-button ${alertsEnabled ? 'enabled' : ''}`} type="button" onClick={() => void enableAlerts()}>
          <Volume2 size={18} /> {alertsEnabled ? 'Alertas de som e vibração ativados' : 'Ativar som e vibração'}
        </button>
        <p className="tracking-alert-hint">Mantenha esta página aberta. A posição é atualizada automaticamente.</p>
      </>}
    </section>
  </main>;
}

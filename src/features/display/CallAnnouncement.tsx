import { useEffect, useRef, useState } from 'react';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { Button } from '../../components/ui';
import type { DisplayCall } from '../../domain/queue';

function speak(call: DisplayCall) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(`Senha ${call.ticketNumber}. ${call.serviceTypeName}. ${call.counterLabel ?? ''}`);
  voice.lang = 'pt-BR';
  voice.rate = 0.9;
  window.speechSynthesis.speak(voice);
}

export function CallAnnouncement({ call }: { call: DisplayCall | null }) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const lastSpoken = useRef('');
  function announce(nextCall: DisplayCall) {
    lastSpoken.current = `${nextCall.id}-${nextCall.calledAt}`;
    speak(nextCall);
  }
  useEffect(() => { if (voiceEnabled && call && lastSpoken.current !== `${call.id}-${call.calledAt}`) announce(call); }, [call?.id, call?.calledAt, voiceEnabled]);

  return <section className="display-callout" aria-live="polite" aria-atomic="true">
    <div className="display-callout-head"><span><Bell size={16} /> SENHA CHAMADA</span>
      <Button className="voice-toggle" variant="ghost" size="sm" onClick={() => { if (voiceEnabled) { window.speechSynthesis?.cancel(); setVoiceEnabled(false); } else { setVoiceEnabled(true); if (call) announce(call); } }} aria-label={voiceEnabled ? 'Desativar voz' : 'Ativar voz'} startIcon={voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}>
        {voiceEnabled ? 'Voz ativada' : 'Ativar voz'}
      </Button>
    </div>
    {call ? <div key={`${call.id}-${call.calledAt}`} className="display-current-call display-current-call-animated"><strong>{call.ticketNumber}</strong><div><span>{call.serviceTypeName}</span><small>{call.counterLabel || 'Dirija-se ao balcão'}</small></div></div> : <div className="display-no-call"><span className="display-pulse" />Aguardando a próxima chamada</div>}
  </section>;
}

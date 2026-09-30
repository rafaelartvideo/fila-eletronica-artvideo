import { useLayoutEffect, useMemo, useState } from 'react';
import { Clapperboard, SkipForward } from 'lucide-react';
import { Button } from '../../components/ui';
import type { MediaItem } from '../../domain/queue';
import { normalizeMediaUrl } from '../../domain/media';

export function MediaPlayer({ items }: { items: MediaItem[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const usable = useMemo(() => items.filter((item) => item.isActive && normalizeMediaUrl(item.url).kind !== 'unsupported' && !failed.includes(item.id)), [items, failed]);
  const current = usable.length ? usable[index % usable.length] : null;
  const source = current ? normalizeMediaUrl(current.url) : null;

  useLayoutEffect(() => { setFailed([]); setIndex(0); }, [items]);

  function advance() {
    if (usable.length > 1) setIndex((value) => (value + 1) % usable.length);
  }
  function failCurrent() {
    if (!current) return;
    setFailed((value) => value.includes(current.id) ? value : [...value, current.id]);
    setIndex(0);
  }

  return <section className="display-media" aria-label="Vídeos da loja">
    <div className="display-media-heading"><span><Clapperboard size={15} /> NA ARTVIDEO</span>{usable.length > 1 && <Button variant="ghost" size="sm" iconOnly aria-label="Próximo vídeo" onClick={advance}><SkipForward size={15} /></Button>}</div>
    <div className="display-media-frame">
      {source?.kind === 'direct-video' && <video key={current?.id} src={source.url} title={current?.title ?? 'Vídeo'} autoPlay playsInline onEnded={advance} onError={failCurrent} />}
      {source?.kind === 'youtube' && <iframe key={current?.id} title={current?.title ?? 'YouTube'} src={`${source.url}?autoplay=1&mute=0&rel=0`} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" onError={failCurrent} />}
      {source?.kind === 'embed' && <iframe key={current?.id} title={current?.title ?? 'Vídeo incorporado'} src={source.url} sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" onError={failCurrent} />}
      {!current && <div className="display-media-empty"><Clapperboard size={28} /><span>{items.length ? 'Nenhum link de vídeo pôde ser exibido.' : 'A fila de atendimento aparece ao lado.'}</span></div>}
    </div>
    {current && <div className="display-media-caption"><strong>{current.title || 'Vídeo da loja'}</strong><small>{usable.length > 1 ? `${index + 1} de ${usable.length}` : 'Vídeo informativo'}</small></div>}
  </section>;
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, SkipForward } from 'lucide-react';
import { Button } from '../../components/ui';
import type { MediaItem } from '../../domain/queue';
import { normalizeMediaUrl } from '../../domain/media';

type YouTubePlayer = {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
  mute: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string;
      height?: string;
      videoId: string;
      playerVars?: {
        autoplay?: number;
        controls?: number;
        rel?: number;
        playsinline?: number;
        origin?: string;
      };
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
        onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayer;
};

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi() {
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;

    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
      else reject(new Error('A API do YouTube não ficou disponível.'));
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        youtubeApiPromise = null;
        reject(new Error('Não foi possível carregar a API do YouTube.'));
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

function YouTubeVideo({
  videoId,
  title,
  repeat,
  onEnded,
  onError,
}: {
  videoId: string;
  title: string;
  repeat: boolean;
  onEnded: () => void;
  onError: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayer | null = null;
    const host = hostRef.current;
    if (!host) return;

    const mountPoint = document.createElement('div');
    mountPoint.style.width = '100%';
    mountPoint.style.height = '100%';
    host.replaceChildren(mountPoint);

    void loadYouTubeApi()
      .then((youtube) => {
        if (disposed) return;

        player = new youtube.Player(mountPoint, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              const iframe = event.target.getIframe();
              iframe.title = title;
              iframe.style.position = 'absolute';
              iframe.style.inset = '0';
              iframe.style.width = '100%';
              iframe.style.height = '100%';
              iframe.style.border = '0';

              event.target.mute();
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (disposed || event.data !== 0) return;

              if (repeat) {
                event.target.seekTo(0, true);
                event.target.playVideo();
                return;
              }

              onEnded();
            },
            onError: () => {
              if (!disposed) onError();
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) onError();
      });

    return () => {
      disposed = true;
      try {
        player?.destroy();
      } catch {
        // The YouTube player may already have disposed its iframe.
      }
      host.replaceChildren();
    };
  }, [videoId, title, repeat, onEnded, onError]);

  return <div
    ref={hostRef}
    className="display-youtube-player"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    aria-label={title}
  />;
}

export function MediaPlayer({ items }: { items: MediaItem[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const usable = useMemo(() => items.filter((item) => item.isActive && normalizeMediaUrl(item.url).kind !== 'unsupported' && !failed.includes(item.id)), [items, failed]);
  const current = usable.length ? usable[index % usable.length] : null;
  const source = current ? normalizeMediaUrl(current.url) : null;

  useLayoutEffect(() => {
    setFailed([]);
    setIndex(0);
  }, [items]);

  const advance = useCallback(() => {
    if (!usable.length) return;
    setIndex((value) => (value + 1) % usable.length);
  }, [usable.length]);

  const failCurrent = useCallback(() => {
    if (!current) return;
    setFailed((value) => value.includes(current.id) ? value : [...value, current.id]);
    setIndex(0);
  }, [current]);

  const youtubeVideoId = source?.kind === 'youtube'
    ? source.url.split('/').filter(Boolean).at(-1) ?? ''
    : '';

  return <section className="display-media" aria-label="Vídeos da loja">
    <div className="display-media-heading"><span><Clapperboard size={15} /> UNION FILA</span>{usable.length > 1 && <Button variant="ghost" size="sm" iconOnly aria-label="Próximo vídeo" onClick={advance}><SkipForward size={15} /></Button>}</div>
    <div className="display-media-frame">
      {source?.kind === 'direct-video' && <video key={current?.id} src={source.url} title={current?.title ?? 'Vídeo'} autoPlay muted playsInline loop={usable.length === 1} onEnded={usable.length > 1 ? advance : undefined} onError={failCurrent} />}
      {source?.kind === 'youtube' && youtubeVideoId && <YouTubeVideo key={current?.id} videoId={youtubeVideoId} title={current?.title ?? 'YouTube'} repeat={usable.length === 1} onEnded={advance} onError={failCurrent} />}
      {source?.kind === 'embed' && <iframe key={current?.id} title={current?.title ?? 'Vídeo incorporado'} src={source.url} sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" onError={failCurrent} />}
      {!current && <div className="display-media-empty"><Clapperboard size={28} /><span>{items.length ? 'Nenhum link de vídeo pôde ser exibido.' : 'A fila de atendimento aparece ao lado.'}</span></div>}
    </div>
    {current && <div className="display-media-caption"><strong>{current.title || 'Vídeo da loja'}</strong><small>{usable.length > 1 ? `${(index % usable.length) + 1} de ${usable.length}` : 'Vídeo informativo'}</small></div>}
  </section>;
}

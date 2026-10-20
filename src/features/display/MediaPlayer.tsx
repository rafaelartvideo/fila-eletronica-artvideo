import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, SkipForward } from 'lucide-react';
import { Button } from '../../components/ui';
import type { MediaItem } from '../../domain/queue';
import { normalizeMediaUrl } from '../../domain/media';
import { useSynchronizedPlayback } from './useSynchronizedPlayback';

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
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

type SeekTarget = { mediaId: string; seconds: number; nonce: number };

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
  seek,
  onTime,
  onEnded,
  onError,
}: {
  videoId: string;
  title: string;
  repeat: boolean;
  seek: SeekTarget | null;
  onTime: (seconds: number) => void;
  onEnded: () => void;
  onError: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const seekRef = useRef(seek);
  const callbacksRef = useRef({ onTime, onEnded, onError });
  callbacksRef.current = { onTime, onEnded, onError };

  useEffect(() => {
    seekRef.current = seek;
    if (seek && playerRef.current) {
      playerRef.current.seekTo(seek.seconds, true);
      playerRef.current.playVideo();
    }
  }, [seek]);

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
              playerRef.current = event.target;
              const iframe = event.target.getIframe();
              iframe.title = title;
              iframe.style.position = 'absolute';
              iframe.style.inset = '0';
              iframe.style.width = '100%';
              iframe.style.height = '100%';
              iframe.style.border = '0';

              event.target.mute();
              if (seekRef.current) event.target.seekTo(seekRef.current.seconds, true);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (disposed || event.data !== 0) return;

              if (repeat) {
                event.target.seekTo(0, true);
                event.target.playVideo();
                return;
              }

              callbacksRef.current.onEnded();
            },
            onError: () => {
              if (!disposed) callbacksRef.current.onError();
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) callbacksRef.current.onError();
      });

    const progressTimer = window.setInterval(() => {
      if (!playerRef.current || disposed) return;
      const seconds = playerRef.current.getCurrentTime();
      if (Number.isFinite(seconds)) callbacksRef.current.onTime(seconds);
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(progressTimer);
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The YouTube player may already have disposed its iframe.
      }
      host.replaceChildren();
    };
  }, [videoId, title, repeat]);

  return <div
    ref={hostRef}
    className="display-youtube-player"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    aria-label={title}
  />;
}

export function MediaPlayer({ items }: { items: MediaItem[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seekTarget, setSeekTarget] = useState<SeekTarget | null>(null);
  const directRef = useRef<HTMLVideoElement>(null);
  const youtubeTimeRef = useRef(0);

  const playable = useMemo(
    () => items.filter((item) => item.isActive && normalizeMediaUrl(item.url).kind !== 'unsupported' && !failed.includes(item.id)),
    [items, failed],
  );
  const current = playable.find((item) => item.id === selectedId) ?? playable[0] ?? null;
  const source = current ? normalizeMediaUrl(current.url) : null;
  const mediaIds = useMemo(() => playable.map((item) => item.id), [playable]);

  // Refreshing the same playlist must not rewind a screen to its first video.
  const playlistSignature = items.map((item) => `${item.id}:${item.url}:${item.isActive}:${item.sortOrder}`).join('|');
  useEffect(() => setFailed([]), [playlistSignature]);

  const currentRef = useRef(current?.id ?? null);
  const playableIdsRef = useRef(mediaIds);
  currentRef.current = current?.id ?? null;
  playableIdsRef.current = mediaIds;

  const advance = useCallback(() => {
    const ids = playableIdsRef.current;
    if (!ids.length) return;
    const position = ids.indexOf(currentRef.current ?? '');
    const nextId = ids[(position + 1) % ids.length];
    youtubeTimeRef.current = 0;
    setSeekTarget(null);
    setSelectedId(nextId);
  }, []);

  const getSeconds = useCallback(() => {
    const seconds = directRef.current?.currentTime ?? youtubeTimeRef.current;
    return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  }, []);

  const applyRemoteState = useCallback((mediaId: string, seconds: number) => {
    if (!playableIdsRef.current.includes(mediaId)) return;
    const changingVideo = currentRef.current !== mediaId;
    // Occasional modest drift is normal with separately buffered players.
    // Correct only meaningful drift to avoid repeated visible seeking.
    if (!changingVideo && Math.abs(getSeconds() - seconds) < 1.7) return;
    if (changingVideo) {
      youtubeTimeRef.current = seconds;
      setSelectedId(mediaId);
    }
    setSeekTarget({ mediaId, seconds, nonce: Date.now() + Math.random() });
  }, [getSeconds]);

  const { isFollower, sendState, requestNext } = useSynchronizedPlayback({
    mediaIds,
    currentId: current?.id ?? null,
    getSeconds,
    onRemoteState: applyRemoteState,
    onNext: advance,
  });

  useEffect(() => {
    // Send the new track immediately, rather than waiting for a heartbeat.
    sendState();
  }, [current?.id, sendState]);

  useEffect(() => {
    if (!seekTarget || seekTarget.mediaId !== current?.id || source?.kind !== 'direct-video') return;
    const video = directRef.current;
    if (!video) return;
    const seek = () => {
      const maximum = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.2) : seekTarget.seconds;
      video.currentTime = Math.min(seekTarget.seconds, maximum);
      void video.play().catch(() => {});
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [seekTarget, current?.id, source?.kind]);

  const failCurrent = useCallback(() => {
    const id = currentRef.current;
    if (!id) return;
    // A broken link is skipped only in the affected browser. The other
    // displays keep the active common playback timeline.
    setFailed((value) => value.includes(id) ? value : [...value, id]);
    advance();
  }, [advance]);

  const onEnded = useCallback(() => {
    if (!isFollower()) advance();
  }, [advance, isFollower]);

  const youtubeVideoId = source?.kind === 'youtube'
    ? source.url.split('/').filter(Boolean).at(-1) ?? ''
    : '';

  return <section className="display-media" aria-label="Vídeos da loja">
    <div className="display-media-heading"><span><Clapperboard size={15} /> UNION FILA</span>{playable.length > 1 && <Button variant="ghost" size="sm" iconOnly aria-label="Próximo vídeo" onClick={requestNext}><SkipForward size={15} /></Button>}</div>
    <div className="display-media-frame">
      {source?.kind === 'direct-video' && <video ref={directRef} key={current?.id} src={source.url} title={current?.title ?? 'Vídeo'} autoPlay muted playsInline loop={playable.length === 1} onTimeUpdate={() => {}} onEnded={playable.length > 1 ? onEnded : undefined} onError={failCurrent} />}
      {source?.kind === 'youtube' && youtubeVideoId && <YouTubeVideo key={current?.id} videoId={youtubeVideoId} title={current?.title ?? 'YouTube'} repeat={playable.length === 1} seek={seekTarget?.mediaId === current?.id ? seekTarget : null} onTime={(seconds) => { youtubeTimeRef.current = seconds; }} onEnded={onEnded} onError={failCurrent} />}
      {source?.kind === 'embed' && <iframe key={current?.id} title={current?.title ?? 'Vídeo incorporado'} src={source.url} sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" onError={failCurrent} />}
      {!current && <div className="display-media-empty"><Clapperboard size={28} /><span>{items.length ? 'Nenhum link de vídeo pôde ser exibido.' : 'A fila de atendimento aparece ao lado.'}</span></div>}
    </div>
    {current && <div className="display-media-caption"><strong>{current.title || 'Vídeo da loja'}</strong><small>{playable.length > 1 ? `${playable.findIndex((item) => item.id === current.id) + 1} de ${playable.length}` : 'Vídeo informativo'}</small></div>}
  </section>;
}

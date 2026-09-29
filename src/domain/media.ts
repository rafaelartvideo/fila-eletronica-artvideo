import type { MediaSource } from './media-types';

const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

const youtubeIdPattern = /^[\w-]{11}$/;
const videoExtensions = /\.(mp4|m4v|webm|ogv|ogg)$/i;

function unsupported(reason: string): MediaSource {
  return { kind: 'unsupported', url: '', reason };
}

function extractYoutubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  let candidate = '';

  if (host === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else {
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v') ?? '';
    } else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) {
      candidate = parts[1] ?? '';
    }
  }

  return youtubeIdPattern.test(candidate) ? candidate : null;
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipv4 = host.split('.').map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return host.includes(':') && (
      host === '::'
      || host === '::1'
      || host.startsWith('::ffff:')
      || host.startsWith('fc')
      || host.startsWith('fd')
      || host.startsWith('fe80:')
    );
  }

  return ipv4[0] === 10
    || ipv4[0] === 127
    || (ipv4[0] === 169 && ipv4[1] === 254)
    || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
    || (ipv4[0] === 192 && ipv4[1] === 168)
    || (ipv4[0] === 0);
}

export function normalizeMediaUrl(input: string): MediaSource {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return unsupported('invalid-url');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return unsupported('unsupported-protocol');
  if (parsed.username || parsed.password || isLocalHost(parsed.hostname)) return unsupported('unsafe-host');

  const host = parsed.hostname.toLowerCase();
  if (youtubeHosts.has(host)) {
    const videoId = extractYoutubeId(parsed);
    if (!videoId) return unsupported('invalid-youtube-url');
    return {
      kind: 'youtube',
      url: `https://www.youtube-nocookie.com/embed/${videoId}`,
    };
  }

  if (videoExtensions.test(parsed.pathname)) {
    return { kind: 'direct-video', url: parsed.toString() };
  }

  return { kind: 'embed', url: parsed.toString() };
}

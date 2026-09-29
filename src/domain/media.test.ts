import { describe, expect, it } from 'vitest';
import { normalizeMediaUrl } from './media';

describe('normalizeMediaUrl', () => {
  it('converts a YouTube watch URL to a privacy-enhanced embed', () => {
    expect(normalizeMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('converts a YouTube short URL to an embed', () => {
    expect(normalizeMediaUrl('https://youtu.be/dQw4w9WgXcQ?t=3')).toEqual({
      kind: 'youtube',
      url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('recognizes direct video files while preserving their query string', () => {
    expect(normalizeMediaUrl('https://media.example.com/loop.mp4?token=abc')).toEqual({
      kind: 'direct-video',
      url: 'https://media.example.com/loop.mp4?token=abc',
    });
  });

  it('accepts a regular HTTPS player URL for sandboxed embedding', () => {
    expect(normalizeMediaUrl('https://player.vimeo.com/video/123456')).toEqual({
      kind: 'embed',
      url: 'https://player.vimeo.com/video/123456',
    });
  });

  it.each([
    'not a URL',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://media.example.com/video.mp4',
    'http://127.0.0.1/video.mp4',
    'http://[::ffff:7f00:1]/video.mp4',
  ])('rejects unsafe or invalid media URL %s', (input) => {
    expect(normalizeMediaUrl(input).kind).toBe('unsupported');
  });
});

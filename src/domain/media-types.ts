export type MediaSource =
  | { kind: 'youtube'; url: string }
  | { kind: 'direct-video'; url: string }
  | { kind: 'embed'; url: string }
  | { kind: 'unsupported'; url: ''; reason: string };

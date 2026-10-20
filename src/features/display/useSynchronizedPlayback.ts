import { useCallback, useEffect, useRef } from 'react';
import { requireSupabase } from '../../lib/supabase/client';

type PlaybackRole = 'searching' | 'leader' | 'follower';

type PlaybackState = {
  clientId: string;
  joinedAt: number;
  mediaId: string;
  seconds: number;
};

type PlaybackSyncOptions = {
  mediaIds: string[];
  currentId: string | null;
  getSeconds: () => number;
  onRemoteState: (mediaId: string, seconds: number) => void;
  onNext: () => void;
};

const PLAYBACK_CHANNEL = 'fila-display-playback-v1';
const PUBLISH_INTERVAL_MS = 4_000;
const LEADER_TIMEOUT_MS = 12_000;
const DISCOVERY_MS = 1_500;

function newClientId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * All displays play the same playlist. The first active display is the clock
 * source; newcomers ask for its actual player position and seek to that time.
 * A new source is elected if that display disconnects.
 *
 * This only broadcasts playback coordinates, never tickets or customer data.
 * No new database table, polling query, or privileged credentials are needed.
 */
export function useSynchronizedPlayback(options: PlaybackSyncOptions) {
  const latest = useRef(options);
  latest.current = options;

  const identity = useRef<{ clientId: string; joinedAt: number } | null>(null);
  if (!identity.current) {
    identity.current = { clientId: newClientId(), joinedAt: Date.now() };
  }
  const localIdentity = identity.current;

  const channelRef = useRef<ReturnType<ReturnType<typeof requireSupabase>['channel']> | null>(null);
  const roleRef = useRef<PlaybackRole>('searching');
  const leaderIdRef = useRef<string | null>(null);
  const lastLeaderMessageRef = useRef(0);
  const discoveringSinceRef = useRef(0);
  const lastPublishRef = useRef(0);
  const subscribedRef = useRef(false);

  const sendState = useCallback(() => {
    if (!subscribedRef.current || roleRef.current !== 'leader') return;
    const { currentId, getSeconds } = latest.current;
    const channel = channelRef.current;
    if (!channel || !currentId) return;
    const seconds = getSeconds();
    const payload: PlaybackState = {
      ...localIdentity,
      mediaId: currentId,
      seconds: Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
    };
    lastPublishRef.current = performance.now();
    void channel.send({ type: 'broadcast', event: 'state', payload });
  }, [localIdentity]);

  const requestNext = useCallback(() => {
    if (roleRef.current === 'follower' && subscribedRef.current && channelRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'next',
        payload: { clientId: localIdentity.clientId },
      });
      return;
    }
    latest.current.onNext();
  }, [localIdentity.clientId]);

  const isFollower = useCallback(() => roleRef.current === 'follower', []);

  useEffect(() => {
    let client: ReturnType<typeof requireSupabase>;
    try {
      client = requireSupabase();
    } catch {
      // The display continues locally when Supabase is not configured.
      roleRef.current = 'leader';
      return;
    }

    const channel = client.channel(PLAYBACK_CHANNEL, { config: { broadcast: { ack: false } } });
    channelRef.current = channel;
    roleRef.current = 'searching';
    discoveringSinceRef.current = performance.now();

    const announceRequest = () => {
      void channel.send({
        type: 'broadcast',
        event: 'request',
        payload: { clientId: localIdentity.clientId },
      });
    };

    channel
      .on('broadcast', { event: 'request' }, (message) => {
        const sender = (message.payload as { clientId?: unknown } | undefined)?.clientId;
        if (sender === localIdentity.clientId) return;
        if (roleRef.current === 'leader') sendState();
      })
      .on('broadcast', { event: 'state' }, (message) => {
        const state = message.payload as Partial<PlaybackState> | undefined;
        if (
          !state || typeof state.clientId !== 'string'
          || typeof state.joinedAt !== 'number' || !Number.isFinite(state.joinedAt)
          || typeof state.mediaId !== 'string'
          || typeof state.seconds !== 'number' || !Number.isFinite(state.seconds)
          || state.seconds < 0 || state.seconds > 86_400
          || state.clientId === localIdentity.clientId
        ) return;

        const now = performance.now();
        if (roleRef.current === 'leader') {
          // Only arbitrate when two displays happened to start simultaneously.
          // An established leader is never replaced merely by a late joiner.
          const remoteIsEarlier = state.joinedAt < localIdentity.joinedAt
            || (state.joinedAt === localIdentity.joinedAt && state.clientId < localIdentity.clientId);
          if (!remoteIsEarlier) return;
        } else if (
          roleRef.current === 'follower'
          && leaderIdRef.current !== state.clientId
          && now - lastLeaderMessageRef.current < LEADER_TIMEOUT_MS
        ) {
          return;
        }

        roleRef.current = 'follower';
        leaderIdRef.current = state.clientId;
        lastLeaderMessageRef.current = now;
        if (latest.current.mediaIds.includes(state.mediaId)) {
          latest.current.onRemoteState(state.mediaId, state.seconds);
        }
      })
      .on('broadcast', { event: 'next' }, (message) => {
        if (roleRef.current !== 'leader') return;
        if ((message.payload as { clientId?: unknown } | undefined)?.clientId === localIdentity.clientId) return;
        latest.current.onNext();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true;
          roleRef.current = 'searching';
          leaderIdRef.current = null;
          discoveringSinceRef.current = performance.now();
          announceRequest();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          subscribedRef.current = false;
        }
      });

    const timer = window.setInterval(() => {
      if (!subscribedRef.current) return;
      const now = performance.now();
      if (roleRef.current === 'searching' && now - discoveringSinceRef.current >= DISCOVERY_MS) {
        roleRef.current = 'leader';
        leaderIdRef.current = localIdentity.clientId;
        sendState();
      } else if (roleRef.current === 'follower' && now - lastLeaderMessageRef.current > LEADER_TIMEOUT_MS) {
        // Preserve the currently visible track/position when the source leaves.
        roleRef.current = 'leader';
        leaderIdRef.current = localIdentity.clientId;
        sendState();
      } else if (roleRef.current === 'leader' && now - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
        sendState();
      }
    }, 500);

    return () => {
      window.clearInterval(timer);
      subscribedRef.current = false;
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [localIdentity, sendState]);

  const mediaSignature = options.mediaIds.join('|');
  useEffect(() => {
    if (!subscribedRef.current || !options.mediaIds.length) return;
    // Media may have loaded after the initial request. Ask again without
    // disrupting the established screen.
    if (roleRef.current === 'follower' || roleRef.current === 'searching') {
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'request',
        payload: { clientId: localIdentity.clientId },
      });
    } else {
      sendState();
    }
  }, [mediaSignature, localIdentity.clientId, sendState]);

  return { isFollower, sendState, requestNext };
}

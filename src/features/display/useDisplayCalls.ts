import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayCall } from '../../domain/queue';
import { listDisplayCalls, subscribeToDisplayCalls } from '../../lib/supabase/queue-api';

type Connection = 'connecting' | 'connected' | 'reconnecting';

export function useDisplayCalls(): { currentCall: DisplayCall | null; recentCalls: DisplayCall[]; connection: Connection } {
  const [calls, setCalls] = useState<DisplayCall[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const hasConnected = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const rows = await listDisplayCalls(30);
      const uniqueCalls = rows.filter((call, index, all) =>
        all.findIndex((candidate) => candidate.ticketNumber === call.ticketNumber) === index,
      );
      if (alive.current) setCalls(uniqueCalls.slice(0, 5));
    } catch {
      if (alive.current) setConnection('reconnecting');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    let channel: { unsubscribe: () => Promise<unknown> | unknown } | undefined;
    try {
      channel = subscribeToDisplayCalls(() => void refresh(), (status) => {
        if (!alive.current) return;
        if (status === 'SUBSCRIBED') {
          hasConnected.current = true;
          setConnection('connected');
          // Refresh after the first subscription too: a call can be created
          // after the initial fetch but before Realtime is ready.
          void refresh();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnection('reconnecting');
      });
    } catch { setConnection('reconnecting'); }
    return () => { alive.current = false; void channel?.unsubscribe(); };
  }, [refresh]);

  return { currentCall: calls[0] ?? null, recentCalls: calls.slice(1, 5), connection };
}

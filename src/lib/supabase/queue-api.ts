import type { RealtimeChannel } from '@supabase/supabase-js';
import type { DisplayCall, MediaItem, QueueTicket, TicketStatus, TicketType } from '../../domain/queue';
import { requireSupabase } from './client';

type QueueRow = {
  id: string; business_date: string; service_type_id: string; sequence_number: number;
  ticket_number: string; customer_name: string | null; status: TicketStatus; counter_label: string | null;
  created_at: string; called_at: string | null; started_at: string | null; completed_at: string | null;
  cancelled_at: string | null; ticket_types?: { name: string } | null;
};
type ApiRow = Record<string, unknown>;
export type QueueRealtimeResource = 'tickets' | 'ticket_types' | 'display_media';
export type DisplayNotice = { id: string; text: string; sortOrder: number; isActive: boolean };
export type PrintAgent = { id: string; slug: string; name: string; isActive: boolean; createdAt: string; lastSeenAt: string | null };
export type CreatedPrintAgent = PrintAgent & { token: string };
export type PrintJobStatus = 'pending' | 'processing' | 'printed' | 'error';

const displayNoticeUrlPrefix = 'https://ticker.artvideo.local/';

const queueSyncTopic = 'queue-system-sync';
const tableByResource: Record<QueueRealtimeResource, string> = {
  tickets: 'tickets',
  ticket_types: 'ticket_types',
  display_media: 'display_media',
};

let queueBroadcastChannel: RealtimeChannel | null = null;
let queueBroadcastStatus = 'CLOSED';
const queueBroadcastListeners = new Set<(resource: QueueRealtimeResource) => void>();
const queueStatusListeners = new Set<(status: string) => void>();

function ensureQueueBroadcastChannel(): RealtimeChannel {
  if (queueBroadcastChannel) return queueBroadcastChannel;

  const channel = requireSupabase()
    .channel(queueSyncTopic, { config: { broadcast: { ack: true } } })
    .on('broadcast', { event: 'changed' }, (message) => {
      const resource = (message.payload as { resource?: unknown } | undefined)?.resource;
      if (typeof resource !== 'string' || !(resource in tableByResource)) return;
      queueBroadcastListeners.forEach((listener) => listener(resource as QueueRealtimeResource));
    });

  queueBroadcastChannel = channel;
  channel.subscribe((status) => {
    queueBroadcastStatus = status;
    queueStatusListeners.forEach((listener) => listener(status));
  });

  return channel;
}

function waitForQueueBroadcast(): Promise<void> {
  if (queueBroadcastStatus === 'SUBSCRIBED') return Promise.resolve();

  ensureQueueBroadcastChannel();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      queueStatusListeners.delete(handleStatus);
      reject(new Error('Realtime connection timeout'));
    }, 5_000);

    function handleStatus(status: string) {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timeout);
        queueStatusListeners.delete(handleStatus);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.clearTimeout(timeout);
        queueStatusListeners.delete(handleStatus);
        reject(new Error('Realtime connection failed'));
      }
    }

    queueStatusListeners.add(handleStatus);
  });
}

async function broadcastQueueChange(resource: QueueRealtimeResource): Promise<void> {
  try {
    const channel = ensureQueueBroadcastChannel();
    await waitForQueueBroadcast();
    await channel.send({ type: 'broadcast', event: 'changed', payload: { resource } });
  } catch {
    // Postgres Changes and manual refresh remain available as fallbacks.
  }
}

function announceQueueChange(resource: QueueRealtimeResource): void {
  void broadcastQueueChange(resource);
}

export function subscribeToQueueChanges(
  resources: QueueRealtimeResource[],
  onChange: (resource: QueueRealtimeResource) => void,
  onStatus: (status: string) => void = () => {},
) {
  const client = requireSupabase();
  ensureQueueBroadcastChannel();

  const broadcastListener = (resource: QueueRealtimeResource) => {
    if (resources.includes(resource)) onChange(resource);
  };
  queueBroadcastListeners.add(broadcastListener);
  queueStatusListeners.add(onStatus);
  if (queueBroadcastStatus !== 'CLOSED') queueMicrotask(() => onStatus(queueBroadcastStatus));

  const uniqueResources = [...new Set(resources)];
  let dbChannel = client.channel(`${queueSyncTopic}-db-${uniqueResources.join('-')}-${Math.random().toString(36).slice(2)}`);
  uniqueResources.forEach((resource) => {
    dbChannel = dbChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableByResource[resource] },
      () => onChange(resource),
    );
  });
  dbChannel.subscribe();

  return {
    unsubscribe: async () => {
      queueBroadcastListeners.delete(broadcastListener);
      queueStatusListeners.delete(onStatus);
      await client.removeChannel(dbChannel);
    },
  };
}

function explainError(message: string): string {
  if (/no waiting tickets/i.test(message)) return 'Não há senhas aguardando na fila.';
  if (/active service type not found/i.test(message)) return 'Esse tipo de atendimento está inativo ou não existe.';
  if (/invalid ticket status transition/i.test(message)) return 'Essa mudança de status não é permitida.';
  if (/admin access required|permission denied/i.test(message)) return 'Sua conta não tem acesso ao painel da equipe.';
  if (/authentication required|jwt/i.test(message)) return 'Sua sessão expirou. Entre novamente para continuar.';
  return `Não foi possível concluir a operação. ${message}`;
}

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(explainError(error.message));
  if (data === null) throw new Error('O banco não retornou os dados esperados. Tente novamente.');
  return data;
}

function formatTicketNumber(value: string): string {
  const normalized = value.trim();
  if (normalized.includes('-')) return normalized;
  return normalized.replace(/^([A-Z]+)(\d+)$/i, '$1-$2');
}

function mapTicket(row: QueueRow, serviceTypeName = row.ticket_types?.name ?? ''): QueueTicket {
  return {
    id: row.id, ticketNumber: formatTicketNumber(row.ticket_number), sequenceNumber: row.sequence_number,
    businessDate: row.business_date, serviceTypeId: row.service_type_id, serviceTypeName,
    customerName: row.customer_name, status: row.status, counterLabel: row.counter_label,
    createdAt: row.created_at, calledAt: row.called_at, servingAt: row.started_at,
    completedAt: row.completed_at, cancelledAt: row.cancelled_at,
  };
}

function mapDisplayCall(row: ApiRow): DisplayCall {
  return { id: String(row.id), ticketNumber: formatTicketNumber(String(row.ticket_number)), serviceTypeName: String(row.service_type_name), counterLabel: row.counter_label ? String(row.counter_label) : null, calledAt: String(row.called_at) };
}

export async function issueTicket(input: { typeId: string; customerName?: string | null }): Promise<QueueTicket> {
  const client = requireSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(explainError(sessionError.message));
  if (!session) {
    const { error: signInError } = await client.auth.signInAnonymously();
    if (signInError) throw new Error(explainError(signInError.message));
  }
  const { data, error } = await client.rpc('issue_ticket', {
    p_type_id: input.typeId, p_customer_name: input.customerName?.trim() || null,
  });
  const row = unwrap((data as ApiRow[] | null)?.[0] ?? null, error);
  const ticket = mapTicket({ ...row, customer_name: null, ticket_types: { name: String(row.service_type_name) } } as unknown as QueueRow);
  announceQueueChange('tickets');
  return ticket;
}

export async function callNextTicket(counterLabel = 'Balcão 1'): Promise<DisplayCall> {
  const { data, error } = await requireSupabase().rpc('call_next_waiting_ticket', { p_counter_label: counterLabel.trim() || null });
  const call = mapDisplayCall(unwrap((data as ApiRow[] | null)?.[0] ?? null, error));
  announceQueueChange('tickets');
  return call;
}

export async function repeatTicketCall(ticketId: string): Promise<DisplayCall> {
  const { data, error } = await requireSupabase().rpc('repeat_ticket_call', { p_ticket_id: ticketId });
  const call = mapDisplayCall(unwrap((data as ApiRow[] | null)?.[0] ?? null, error));
  announceQueueChange('tickets');
  return call;
}

export async function transitionTicket(ticketId: string, toStatus: Extract<TicketStatus, 'serving' | 'completed' | 'cancelled'>): Promise<QueueTicket> {
  const { data, error } = await requireSupabase().rpc('transition_ticket', { p_ticket_id: ticketId, p_to_status: toStatus });
  const row = unwrap((data as ApiRow[] | null)?.[0] ?? null, error);
  const ticket = mapTicket({ ...row, ticket_types: { name: String(row.service_type_name) } } as unknown as QueueRow);
  announceQueueChange('tickets');
  return ticket;
}

export async function listTicketTypes(): Promise<TicketType[]> {
  const { data, error } = await requireSupabase().from('ticket_types').select('id,name,prefix,is_active,sort_order').order('sort_order').order('name');
  return (unwrap(data, error) as ApiRow[]).map((row) => ({ id: String(row.id), name: String(row.name), prefix: String(row.prefix), isActive: Boolean(row.is_active), sortOrder: Number(row.sort_order) }));
}

export async function listQueueTickets(businessDate: string): Promise<QueueTicket[]> {
  const { data, error } = await requireSupabase().from('tickets').select('*, ticket_types(name)').eq('business_date', businessDate).order('created_at', { ascending: true });
  return (unwrap(data, error) as unknown as QueueRow[]).map((row) => mapTicket(row));
}

export async function isQueueAdmin(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('is_queue_admin');
  return Boolean(unwrap(data as boolean | null, error));
}

export async function saveTicketType(input: { id?: string; name: string; prefix: string; isActive: boolean }): Promise<void> {
  const client = requireSupabase();
  const row = { name: input.name.trim(), prefix: input.prefix.trim().toUpperCase(), is_active: input.isActive };
  const query = input.id
    ? client.from('ticket_types').update(row).eq('id', input.id)
    : client.from('ticket_types').insert(row);
  const { error } = await query;
  if (error) throw new Error(explainError(error.message));
  announceQueueChange('ticket_types');
}

export async function saveDisplayMedia(input: { id?: string; title: string; url: string; sortOrder: number; isActive: boolean }): Promise<void> {
  const client = requireSupabase();
  const row = { title: input.title.trim(), url: input.url.trim(), sort_order: input.sortOrder, is_active: input.isActive };
  const query = input.id ? client.from('display_media').update(row).eq('id', input.id) : client.from('display_media').insert(row);
  const { error } = await query;
  if (error) throw new Error(explainError(error.message));
  announceQueueChange('display_media');
}

async function listDisplayContentRows(): Promise<ApiRow[]> {
  const { data, error } = await requireSupabase().from('display_media').select('id,title,url,sort_order,is_active').order('sort_order');
  return unwrap(data, error) as ApiRow[];
}

export async function listDisplayMedia(): Promise<MediaItem[]> {
  return (await listDisplayContentRows())
    .filter((row) => !String(row.url).startsWith(displayNoticeUrlPrefix))
    .map((row) => ({ id: String(row.id), title: String(row.title), url: String(row.url), sortOrder: Number(row.sort_order), isActive: Boolean(row.is_active) }));
}

export async function listDisplayNotices(): Promise<DisplayNotice[]> {
  return (await listDisplayContentRows())
    .filter((row) => String(row.url).startsWith(displayNoticeUrlPrefix))
    .map((row) => ({ id: String(row.id), text: String(row.title), sortOrder: Number(row.sort_order), isActive: Boolean(row.is_active) }));
}

export async function saveDisplayNotice(text: string, sortOrder: number): Promise<void> {
  const normalized = text.trim();
  if (!normalized) throw new Error('Informe uma frase para o display.');
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { error } = await requireSupabase().from('display_media').insert({
    title: normalized,
    url: `${displayNoticeUrlPrefix}${suffix}`,
    sort_order: sortOrder,
    is_active: true,
  });
  if (error) throw new Error(explainError(error.message));
  announceQueueChange('display_media');
}

export async function deleteDisplayNotice(id: string): Promise<void> {
  await deleteDisplayMedia(id);
}

export async function deleteDisplayMedia(id: string): Promise<void> {
  const { error } = await requireSupabase().from('display_media').delete().eq('id', id);
  if (error) throw new Error(explainError(error.message));
  announceQueueChange('display_media');
}

export async function listDisplayCalls(limit = 6): Promise<DisplayCall[]> {
  const { data, error } = await requireSupabase().from('display_calls').select('id,ticket_number,service_type_name,counter_label,called_at').order('called_at', { ascending: false }).limit(limit);
  return (unwrap(data, error) as ApiRow[]).map(mapDisplayCall);
}

export function subscribeToDisplayCalls(onChange: () => void, onStatus: (status: string) => void) {
  return requireSupabase().channel('public-display-calls')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'display_calls' }, onChange)
    .subscribe((status) => onStatus(status));
}


function mapPrintAgent(row: ApiRow): PrintAgent {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
  };
}

export async function listPrintAgents(): Promise<PrintAgent[]> {
  const { data, error } = await requireSupabase().rpc('list_print_agents');
  return (unwrap(data as ApiRow[] | null, error) as ApiRow[]).map(mapPrintAgent);
}

export async function createPrintAgent(name: string, slug = 'reception'): Promise<CreatedPrintAgent> {
  const { data, error } = await requireSupabase().rpc('create_print_agent', {
    p_name: name.trim(),
    p_slug: slug.trim(),
  });
  const row = unwrap((data as ApiRow[] | null)?.[0] ?? null, error);
  return { ...mapPrintAgent(row), token: String(row.token) };
}

export async function requestTicketPrint(ticketId: string, agentSlug = 'reception'): Promise<{ id: string; status: PrintJobStatus }> {
  const { data, error } = await requireSupabase().rpc('request_ticket_print', {
    p_ticket_id: ticketId,
    p_agent_slug: agentSlug,
  });
  const row = unwrap((data as ApiRow[] | null)?.[0] ?? null, error);
  return { id: String(row.id), status: String(row.status) as PrintJobStatus };
}

export async function getPrintJobStatus(jobId: string): Promise<{ id: string; status: PrintJobStatus; errorMessage: string | null; completedAt: string | null }> {
  const { data, error } = await requireSupabase().rpc('get_print_job_status', { p_job_id: jobId });
  const row = unwrap((data as ApiRow[] | null)?.[0] ?? null, error);
  return {
    id: String(row.id),
    status: String(row.status) as PrintJobStatus,
    errorMessage: row.error_message ? String(row.error_message) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

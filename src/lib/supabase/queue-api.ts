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

const displayNoticeUrlPrefix = 'https://ticker.artvideo.local/';

const queueSyncTopic = 'queue-system-sync';

async function broadcastQueueChange(resource: QueueRealtimeResource): Promise<void> {
  try {
    const client = requireSupabase();
    const channel = client.channel(queueSyncTopic);
    try {
      await channel.send({ type: 'broadcast', event: 'changed', payload: { resource } });
    } finally {
      await client.removeChannel(channel);
    }
  } catch {
    // Realtime sync is best-effort. The database write remains authoritative.
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
  return requireSupabase()
    .channel(queueSyncTopic)
    .on('broadcast', { event: 'changed' }, (message) => {
      const resource = (message.payload as { resource?: unknown } | undefined)?.resource;
      if (typeof resource === 'string' && resources.includes(resource as QueueRealtimeResource)) {
        onChange(resource as QueueRealtimeResource);
      }
    })
    .subscribe((status) => onStatus(status));
}

function explainError(message: string): string {
  if (/no waiting tickets/i.test(message)) return 'Não há senhas aguardando neste atendimento.';
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

function mapTicket(row: QueueRow, serviceTypeName = row.ticket_types?.name ?? ''): QueueTicket {
  return {
    id: row.id, ticketNumber: row.ticket_number, sequenceNumber: row.sequence_number,
    businessDate: row.business_date, serviceTypeId: row.service_type_id, serviceTypeName,
    customerName: row.customer_name, status: row.status, counterLabel: row.counter_label,
    createdAt: row.created_at, calledAt: row.called_at, servingAt: row.started_at,
    completedAt: row.completed_at, cancelledAt: row.cancelled_at,
  };
}

function mapDisplayCall(row: ApiRow): DisplayCall {
  return { id: String(row.id), ticketNumber: String(row.ticket_number), serviceTypeName: String(row.service_type_name), counterLabel: row.counter_label ? String(row.counter_label) : null, calledAt: String(row.called_at) };
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

export async function callNextTicket(typeId: string, counterLabel = 'Balcão 1'): Promise<DisplayCall> {
  const { data, error } = await requireSupabase().rpc('call_next_ticket', { p_type_id: typeId, p_counter_label: counterLabel.trim() || null });
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
  const { data, error } = await requireSupabase().from('tickets').select('*, ticket_types(name)').eq('business_date', businessDate).order('sequence_number');
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

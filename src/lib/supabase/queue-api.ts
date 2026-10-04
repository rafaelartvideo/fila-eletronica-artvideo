import { FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js';
import type { DisplayCall, MediaItem, QueueTicket, TicketPriority, TicketStatus, TicketType } from '../../domain/queue';
import { requireSupabase } from './client';

type QueueRow = {
  id: string; business_date: string; service_type_id: string; sequence_number: number;
  ticket_number: string; customer_name: string | null; status: TicketStatus; counter_label: string | null;
  created_at: string; called_at: string | null; started_at: string | null; completed_at: string | null;
  cancelled_at: string | null; tracking_token?: string | null; os_access_code?: string | null; customer_request?: string | null; ticket_types?: { name: string; priority?: string } | null;
};
type ApiRow = Record<string, unknown>;
export type QueueRealtimeResource = 'tickets' | 'ticket_types' | 'display_media';
export type DisplayNotice = { id: string; text: string; sortOrder: number; isActive: boolean };
export type PrintAgent = { id: string; slug: string; name: string; isActive: boolean; createdAt: string; lastSeenAt: string | null };
export type CreatedPrintAgent = PrintAgent & { token: string };
export type PrintJobStatus = 'pending' | 'processing' | 'printed' | 'error';
export type TicketTracking = {
  ticketNumber: string;
  serviceTypeName: string;
  servicePriority: TicketPriority;
  status: TicketStatus;
  counterLabel: string | null;
  createdAt: string;
  calledAt: string | null;
  updatedAt: string;
  queueAhead: number;
};

export type QueuePermission = {
  key: string;
  label: string;
  moduleName: string;
  description: string;
  sortOrder: number;
};

export type QueueRole = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
};

export type QueueUser = {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceRecord = {
  id: string;
  businessDate: string;
  ticketNumber: string;
  serviceTypeName: string;
  servicePriority: TicketPriority;
  status: TicketStatus;
  counterLabel: string | null;
  customerRequest: string | null;
  createdAt: string;
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  attendantName: string | null;
  attendantUsername: string | null;
};

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
  if (/only quick service tickets can be called individually/i.test(message)) return 'Somente atendimentos rápidos podem ser chamados individualmente.';
  if (/service type has ticket history/i.test(message)) return 'Esse tipo já possui senhas vinculadas. Inative-o para preservar o histórico dos atendimentos.';
  if (/foreign key constraint|violates foreign key/i.test(message)) return 'Esse registro possui dados vinculados e não pode ser excluído sem apagar o histórico.';
  if (/customer request required/i.test(message)) return 'Informe o que o cliente queria antes de encerrar o atendimento.';
  if (/invalid ticket status transition/i.test(message)) return 'Essa mudança de status não é permitida.';
  if (/ticket issuance is limited to staff|admin access required|permission denied/i.test(message)) return 'Somente a equipe autorizada pode gerar senhas.';
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

function normalizePriority(value: unknown): TicketPriority {
  return value === 'low' || value === 'high' || value === 'urgent' ? value : 'normal';
}

function mapTicket(row: QueueRow, serviceTypeName = row.ticket_types?.name ?? ''): QueueTicket {
  return {
    id: row.id, ticketNumber: formatTicketNumber(row.ticket_number), sequenceNumber: row.sequence_number,
    businessDate: row.business_date, serviceTypeId: row.service_type_id, serviceTypeName,
    servicePriority: normalizePriority(row.ticket_types?.priority), customerName: row.customer_name,
    customerRequest: row.customer_request ?? null, trackingToken: row.tracking_token ?? null,
    osAccessCode: row.os_access_code ?? null,
    status: row.status, counterLabel: row.counter_label,
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
  if (!session || session.user?.is_anonymous) {
    throw new Error('Entre no painel da equipe para gerar uma senha.');
  }
  const params = { p_type_id: input.typeId, p_customer_name: input.customerName?.trim() || null };
  let result = await client.rpc('issue_ticket_v3', params);
  if (result.error && /issue_ticket_v3|PGRST202|could not find the function/i.test(result.error.message)) {
    result = await client.rpc('issue_ticket_v2', params);
  }
  if (result.error && /issue_ticket_v2|PGRST202|could not find the function/i.test(result.error.message)) {
    result = await client.rpc('issue_ticket', params);
  }
  const row = unwrap((result.data as ApiRow[] | null)?.[0] ?? null, result.error);
  const ticket = mapTicket({
    ...row,
    customer_name: null,
    customer_request: null,
    tracking_token: row.tracking_token ? String(row.tracking_token) : null,
    os_access_code: row.os_access_code ? String(row.os_access_code) : null,
    ticket_types: {
      name: String(row.service_type_name),
      priority: row.service_priority ? String(row.service_priority) : 'normal',
    },
  } as unknown as QueueRow);
  announceQueueChange('tickets');
  return ticket;
}

export async function callNextTicket(counterLabel = 'Balcão 1'): Promise<DisplayCall> {
  const { data, error } = await requireSupabase().rpc('call_next_waiting_ticket', { p_counter_label: counterLabel.trim() || null });
  const call = mapDisplayCall(unwrap((data as ApiRow[] | null)?.[0] ?? null, error));
  announceQueueChange('tickets');
  return call;
}

export async function callTicketById(ticketId: string, counterLabel = 'Balcão 1'): Promise<DisplayCall> {
  const { data, error } = await requireSupabase().rpc('call_waiting_ticket', {
    p_ticket_id: ticketId,
    p_counter_label: counterLabel.trim() || null,
  });
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
  const client = requireSupabase();
  const enhancedResult = await client
    .from('ticket_types')
    .select('id,name,prefix,description,icon,extra_icons,extra_icon_descriptions,priority,is_quick,is_pinned,is_active,sort_order')
    .order('sort_order')
    .order('name');

  let data = enhancedResult.data as unknown as ApiRow[] | null;
  let error = enhancedResult.error;

  if (error && /extra_icon_descriptions|schema cache|PGRST204|does not exist/i.test(error.message)) {
    const extraIconsResult = await client
      .from('ticket_types')
      .select('id,name,prefix,description,icon,extra_icons,priority,is_quick,is_pinned,is_active,sort_order')
      .order('sort_order')
      .order('name');
    data = extraIconsResult.data as unknown as ApiRow[] | null;
    error = extraIconsResult.error;
  }

  if (error && /extra_icons|schema cache|PGRST204|does not exist/i.test(error.message)) {
    const currentResult = await client
      .from('ticket_types')
      .select('id,name,prefix,description,icon,priority,is_quick,is_pinned,is_active,sort_order')
      .order('sort_order')
      .order('name');
    data = currentResult.data as unknown as ApiRow[] | null;
    error = currentResult.error;
  }

  if (error && /icon|is_quick|is_pinned|schema cache|PGRST204|does not exist/i.test(error.message)) {
    const legacyResult = await client
      .from('ticket_types')
      .select('id,name,prefix,description,priority,is_active,sort_order')
      .order('sort_order')
      .order('name');
    data = legacyResult.data as unknown as ApiRow[] | null;
    error = legacyResult.error;
  }

  return (unwrap(data, error) as ApiRow[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    prefix: String(row.prefix),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : 'clipboard',
    extraIcons: Array.isArray(row.extra_icons) ? row.extra_icons.map(String).slice(0, 4) : [],
    extraIconDescriptions: row.extra_icon_descriptions && typeof row.extra_icon_descriptions === 'object' && !Array.isArray(row.extra_icon_descriptions)
      ? Object.fromEntries(Object.entries(row.extra_icon_descriptions as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]))
      : {},
    priority: normalizePriority(row.priority),
    isQuick: Boolean(row.is_quick),
    isPinned: Boolean(row.is_pinned),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
  }));
}

export async function listQueueTickets(businessDate: string): Promise<QueueTicket[]> {
  const { data, error } = await requireSupabase().from('tickets').select('*, ticket_types(name,priority)').eq('business_date', businessDate).order('created_at', { ascending: true });
  return (unwrap(data, error) as unknown as QueueRow[]).map((row) => mapTicket(row));
}

export async function completeTicket(ticketId: string, customerRequest: string): Promise<QueueTicket> {
  const normalized = customerRequest.trim();
  if (!normalized) throw new Error('Informe o que o cliente queria antes de encerrar o atendimento.');
  const { data, error } = await requireSupabase().rpc('complete_ticket', {
    p_ticket_id: ticketId,
    p_customer_request: normalized,
  });
  const row = unwrap((data as ApiRow[] | null)?.[0] ?? null, error);
  const ticket = mapTicket({
    ...row,
    customer_request: normalized,
    ticket_types: {
      name: String(row.service_type_name),
      priority: row.service_priority ? String(row.service_priority) : 'normal',
    },
  } as unknown as QueueRow);
  announceQueueChange('tickets');
  return ticket;
}

export async function getTicketTracking(token: string): Promise<TicketTracking> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    throw new Error('Link de acompanhamento inválido.');
  }
  const { data, error } = await requireSupabase().rpc('get_ticket_tracking', { p_token: token });
  if (error) throw new Error(explainError(error.message));
  const row = (data as ApiRow[] | null)?.[0];
  if (!row) throw new Error('Esta senha não foi encontrada ou não está mais disponível.');
  return {
    ticketNumber: formatTicketNumber(String(row.ticket_number)),
    serviceTypeName: String(row.service_type_name),
    servicePriority: normalizePriority(row.service_priority),
    status: String(row.status) as TicketStatus,
    counterLabel: row.counter_label ? String(row.counter_label) : null,
    createdAt: String(row.created_at),
    calledAt: row.called_at ? String(row.called_at) : null,
    updatedAt: String(row.updated_at),
    queueAhead: Number(row.queue_ahead ?? 0),
  };
}

export async function isQueueAdmin(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('is_queue_admin');
  return Boolean(unwrap(data as boolean | null, error));
}

export async function saveTicketType(input: {
  id?: string;
  name: string;
  prefix: string;
  description?: string | null;
  icon?: string;
  extraIcons?: string[];
  extraIconDescriptions?: Record<string, string>;
  priority: TicketPriority;
  isQuick?: boolean;
  isPinned?: boolean;
  isActive: boolean;
  sortOrder?: number;
}): Promise<void> {
  const client = requireSupabase();
  const fullRow = {
    name: input.name.trim(),
    prefix: input.prefix.trim().toUpperCase(),
    description: input.description?.trim() || null,
    icon: input.icon?.trim() || 'clipboard',
    extra_icons: (input.extraIcons ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 4),
    extra_icon_descriptions: Object.fromEntries(
      (input.extraIcons ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 4)
        .map((value) => [value, input.extraIconDescriptions?.[value]?.trim() || '']),
    ),
    priority: input.priority,
    is_quick: Boolean(input.isQuick),
    is_pinned: Boolean(input.isPinned),
    is_active: input.isActive,
    sort_order: input.sortOrder ?? 0,
  };
  const extraIconsRow = {
    name: fullRow.name,
    prefix: fullRow.prefix,
    description: fullRow.description,
    icon: fullRow.icon,
    extra_icons: fullRow.extra_icons,
    priority: fullRow.priority,
    is_quick: fullRow.is_quick,
    is_pinned: fullRow.is_pinned,
    is_active: fullRow.is_active,
    sort_order: fullRow.sort_order,
  };
  const currentRow = {
    name: fullRow.name,
    prefix: fullRow.prefix,
    description: fullRow.description,
    icon: fullRow.icon,
    priority: fullRow.priority,
    is_quick: fullRow.is_quick,
    is_pinned: fullRow.is_pinned,
    is_active: fullRow.is_active,
    sort_order: fullRow.sort_order,
  };
  const legacyRow = {
    name: fullRow.name,
    prefix: fullRow.prefix,
    description: fullRow.description,
    priority: fullRow.priority,
    is_active: fullRow.is_active,
    sort_order: fullRow.sort_order,
  };

  let result = input.id
    ? await client.from('ticket_types').update(fullRow).eq('id', input.id)
    : await client.from('ticket_types').insert(fullRow);

  if (result.error && /extra_icon_descriptions|schema cache|PGRST204|does not exist/i.test(result.error.message)) {
    result = input.id
      ? await client.from('ticket_types').update(extraIconsRow).eq('id', input.id)
      : await client.from('ticket_types').insert(extraIconsRow);
  }

  if (result.error && /extra_icons|schema cache|PGRST204|does not exist/i.test(result.error.message)) {
    result = input.id
      ? await client.from('ticket_types').update(currentRow).eq('id', input.id)
      : await client.from('ticket_types').insert(currentRow);
  }

  if (result.error && /icon|is_quick|is_pinned|schema cache|PGRST204|does not exist/i.test(result.error.message)) {
    result = input.id
      ? await client.from('ticket_types').update(legacyRow).eq('id', input.id)
      : await client.from('ticket_types').insert(legacyRow);
  }

  if (result.error) throw new Error(explainError(result.error.message));
  announceQueueChange('ticket_types');
}

export async function reorderTicketTypes(ids: string[]): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('reorder_ticket_types', { p_ids: ids });
  if (error && /reorder_ticket_types|PGRST202|could not find the function/i.test(error.message)) {
    for (let index = 0; index < ids.length; index += 1) {
      const fallback = await client.from('ticket_types').update({ sort_order: index }).eq('id', ids[index]);
      if (fallback.error) throw new Error(explainError(fallback.error.message));
    }
  } else if (error) {
    throw new Error(explainError(error.message));
  }
  announceQueueChange('ticket_types');
}

export async function deleteTicketType(id: string): Promise<void> {
  const client = requireSupabase();
  let result = await client.rpc('delete_ticket_type', { p_id: id });
  if (result.error && /delete_ticket_type|PGRST202|could not find the function/i.test(result.error.message)) {
    result = await client.from('ticket_types').delete().eq('id', id);
  }
  if (result.error) throw new Error(explainError(result.error.message));
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


async function edgeFunctionError(error: unknown, fallback: string): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (typeof payload?.error === 'string' && payload.error.trim()) return new Error(payload.error.trim());
    } catch {}
  }
  return new Error(fallback);
}

export async function listAttendanceHistory(from: string, to: string): Promise<AttendanceRecord[]> {
  const { data, error } = await requireSupabase().rpc('list_attendance_history', { p_from: from, p_to: to });
  return (unwrap(data as ApiRow[] | null, error) as ApiRow[]).map((row) => ({
    id: String(row.id),
    businessDate: String(row.business_date),
    ticketNumber: formatTicketNumber(String(row.ticket_number)),
    serviceTypeName: String(row.service_type_name),
    servicePriority: normalizePriority(row.service_priority),
    status: String(row.status) as TicketStatus,
    counterLabel: row.counter_label ? String(row.counter_label) : null,
    customerRequest: row.customer_request ? String(row.customer_request) : null,
    createdAt: String(row.created_at),
    calledAt: row.called_at ? String(row.called_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    attendantName: row.attendant_name ? String(row.attendant_name) : null,
    attendantUsername: row.attendant_username ? String(row.attendant_username) : null,
  }));
}

export async function listQueuePermissions(): Promise<QueuePermission[]> {
  const { data, error } = await requireSupabase()
    .from('queue_permissions')
    .select('key,label,module_name,description,sort_order')
    .order('sort_order')
    .order('label');
  return (unwrap(data, error) as ApiRow[]).map((row) => ({
    key: String(row.key),
    label: String(row.label),
    moduleName: String(row.module_name),
    description: String(row.description ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function listQueueRoles(): Promise<QueueRole[]> {
  const { data, error } = await requireSupabase().rpc('list_queue_roles');
  return (unwrap(data as ApiRow[] | null, error) as ApiRow[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    isSystem: Boolean(row.is_system),
    isActive: Boolean(row.is_active),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
  }));
}

export async function saveQueueRole(input: {
  id?: string;
  name: string;
  description?: string;
  isActive: boolean;
  permissions: string[];
}): Promise<string> {
  const { data, error } = await requireSupabase().rpc('save_queue_role', {
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_is_active: input.isActive,
    p_permission_keys: input.permissions,
  });
  return String(unwrap(data as string | null, error));
}

export async function listQueueUsers(): Promise<QueueUser[]> {
  const { data, error } = await requireSupabase()
    .from('queue_users')
    .select('user_id,username,full_name,role_id,is_active,created_at,updated_at,queue_roles(name)')
    .order('full_name');
  return (unwrap(data, error) as ApiRow[]).map((row) => {
    const role = row.queue_roles as { name?: unknown } | null;
    return {
      userId: String(row.user_id),
      username: String(row.username),
      fullName: String(row.full_name),
      roleId: String(row.role_id),
      roleName: role?.name ? String(role.name) : 'Sem cargo',
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });
}

export async function saveQueueUser(input: {
  userId?: string;
  username: string;
  fullName: string;
  roleId: string;
  password?: string;
  isActive: boolean;
}): Promise<void> {
  const result = await requireSupabase().functions.invoke('queue-user-admin', {
    body: {
      action: input.userId ? 'update' : 'create',
      user_id: input.userId,
      username: input.username.trim().toLowerCase(),
      full_name: input.fullName.trim(),
      role_id: input.roleId,
      password: input.password ?? '',
      is_active: input.isActive,
    },
  });
  if (result.error) throw await edgeFunctionError(result.error, 'Não foi possível salvar o usuário.');
}

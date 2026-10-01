export type TicketStatus = 'waiting' | 'called' | 'serving' | 'completed' | 'cancelled';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const ticketPriorityLabels: Record<TicketPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export function ticketPriorityLabel(priority: TicketPriority): string {
  return ticketPriorityLabels[priority];
}

export interface TicketType {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  icon: string;
  extraIcons?: string[];
  extraIconDescriptions?: Record<string, string>;
  priority: TicketPriority;
  isQuick: boolean;
  isPinned: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface QueueTicket {
  id: string;
  ticketNumber: string;
  sequenceNumber: number;
  businessDate: string;
  serviceTypeId: string;
  serviceTypeName: string;
  servicePriority: TicketPriority;
  customerName: string | null;
  customerRequest: string | null;
  trackingToken: string | null;
  status: TicketStatus;
  counterLabel: string | null;
  createdAt: string;
  calledAt: string | null;
  servingAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface DisplayCall {
  id: string;
  ticketNumber: string;
  serviceTypeName: string;
  counterLabel: string | null;
  calledAt: string;
}

export interface MediaItem {
  id: string;
  url: string;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
}

export function formatTicketNumber(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError('O número da senha precisa ser um inteiro positivo.');
  }
  return String(sequence).padStart(3, '0');
}

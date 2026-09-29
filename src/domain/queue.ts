export type TicketStatus = 'waiting' | 'called' | 'serving' | 'completed' | 'cancelled';

export interface TicketType {
  id: string;
  name: string;
  prefix: string;
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
  customerName: string | null;
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

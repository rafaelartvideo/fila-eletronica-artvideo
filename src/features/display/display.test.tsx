import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listDisplayCalls, listDisplayMedia, listDisplayNotices, subscribeToDisplayCalls, subscribeToQueueChanges, subscriptionState } = vi.hoisted(() => ({
  listDisplayCalls: vi.fn(), listDisplayMedia: vi.fn(), listDisplayNotices: vi.fn(), subscribeToDisplayCalls: vi.fn(), subscribeToQueueChanges: vi.fn(),
  subscriptionState: { onChange: null as null | (() => void), onStatus: null as null | ((status: string) => void) },
}));
vi.mock('../../lib/supabase/queue-api', () => ({ listDisplayCalls, listDisplayMedia, listDisplayNotices, subscribeToDisplayCalls, subscribeToQueueChanges }));

import { useDisplayCalls } from './useDisplayCalls';
import { DisplayPage } from './DisplayPage';
import { CallAnnouncement } from './CallAnnouncement';

const call = { id: 'call-1', ticketNumber: 'C008', serviceTypeName: 'Conserto', counterLabel: 'Balcão 2', calledAt: '2026-01-01T12:00:00Z' };

describe('public display', () => {
  beforeEach(() => {
    listDisplayCalls.mockReset().mockResolvedValue([call]);
    listDisplayMedia.mockReset().mockResolvedValue([]);
    listDisplayNotices.mockReset().mockResolvedValue([]);
    subscriptionState.onChange = null;
    subscriptionState.onStatus = null;
    subscribeToQueueChanges.mockReset().mockReturnValue({ unsubscribe: vi.fn() });
    subscribeToDisplayCalls.mockReset().mockImplementation((onChange, onStatus) => {
      subscriptionState.onChange = onChange;
      subscriptionState.onStatus = onStatus;
      return { unsubscribe: vi.fn() };
    });
  });

  it('updates the current call from realtime events', async () => {
    const { result } = renderHook(() => useDisplayCalls());
    await waitFor(() => expect(result.current.currentCall?.ticketNumber).toBe('C008'));
    const next = { ...call, id: 'call-2', ticketNumber: 'C009' };
    listDisplayCalls.mockResolvedValue([next, call]);
    await act(async () => { subscriptionState.onStatus?.('SUBSCRIBED'); });
    await waitFor(() => expect(result.current.currentCall?.ticketNumber).toBe('C009'));
    await act(async () => { subscriptionState.onChange?.(); });
    await waitFor(() => expect(result.current.currentCall?.ticketNumber).toBe('C009'));
    expect(result.current.connection).toBe('connected');
  });

  it('reloads after a realtime reconnect', async () => {
    const { result } = renderHook(() => useDisplayCalls());
    await waitFor(() => expect(result.current.currentCall).not.toBeNull());
    act(() => subscriptionState.onStatus?.('SUBSCRIBED'));
    act(() => subscriptionState.onStatus?.('CLOSED'));
    expect(result.current.connection).toBe('reconnecting');
    const next = { ...call, ticketNumber: 'R001' };
    listDisplayCalls.mockResolvedValue([next]);
    await act(async () => { subscriptionState.onStatus?.('SUBSCRIBED'); });
    await waitFor(() => expect(result.current.currentCall?.ticketNumber).toBe('R001'));
    expect(listDisplayCalls).toHaveBeenCalledTimes(3);
  });

  it('shows only public call fields and keeps the queue visible if a video fails', async () => {
    listDisplayMedia.mockResolvedValue([{ id: 'bad', title: 'Incorporado', url: 'https://media.example/embed', sortOrder: 0, isActive: true }]);
    listDisplayCalls.mockResolvedValue([{ ...call, customerName: 'NOME PRIVADO' }]);
    render(<DisplayPage />);
    expect(await screen.findByText('C008')).toBeInTheDocument();
    expect(screen.queryByText('NOME PRIVADO')).not.toBeInTheDocument();
    fireEvent.error(await screen.findByTitle('Incorporado'));
    expect(screen.getByText('C008')).toBeInTheDocument();
    expect(screen.getByText(/chamadas recentes/i)).toBeInTheDocument();
  });

  it('puts video first and the current call with recent calls in the right rail', async () => {
    render(<DisplayPage />);
    expect(await screen.findByText('C008')).toBeInTheDocument();
    const grid = document.querySelector('.display-main-grid')!;
    expect(grid.firstElementChild).toHaveClass('display-media');
    expect(grid.lastElementChild).toHaveClass('display-queue-column');
  });

  it('advances the media playlist when playback ends', async () => {
    listDisplayMedia.mockResolvedValue([
      { id: 'video1', title: 'Vídeo 1', url: 'https://cdn.example/a.mp4', sortOrder: 0, isActive: true },
      { id: 'video2', title: 'Vídeo 2', url: 'https://cdn.example/b.mp4', sortOrder: 1, isActive: true },
    ]);
    render(<DisplayPage />);
    const first = await screen.findByTitle('Vídeo 1');
    fireEvent.ended(first);
    expect(await screen.findByTitle('Vídeo 2')).toBeInTheDocument();
  });

  it('starts spoken calls enabled by default and allows disabling them', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak, cancel } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(public text: string) {} } });
    render(<CallAnnouncement call={call} />);
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0].text).toContain('C008');
    fireEvent.click(screen.getByRole('button', { name: /desativar voz/i }));
    expect(cancel).toHaveBeenCalled();
  });
});

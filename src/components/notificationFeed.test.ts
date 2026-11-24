import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/notifications';
import { createNotificationFeed, NOTIFICATION_TOAST_MS } from './notificationFeed';

const item = (id: string, readAt: string | null = null): NotificationItem => ({
  notificationId: id, type: 'SWAP_PENDING_APPROVAL', title: `Title ${id}`, message: `Message ${id}`,
  severity: null, taskId: null, eventId: null, createdAt: '2026-11-25T00:00:00Z', readAt,
});

describe('notification feed', () => {
  afterEach(() => vi.useRealTimers());

  it('counts unread, treats the first load as history and pops new notifications for 3 seconds', async () => {
    vi.useFakeTimers();
    const fetchItems = vi.fn()
      .mockResolvedValueOnce([item('a'), item('b', '2026-11-25T00:00:00Z')])
      .mockResolvedValueOnce([item('c'), item('a'), item('b', '2026-11-25T00:00:00Z')]);
    const feed = createNotificationFeed(fetchItems, () => 'user-1');

    await feed.refresh();
    expect(feed.getSnapshot()).toEqual({ unread: 1, toasts: [] });

    await feed.refresh();
    expect(feed.getSnapshot().unread).toBe(2);
    expect(feed.getSnapshot().toasts).toEqual([{ id: 'c', title: 'Title c', message: 'Message c' }]);

    vi.advanceTimersByTime(NOTIFICATION_TOAST_MS);
    expect(feed.getSnapshot().toasts).toEqual([]);
  });

  it('starts over for a different signed-in user', async () => {
    let user = 'user-1';
    const fetchItems = vi.fn().mockResolvedValueOnce([item('a')]).mockResolvedValueOnce([item('x'), item('y')]);
    const feed = createNotificationFeed(fetchItems, () => user);
    await feed.refresh();
    user = 'user-2';
    await feed.refresh();
    expect(feed.getSnapshot()).toEqual({ unread: 2, toasts: [] });
  });
});

import { useSyncExternalStore } from 'react';
import { listNotifications, type NotificationItem } from '../api/notifications';
import { loadSession } from '../auth/session';

export type NotificationToast = { id: string; title: string; message: string };
export type NotificationFeedSnapshot = { unread: number; toasts: NotificationToast[] };

export const NOTIFICATION_POLL_MS = 10_000;
export const NOTIFICATION_TOAST_MS = 3_000;
const MAX_TOASTS = 3;

/**
 * One shared poll of the caller's in-app notifications for every Operator/Manager page.
 * The first load is history (no toasts); notifications that appear after it pop a toast for 3 seconds.
 */
export function createNotificationFeed(
  fetchItems: () => Promise<NotificationItem[]> = listNotifications,
  currentUser: () => string | null = () => loadSession()?.user.userId ?? null,
) {
  let snapshot: NotificationFeedSnapshot = { unread: 0, toasts: [] };
  let seen: Set<string> | null = null;
  let owner: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let subscribers = 0;
  let loading = false;
  const listeners = new Set<() => void>();

  const emit = (next: NotificationFeedSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const dismiss = (id: string) => {
    if (snapshot.toasts.some((toast) => toast.id === id))
      emit({ ...snapshot, toasts: snapshot.toasts.filter((toast) => toast.id !== id) });
  };
  const refresh = async () => {
    const user = currentUser();
    if (!user) return;
    if (user !== owner) {
      owner = user;
      seen = null;
      emit({ unread: 0, toasts: [] });
    }
    if (loading) return;
    loading = true;
    try {
      const items = await fetchItems();
      if (owner !== user) return;
      const known = seen;
      const fresh = known ? items.filter((item) => !item.readAt && !known.has(item.notificationId)).slice(0, MAX_TOASTS) : [];
      seen = new Set(items.map((item) => item.notificationId));
      const added = fresh.map((item) => ({ id: item.notificationId, title: item.title, message: item.message }));
      emit({ unread: items.filter((item) => !item.readAt).length, toasts: [...added, ...snapshot.toasts].slice(0, MAX_TOASTS) });
      added.forEach((toast) => setTimeout(() => dismiss(toast.id), NOTIFICATION_TOAST_MS));
    } catch {
      // Keep the last count; the next poll retries.
    } finally {
      loading = false;
    }
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    subscribers += 1;
    if (subscribers === 1) {
      void refresh();
      timer = setInterval(() => void refresh(), NOTIFICATION_POLL_MS);
    }
    return () => {
      listeners.delete(listener);
      subscribers -= 1;
      if (subscribers === 0) clearInterval(timer);
    };
  };
  return { subscribe, getSnapshot: () => snapshot, refresh, dismiss };
}

const feed = createNotificationFeed();
const idle = () => () => {};

/** Unread count and live toasts. Disabled under Vitest so page tests keep their own API mocks. */
export function useNotificationFeed(enabled = import.meta.env.MODE !== 'test') {
  return useSyncExternalStore(enabled ? feed.subscribe : idle, feed.getSnapshot);
}
export const refreshNotificationFeed = () => feed.refresh();
export const dismissNotificationToast = (id: string) => feed.dismiss(id);

import { apiFetch } from './client';

export type NotificationSettings = {
  pushEnabled: boolean;
  taskOfferPushEnabled: boolean;
  taskUpdatePushEnabled: boolean;
  shiftSwapPushEnabled: boolean;
  pushConfigured: boolean;
  updatedAt: string | null;
};

export type UpdateNotificationSettings = Omit<NotificationSettings, 'pushConfigured' | 'updatedAt'> & {
  expectedUpdatedAt: string | null;
};

export type NotificationItem = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  severity: string | null;
  taskId: string | null;
  eventId: string | null;
  createdAt: string;
  readAt: string | null;
};

export const getNotificationSettings = () => apiFetch<NotificationSettings>('/api/admin/settings/notifications');
export const updateNotificationSettings = (request: UpdateNotificationSettings) => apiFetch<NotificationSettings>('/api/admin/settings/notifications', {
  method: 'PUT', body: JSON.stringify(request),
});
export const listNotifications = () => apiFetch<NotificationItem[]>('/api/me/notifications');
export const markAllNotificationsRead = () => apiFetch<void>('/api/me/notifications/read-all', { method: 'POST', responseType: 'text' });

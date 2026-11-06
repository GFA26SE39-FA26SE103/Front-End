import { apiFetch } from './client';

export type EventQuery = { status?: string; priority?: string; zoneId?: string; from?: string; to?: string; page?: number; pageSize?: number };
export type OperationalEvent = {
  eventId: string; sourceCode: string; eventTypeId: string; eventTypeCode: string; eventTypeName: string;
  zoneId: string; zoneName: string; cameraId: string; cameraCode: string; cameraName: string;
  priority: string; status: string; metricValue: number; measurementType: string; detectedAt: string;
  lastObservedAt: string; clearedAt: string | null; updatedAt: string; taskCount: number;
};
export type EventPage = { items: OperationalEvent[]; totalCount: number; page: number; pageSize: number; generatedAt: string; timeZone: string };
export type EventDetail = { event: OperationalEvent; tasks: { taskId: string; title: string; status: string; priority: string; assigneeName: string | null; createdAt: string }[]; hasMoreTasks: boolean };
export type EventZone = { zoneId: string; name: string; status: string };

export function listOperationalEvents(query: EventQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return apiFetch<EventPage>(`/api/operational-events?${params}`, { signal });
}
export const getOperationalEvent = (id: string, signal?: AbortSignal) => apiFetch<EventDetail>(`/api/operational-events/${encodeURIComponent(id)}`, { signal });
export const listEventZones = (signal?: AbortSignal) => apiFetch<EventZone[]>('/api/operational-events/zones', { signal });

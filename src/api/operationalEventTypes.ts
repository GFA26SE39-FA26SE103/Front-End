import { apiFetch } from './client';

export type OperationalEventTypeUpdate = {
  name: string;
  description: string | null;
  measurementType: string;
  status: 'ACTIVE' | 'INACTIVE';
};
export type OperationalEventTypeCreate = OperationalEventTypeUpdate & { code: string };
export type OperationalEventType = OperationalEventTypeCreate & { eventTypeId: string };

const path = '/api/operational-event-types';
const itemPath = (id: string) => `${path}/${encodeURIComponent(id)}`;

export const listOperationalEventTypes = (signal?: AbortSignal) => apiFetch<OperationalEventType[]>(path, { signal });
export const createOperationalEventType = (body: OperationalEventTypeCreate) =>
  apiFetch<OperationalEventType>(path, { method: 'POST', body: JSON.stringify(body) });
export const updateOperationalEventType = (id: string, body: OperationalEventTypeUpdate) =>
  apiFetch<OperationalEventType>(itemPath(id), { method: 'PUT', body: JSON.stringify(body) });
export const deactivateOperationalEventType = (id: string) => apiFetch<void>(itemPath(id), { method: 'DELETE' });

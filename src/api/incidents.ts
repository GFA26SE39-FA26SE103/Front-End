import { apiFetch } from './client';

export type IncidentActionView = {
  incidentId: string;
  status: string;
  reason: string;
  closedAt: string;
  updatedAt: string;
};

export const dismissIncident = (incidentId: string, reason: string) =>
  apiFetch<IncidentActionView>(`/api/incidents/${encodeURIComponent(incidentId)}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

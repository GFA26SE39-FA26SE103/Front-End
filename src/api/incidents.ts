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

// L3: Operator Incident board. Mitigation (BR-21) and closure (BR-22) are separate milestones.
export type IncidentTask = {
  taskId: string; title: string; status: string; isMandatory: boolean; verificationMode: string | null; assigneeName: string | null; verifiedAt: string | null;
  /** K5 / BR-21: TT-12 is the designated mitigation Task; its MANUAL verification records mitigatedAt. */
  taskTypeCode?: string | null; isMitigation?: boolean;
};
export type IncidentRow = {
  incidentId: string; title: string; description: string | null; sourceType: string; incidentTypeCode: string | null; incidentTypeName: string | null;
  zoneId: string; zoneName: string; status: string; statusReason: string | null; createdAt: string; updatedAt: string; closedAt: string | null;
  mitigatedAt: string | null; resolutionDeadlineAt: string | null; slaPriorityCode: string | null; isOpen: boolean;
  mandatoryTasks: number; verifiedMandatoryTasks: number; tasks: IncidentTask[];
};
export type IncidentState = 'open' | 'ended' | 'all';
export const listIncidents = (state: IncidentState, signal?: AbortSignal) => apiFetch<IncidentRow[]>(`/api/incidents?state=${state}`, { signal });
export const getIncident = (incidentId: string, signal?: AbortSignal) => apiFetch<IncidentRow>(`/api/incidents/${encodeURIComponent(incidentId)}`, { signal });

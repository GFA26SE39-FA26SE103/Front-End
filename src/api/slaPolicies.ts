import { apiFetch } from './client';

export type IncidentSlaPolicy = {
  policyId: string; incidentTypeId: string; incidentTypeCode: string; incidentTypeName: string; isEnabled: boolean; version: number;
  priorityCode: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; responseTargetSec: number; resolutionTargetSec: number;
  offerTimeoutSec: number; warningPercent: number; createdAt: string; updatedAt: string;
};
export type IncidentSlaPolicySave = Omit<IncidentSlaPolicy, 'policyId' | 'incidentTypeId' | 'incidentTypeCode' | 'incidentTypeName' | 'version' | 'createdAt' | 'updatedAt'> & { expectedVersion: number | null };
export const listSlaPolicies = (signal?: AbortSignal) => apiFetch<IncidentSlaPolicy[]>('/api/sla-policies', { signal });
export const saveSlaPolicy = (incidentTypeId: string, body: IncidentSlaPolicySave) => apiFetch<IncidentSlaPolicy>(`/api/incident-types/${encodeURIComponent(incidentTypeId)}/sla-policy`, {
  method: 'PUT', body: JSON.stringify(body),
});

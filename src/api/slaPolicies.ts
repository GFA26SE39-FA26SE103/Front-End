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

// L7/L1: SLA timing per OperationalEventType and TaskType, plus warning/breach escalation per policy.
export const slaPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type SlaPriority = typeof slaPriorities[number];
export type SlaPolicySummary = {
  policyId: string; isEnabled: boolean; version: number; priorityCode: SlaPriority; responseTargetSec: number; resolutionTargetSec: number;
  offerTimeoutSec: number; warningPercent: number; createdAt: string; updatedAt: string;
};
export type SlaTimingSave = {
  expectedVersion: number | null; isEnabled: boolean; priorityCode: SlaPriority; responseTargetSec: number; resolutionTargetSec: number;
  offerTimeoutSec: number; warningPercent: number;
};
export type OperationalEventSlaPolicy = {
  eventTypeId: string; code: string; name: string; measurementType: string; status: string; policy: SlaPolicySummary | null; issues: string[];
};
export type TaskTypeSlaPolicy = {
  taskTypeId: string; code: string; name: string; sourceCategory: string; policy: SlaPolicySummary | null; issues: string[];
};
export type EscalationRole = 'OPERATOR' | 'MANAGER';
export type SlaEscalation = {
  policyId: string; problemDomain: string; version: number; warningRoles: EscalationRole[]; breachRoles: EscalationRole[]; usesDefault: boolean;
};
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const listOperationalEventSlaPolicies = (signal?: AbortSignal) =>
  apiFetch<OperationalEventSlaPolicy[]>('/api/operational-event-types/sla-policies', { signal });
export const saveOperationalEventSlaPolicy = (eventTypeId: string, body: SlaTimingSave) =>
  apiFetch<OperationalEventSlaPolicy>(`/api/operational-event-types/${encodeURIComponent(eventTypeId)}/sla-policy`, json('PUT', body));
export const listTaskTypeSlaPolicies = (signal?: AbortSignal) =>
  apiFetch<TaskTypeSlaPolicy[]>('/api/task-types/sla-policies', { signal });
export const saveTaskTypeSlaPolicy = (taskTypeId: string, body: SlaTimingSave) =>
  apiFetch<TaskTypeSlaPolicy>(`/api/task-types/${encodeURIComponent(taskTypeId)}/sla-policy`, json('PUT', body));
export const getSlaEscalation = (policyId: string, signal?: AbortSignal) =>
  apiFetch<SlaEscalation>(`/api/sla-policies/${encodeURIComponent(policyId)}/escalation`, { signal });
export const saveSlaEscalation = (policyId: string, body: { expectedVersion: number; warningRoles: EscalationRole[]; breachRoles: EscalationRole[] }) =>
  apiFetch<SlaEscalation>(`/api/sla-policies/${encodeURIComponent(policyId)}/escalation`, json('PUT', body));

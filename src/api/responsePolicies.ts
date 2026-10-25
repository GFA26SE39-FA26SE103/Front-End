import { apiFetch } from './client';

export type PolicyPriority = 'WARNING' | 'CRITICAL';
export type AutomaticTaskPolicy = {
  actionId: string;
  isEnabled: boolean;
  actionType: 'CREATE_OPERATIONAL_TASK' | string;
  executionMode: 'AUTOMATIC' | string;
  title: string | null;
  instructions: string | null;
};
export type ResponsePolicy = {
  policyId: string;
  ruleId: string;
  eventPriority: PolicyPriority;
  isEnabled: boolean;
  version: number;
  updatedAt: string;
  action: AutomaticTaskPolicy | null;
  readyForAutomaticTask: boolean;
  issues: string[];
};
export type ResponsePolicySaveRequest = {
  isEnabled: boolean;
  expectedVersion: number | null;
  action: { isEnabled: boolean; title: string | null; instructions: string | null };
};

const id = encodeURIComponent;
const root = (ruleId: string) => `/api/monitoring-rules/${id(ruleId)}/response-policies`;

export const listResponsePolicies = (ruleId: string, signal?: AbortSignal) =>
  apiFetch<ResponsePolicy[]>(root(ruleId), { signal });

export const saveResponsePolicy = (ruleId: string, priority: PolicyPriority, request: ResponsePolicySaveRequest) =>
  apiFetch<ResponsePolicy>(`${root(ruleId)}/${priority}`, { method: 'PUT', body: JSON.stringify(request) });

export const deleteResponsePolicy = (ruleId: string, priority: PolicyPriority, expectedVersion: number) =>
  apiFetch<void>(`${root(ruleId)}/${priority}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) });

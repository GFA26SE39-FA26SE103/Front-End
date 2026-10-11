import { apiFetch } from './client';
import type { MapPoint, ZoneRecord } from './floors';

export type IncidentType = {
  incidentTypeId: string; code: string; name: string; description: string | null;
  sourceType: string; measurementType: string | null; status: string; supported: boolean;
  thresholdUnit: string | null; defaultWarningThreshold: number | null;
  defaultCriticalThreshold: number | null; unsupportedReason: string | null;
  measurementOptions?: { mode: string; unit: string; supported: boolean; reason: string | null; defaultWarningThreshold?: number | null; defaultCriticalThreshold?: number | null }[];
};
export type MonitoringRule = {
  incidentTypeId: string; warningThreshold: number; criticalThreshold: number;
  thresholdUnit: string; sustainSec: number; cooldownSec: number; enabled: boolean;
  parametersJson: string | null; ruleId?: string; incidentCode?: string; incidentName?: string;
};
export type MonitoringRequest = {
  name: string; confidenceThreshold: number; rules: MonitoringRule[]; expectedUpdatedAt?: string;
};
export type MonitoringConfiguration = {
  configId: string; zoneId: string; name: string; confidenceThreshold: number; status: string;
  createdByUserId: string; createdAt: string; updatedAt: string; rules: MonitoringRule[];
};
export type MonitoringIssue = { code: string; message: string };
export type MonitoringReview = {
  configuration: MonitoringConfiguration; zone: ZoneRecord;
  cameras: { cameraId: string; code: string; name: string; status: string; mappingStatus: string;
    roiPolygon: MapPoint[]; sourceType: string | null; protocol: string | null; isEnabled: boolean;
    lastTestResult: string | null; lastTestedAt: string | null; ready: boolean; issues: MonitoringIssue[] }[];
  issues: MonitoringIssue[]; warnings: string[]; canActivate: boolean;
};
const path = (zoneId: string) => `/api/zones/${encodeURIComponent(zoneId)}/monitoring`;
export const listIncidentTypes = (signal?: AbortSignal) => apiFetch<IncidentType[]>('/api/incident-types', { signal });
export const getMonitoring = (zoneId: string, signal?: AbortSignal) => apiFetch<MonitoringConfiguration>(path(zoneId), { signal });
export const saveMonitoring = (zoneId: string, body: MonitoringRequest) => apiFetch<MonitoringConfiguration>(path(zoneId), { method: 'PUT', body: JSON.stringify(body) });
export const deleteMonitoring = (zoneId: string, config: MonitoringConfiguration) => apiFetch<void>(path(zoneId), { method: 'DELETE', body: JSON.stringify({ configId: config.configId, expectedUpdatedAt: config.updatedAt }) });
export const reviewMonitoring = (zoneId: string) => apiFetch<MonitoringReview>(`${path(zoneId)}/review`);
export const setMonitoringActive = (zoneId: string, active: boolean, expectedUpdatedAt: string) => apiFetch<MonitoringConfiguration>(`${path(zoneId)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', body: JSON.stringify({ expectedUpdatedAt }) });

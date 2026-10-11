import { apiFetch } from './client';

export type MonitoringRuleRuntime = {
  ruleId: string; incidentCode: string; incidentName: string; mode: string; unit: string;
  warningThreshold: number; criticalThreshold: number; sustainSec: number; cooldownSec: number;
  metricValue: number | null; warningProgressMs: number; criticalProgressMs: number;
  cooldownRemainingSec: number; reason: string; incidentId: string | null; incidentSeverity: string | null;
};
export type MonitoringZoneRuntime = {
  zoneId: string; zoneName: string; configId: string | null; configVersion: string | null;
  configurationStatus: string; confidence: number; peopleCount: number | null; queueCount: number | null;
  rules: MonitoringRuleRuntime[]; issueCode: string | null;
};
export type CameraMonitoringRuntime = {
  cameraId: string; state: string; reason: string; errorCode: string | null; videoSourceType: string | null;
  sessionId: string | null; sourceElapsedMs: number | null; observedAt: string | null;
  isStale: boolean; annotationContext: string | null; zones: MonitoringZoneRuntime[];
};
export type IncidentFeedItem = {
  incidentId: string; zoneId: string; zoneName: string; incidentCode: string; incidentName: string;
  triggerCameraId: string | null; triggerCameraName: string | null; severity: string; status: string;
  title: string; createdAt: string; updatedAt: string; closedAt: string | null;
  metricValue: number | null; measurementMode: string | null; thresholdUnit: string | null;
  videoSourceType: string; isDemo: boolean;
};
export type IncidentFeed = { items: IncidentFeedItem[]; hasMore: boolean; nextCreatedAt: string | null; nextIncidentId: string | null };
export type IncidentFeedQuery = { limit?: number; afterCreatedAt?: string; afterIncidentId?: string; includeEnded?: boolean };
const path = (cameraId: string) => `/api/cameras/${encodeURIComponent(cameraId)}`;
export const getCameraMonitoringRuntime = (cameraId: string, signal?: AbortSignal) => apiFetch<CameraMonitoringRuntime>(`${path(cameraId)}/monitoring-runtime`, { signal });
export const getCameraIncidents = (cameraId: string, query: IncidentFeedQuery = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return apiFetch<IncidentFeed>(`${path(cameraId)}/incidents${params.size ? '?' + params : ''}`, { signal });
};

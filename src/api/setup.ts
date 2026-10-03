import { apiFetch } from './client';
import type { MonitoringReview, MonitoringIssue } from './monitoring';
type MonitoringCameraView = MonitoringReview['cameras'][number];

export type SetupZone = {
  zoneId: string; code: string; name: string; status: string;
  configuration: { configId: string; name: string; status: string; ruleCount: number; enabledRuleCount: number } | null;
  setupReady: boolean; canActivate: boolean; cameras: MonitoringCameraView[]; issues: MonitoringIssue[]; warnings: string[];
};
export type SetupFloor = { floorId: string; floorNumber: number; name: string; hasMap: boolean; zones: SetupZone[] };
export type SetupCamera = {
  cameraId: string; floorId: string; floorName: string; code: string; name: string; status: string;
  healthStatus: string; lastSeenAt: string | null; hasConnection: boolean; connectionValid: boolean; isEnabled: boolean;
  sourceType: string | null; protocol: string | null; lastTestResult: string | null; lastTestedAt: string | null; issues: MonitoringIssue[];
};
export type SetupOverview = {
  generatedAt: string; hasDefaultStore: boolean;
  totals: { floorCount: number; zoneCount: number; cameraCount: number; configuredZoneCount: number;
    activeConfigurationCount: number; readyToActivateCount: number; onlineCameraCount: number; enabledCameraCount: number; unresolvedHealthEventCount: number };
  steps: { code: string; name: string; completed: number; total: number; description: string }[];
  floors: SetupFloor[]; cameras: SetupCamera[];
  healthEvents: { healthEventId: string; cameraId: string; cameraCode: string; eventType: string; status: string; detectedAt: string }[];
};
export const getSetupOverview = (signal?: AbortSignal) => apiFetch<SetupOverview>('/api/setup/overview', { signal });
export const checkCameraHealth = (cameraId: string, signal?: AbortSignal) => apiFetch<unknown>(`/api/cameras/${encodeURIComponent(cameraId)}/health/check`, { method: 'POST', signal });

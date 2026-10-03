import { apiFetch } from './client';
import type { MapPoint } from './floors';
export { listFloors, listSupermarkets, listZones } from './floors';
export type { FloorRecord, MapPoint, SupermarketRecord, ZoneRecord } from './floors';

export type CameraZoneMapping = {
  cameraZoneId: string;
  cameraId: string;
  zoneId: string;
  roiPolygon: MapPoint[];
  status: string;
};

export type CameraMappingRequest = {
  roiPolygon: MapPoint[];
  status: 'ACTIVE' | 'INACTIVE';
};

export type CameraRecord = {
  cameraId: string;
  floorId: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installedAt: string | null;
  warrantyExpiresAt: string | null;
  mapX: number | null;
  mapY: number | null;
  mapRotationDeg: number | null;
  status: string;
  healthStatus: string;
  lastSeenAt: string | null;
};

export type CreateCameraRequest = {
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installedAt: string;
  warrantyExpiresAt: string;
  mapX: number | null;
  mapY: number | null;
  mapRotationDeg: number | null;
  status: string;
};

export type ConfigureConnectionRequest = {
  sourceType: 'LIVE';
  protocol: 'HTTP';
  streamUri: string;
  snapshotUri: string | null;
  username: string | null;
  password: string | null;
};

export type CameraConnection = {
  cameraId: string;
  sourceType: string;
  protocol: string;
  streamUri: string;
  hasCredentials: boolean;
  isEnabled: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  lastTestMessage: string | null;
};

export type AiPreviewState = 'STOPPED' | 'STARTING' | 'LIVE' | 'RECONNECTING' | 'ERROR' | 'COMPLETED';

export const uploadRecordedVideo = (cameraId: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<{ cameraId: string; sourceType: 'RECORDED'; protocol: 'FILE' }>(`/api/cameras/${cameraId}/recorded-video`, { method: 'POST', body, timeoutMs: 0 });
};

export type AiPreviewStatus = {
  cameraId: string;
  state: AiPreviewState;
  startedAt: string | null;
  updatedAt: string;
  frameSequence: number;
  errorCode: string | null;
  sessionId?: string | null;
  purpose?: 'PREVIEW' | 'MONITORING';
  configurationFingerprint?: string | null;
  annotationContext?: string | null;
};

export const listCameras = (floorId: string, signal?: AbortSignal) =>
  apiFetch<CameraRecord[]>(`/api/floors/${floorId}/cameras`, { signal });

export const createCamera = (floorId: string, body: CreateCameraRequest) =>
  apiFetch<CameraRecord>(`/api/floors/${floorId}/cameras`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateCamera = (cameraId: string, body: CreateCameraRequest) =>
  apiFetch<CameraRecord>(`/api/cameras/${cameraId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const configureCameraConnection = (cameraId: string, body: ConfigureConnectionRequest) =>
  apiFetch<CameraConnection>(`/api/cameras/${cameraId}/connection`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const getCamera = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<CameraRecord>(`/api/cameras/${cameraId}`, { signal });

export const getCameraPreview = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<Blob>(`/api/cameras/${cameraId}/preview`, { signal, responseType: 'blob' });

export const listCameraMappings = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<CameraZoneMapping[]>(`/api/cameras/${cameraId}/zones`, { signal });

export const saveCameraMapping = (cameraId: string, zoneId: string, body: CameraMappingRequest) =>
  apiFetch<CameraZoneMapping>(`/api/cameras/${cameraId}/zones/${zoneId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const removeCameraMapping = (cameraId: string, zoneId: string) =>
  apiFetch<void>(`/api/cameras/${cameraId}/zones/${zoneId}`, { method: 'DELETE' });

export const getCameraConnection = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<CameraConnection>(`/api/cameras/${cameraId}/connection`, { signal });

export const testCameraConnection = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<CameraConnection>(`/api/cameras/${cameraId}/connection/test`, { method: 'POST', signal });

export const enableCameraConnection = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<CameraConnection>(`/api/cameras/${cameraId}/connection/enable`, { method: 'POST', signal });

export const startAiPreview = (cameraId: string, signal?: AbortSignal, zoneId?: string) =>
  apiFetch<AiPreviewStatus>(`/api/cameras/${cameraId}/ai-preview/start${zoneId ? '?zoneId=' + encodeURIComponent(zoneId) : ''}`, { method: 'POST', signal });

export const getAiPreviewStatus = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<AiPreviewStatus>(`/api/cameras/${cameraId}/ai-preview/status`, { signal });

export type SequencedAiFrame = { blob: Blob; frameSequence: number; sessionId: string };

export const getAiPreviewFrame = async (cameraId: string, signal?: AbortSignal, afterSequence = 0, afterSessionId: string | null = null): Promise<SequencedAiFrame | null> => {
  const query = new URLSearchParams({ afterSequence: String(afterSequence) });
  if (afterSessionId) query.set('afterSessionId', afterSessionId);
  return (await apiFetch<SequencedAiFrame | undefined>(`/api/cameras/${cameraId}/ai-preview/frame/next?${query}`, { signal, responseType: 'sequenced-frame' })) ?? null;
};

export const stopAiPreview = (cameraId: string) =>
  apiFetch<AiPreviewStatus>(`/api/cameras/${cameraId}/ai-preview/stop`, { method: 'POST' });

import { apiFetch } from './client';
import type { MapPoint } from './floors';

export type CheckoutCounter = {
  checkoutCounterId: string;
  zoneId: string;
  code: string;
  name: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CheckoutMapping = {
  mappingId: string;
  cameraId: string;
  checkoutCounterId: string;
  laneRoi: MapPoint[];
  staffRoi: MapPoint[];
  isEnabled: boolean;
  isQueueSource: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CheckoutCounterRequest = {
  code: string;
  name: string;
  isEnabled: boolean;
  expectedUpdatedAt?: string;
};

export type CheckoutMappingRequest = {
  laneRoi: MapPoint[];
  staffRoi: MapPoint[];
  isEnabled: boolean;
  isQueueSource: boolean;
  expectedUpdatedAt?: string;
};

// Concurrency tokens must retain the backend's sub-millisecond precision and offset.
const expectedUpdatedAtQuery = (expectedUpdatedAt?: string) => expectedUpdatedAt === undefined
  ? ''
  : `?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`;

export const listCheckoutCounters = (zoneId: string, signal?: AbortSignal) =>
  apiFetch<CheckoutCounter[]>(`/api/zones/${encodeURIComponent(zoneId)}/checkout-counters`, { signal });

export const createCheckoutCounter = (zoneId: string, request: CheckoutCounterRequest) =>
  apiFetch<CheckoutCounter>(`/api/zones/${encodeURIComponent(zoneId)}/checkout-counters`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

export const updateCheckoutCounter = (counterId: string, request: CheckoutCounterRequest) =>
  apiFetch<CheckoutCounter>(`/api/checkout-counters/${encodeURIComponent(counterId)}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  });

export const deleteCheckoutCounter = (counterId: string, expectedUpdatedAt?: string) =>
  apiFetch<void>(`/api/checkout-counters/${encodeURIComponent(counterId)}${expectedUpdatedAtQuery(expectedUpdatedAt)}`, {
    method: 'DELETE',
  });

export const listCameraCheckoutMappings = (cameraId: string, signal?: AbortSignal) =>
  apiFetch<CheckoutMapping[]>(`/api/cameras/${encodeURIComponent(cameraId)}/checkout-mappings`, { signal });

export const listCounterCheckoutMappings = (counterId: string, signal?: AbortSignal) =>
  apiFetch<CheckoutMapping[]>(`/api/checkout-counters/${encodeURIComponent(counterId)}/camera-mappings`, { signal });

export const saveCheckoutMapping = (counterId: string, cameraId: string, request: CheckoutMappingRequest) =>
  apiFetch<CheckoutMapping>(`/api/checkout-counters/${encodeURIComponent(counterId)}/camera-mappings/${encodeURIComponent(cameraId)}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  });

export const deleteCheckoutMapping = (counterId: string, cameraId: string, expectedUpdatedAt?: string) =>
  apiFetch<void>(`/api/checkout-counters/${encodeURIComponent(counterId)}/camera-mappings/${encodeURIComponent(cameraId)}${expectedUpdatedAtQuery(expectedUpdatedAt)}`, {
    method: 'DELETE',
  });

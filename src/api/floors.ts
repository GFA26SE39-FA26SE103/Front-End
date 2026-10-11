import { apiFetch } from './client';

export type SupermarketRecord = {
  supermarketId: string;
  code: string;
  name: string;
  address: string | null;
  status: string;
};

export type FloorRecord = {
  floorId: string;
  supermarketId: string;
  floorNumber: number;
  name: string;
  mapAssetUrl: string | null;
  mapWidth: number | null;
  mapHeight: number | null;
  status: string;
};

export type MapPoint = { x: number; y: number };

export type ZoneRecord = {
  zoneId: string;
  floorId: string;
  code: string;
  name: string;
  zoneType: string | null;
  mapPolygon: MapPoint[];
  colorHex: string | null;
  areaM2: number | null;
  status: string;
  updatedAt: string;
};

export type ZoneRequest = {
  code: string;
  name: string;
  zoneType: string | null;
  mapPolygon: MapPoint[];
  status: string;
  colorHex: string | null;
  areaM2: number | null;
};

export type FloorMapView = {
  floorId: string;
  mapUrl: string;
  mapWidth: number | null;
  mapHeight: number | null;
  contentType: string;
  updatedAt: string;
};
export type FloorDetailsRequest = { floorNumber: number; name: string };
export const createFloor = (storeId: string, body: FloorDetailsRequest, signal?: AbortSignal) =>
  apiFetch<FloorRecord>(`/api/supermarkets/${encodeURIComponent(storeId)}/floors`, { method: 'POST', body: JSON.stringify({ ...body, mapAssetUrl: null, mapWidth: null, mapHeight: null }), signal });
export const updateFloorDetails = (floorId: string, body: FloorDetailsRequest, signal?: AbortSignal) =>
  apiFetch<FloorRecord>(`/api/floors/${encodeURIComponent(floorId)}/details`, { method: 'PATCH', body: JSON.stringify(body), signal });

export const listSupermarkets = (signal?: AbortSignal) =>
  apiFetch<SupermarketRecord[]>('/api/supermarkets', { signal });

export const listFloors = (supermarketId: string, signal?: AbortSignal) =>
  apiFetch<FloorRecord[]>(`/api/supermarkets/${supermarketId}/floors`, { signal });

export const listZones = (floorId: string, signal?: AbortSignal) =>
  apiFetch<ZoneRecord[]>(`/api/floors/${floorId}/zones`, { signal });

export const createZone = (floorId: string, body: ZoneRequest) =>
  apiFetch<ZoneRecord>(`/api/floors/${floorId}/zones`, { method: 'POST', body: JSON.stringify(body) });

export const updateZone = (zoneId: string, body: ZoneRequest) =>
  apiFetch<ZoneRecord>(`/api/zones/${zoneId}`, { method: 'PATCH', body: JSON.stringify(body) });

export const uploadFloorMap = (floorId: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  // Cloud upload and post-commit cleanup can each use the configured backend timeout (up to 120s).
  return apiFetch<FloorMapView>(`/api/floors/${floorId}/map`, { method: 'POST', body, timeoutMs: 300000 });
};

export const getFloorMap = (floorId: string, signal?: AbortSignal) =>
  apiFetch<Blob>(`/api/floors/${floorId}/map`, { signal, responseType: 'blob', timeoutMs: 150000 });

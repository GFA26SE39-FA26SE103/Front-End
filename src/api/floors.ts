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
  status: string;
};

export type FloorMapView = {
  floorId: string;
  mapUrl: string;
  mapWidth: number | null;
  mapHeight: number | null;
  contentType: string;
  updatedAt: string;
};

export const listSupermarkets = (signal?: AbortSignal) =>
  apiFetch<SupermarketRecord[]>('/api/supermarkets', { signal });

export const listFloors = (supermarketId: string, signal?: AbortSignal) =>
  apiFetch<FloorRecord[]>(`/api/supermarkets/${supermarketId}/floors`, { signal });

export const listZones = (floorId: string, signal?: AbortSignal) =>
  apiFetch<ZoneRecord[]>(`/api/floors/${floorId}/zones`, { signal });

export const uploadFloorMap = (floorId: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<FloorMapView>(`/api/floors/${floorId}/map`, { method: 'POST', body });
};

export const getFloorMap = (floorId: string, signal?: AbortSignal) =>
  apiFetch<Blob>(`/api/floors/${floorId}/map`, { signal, responseType: 'blob' });

import { useEffect, useState } from 'react';
import { listCameraMappings, listCameras, type CameraRecord, type CameraZoneMapping } from '../../api/cameras';
import { ApiError } from '../../api/client';
import { getFloorMap, listFloors, listSupermarkets, listZones, type FloorRecord, type SupermarketRecord, type ZoneRecord } from '../../api/floors';
import type { Tone } from '../../components/ui';

export type FloorMapState =
  | { status: 'idle' | 'loading' | 'missing'; url: null; contentType: null }
  | { status: 'ready'; url: string; contentType: string }
  | { status: 'error'; url: null; contentType: null; message: string };

export type FloorDetails = {
  zones: ZoneRecord[];
  cameras: CameraRecord[];
  mappings: CameraZoneMapping[];
};

export type CoverageStatus = 'covered' | 'degraded' | 'offline' | 'uncovered' | 'inactive';

export type ZoneCoverage = {
  status: CoverageStatus;
  cameraCount: number;
  onlineCount: number;
};

export const COVERAGE: Record<CoverageStatus, { label: string; tone: Tone }> = {
  covered: { label: 'Live coverage', tone: 'success' },
  degraded: { label: 'Partial coverage', tone: 'warning' },
  offline: { label: 'No live camera', tone: 'danger' },
  uncovered: { label: 'No camera', tone: 'neutral' },
  inactive: { label: 'Inactive', tone: 'neutral' },
};

export async function loadStoreFloors(signal: AbortSignal): Promise<{ stores: SupermarketRecord[]; floors: FloorRecord[] }> {
  const stores = await listSupermarkets(signal);
  const floors = (await Promise.all(stores.map((store) => listFloors(store.supermarketId, signal)))).flat();
  return { stores, floors: [...floors].sort((a, b) => a.floorNumber - b.floorNumber) };
}

export async function loadFloorDetails(floorId: string, signal: AbortSignal): Promise<FloorDetails> {
  const [zones, cameras] = await Promise.all([listZones(floorId, signal), listCameras(floorId, signal)]);
  const mappings = (await Promise.all(cameras.map((camera) => listCameraMappings(camera.cameraId, signal)))).flat();
  return { zones, cameras, mappings };
}

export const isCameraLive = (camera: CameraRecord) => camera.status === 'ACTIVE' && camera.healthStatus === 'ONLINE';

export function camerasForZone(zoneId: string, cameras: CameraRecord[], mappings: CameraZoneMapping[]) {
  const ids = new Set(mappings.filter((m) => m.zoneId === zoneId && m.status === 'ACTIVE').map((m) => m.cameraId));
  return cameras.filter((camera) => ids.has(camera.cameraId));
}

export function zonesForCamera(cameraId: string, zones: ZoneRecord[], mappings: CameraZoneMapping[]) {
  const ids = new Set(mappings.filter((m) => m.cameraId === cameraId && m.status === 'ACTIVE').map((m) => m.zoneId));
  return zones.filter((zone) => ids.has(zone.zoneId));
}

export function zoneCoverage(zone: ZoneRecord, cameras: CameraRecord[], mappings: CameraZoneMapping[]): ZoneCoverage {
  const covering = camerasForZone(zone.zoneId, cameras, mappings);
  const onlineCount = covering.filter(isCameraLive).length;
  const cameraCount = covering.length;
  let status: CoverageStatus;
  if (zone.status !== 'ACTIVE') status = 'inactive';
  else if (cameraCount === 0) status = 'uncovered';
  else if (onlineCount === cameraCount) status = 'covered';
  else if (onlineCount === 0) status = 'offline';
  else status = 'degraded';
  return { status, cameraCount, onlineCount };
}

export function healthTone(camera: CameraRecord): Tone {
  if (camera.status !== 'ACTIVE') return 'neutral';
  if (camera.healthStatus === 'ONLINE') return 'success';
  if (camera.healthStatus === 'OFFLINE' || camera.healthStatus === 'ERROR') return 'danger';
  return 'warning';
}

export function healthLabel(camera: CameraRecord) {
  if (camera.status !== 'ACTIVE') return camera.status === 'DISABLED' ? 'Disabled' : 'Inactive';
  if (camera.healthStatus === 'ONLINE') return 'Online';
  if (camera.healthStatus === 'OFFLINE') return 'Offline';
  if (camera.healthStatus === 'ERROR') return 'Error';
  return 'Not checked';
}

export function formatSeen(value: string | null) {
  if (!value) return 'Never';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'Unknown';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}

export function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/** Loads the authenticated floor-plan asset as a Blob URL and revokes it when the floor changes. */
export function useFloorMap(floor: FloorRecord | null): FloorMapState {
  const floorId = floor?.floorId ?? null;
  const mapAssetUrl = floor?.mapAssetUrl ?? null;
  const key = floorId && mapAssetUrl ? `${floorId}|${mapAssetUrl}` : null;
  const [loaded, setLoaded] = useState<{ key: string; state: FloorMapState } | null>(null);

  useEffect(() => {
    if (!key || !floorId || !mapAssetUrl) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const blob = await getFloorMap(floorId, controller.signal);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ key, state: { status: 'ready', url: objectUrl, contentType: blob.type || mapTypeFromUrl(mapAssetUrl) } });
      } catch (reason) {
        if (controller.signal.aborted) return;
        const state: FloorMapState = reason instanceof ApiError && reason.status === 404
          ? { status: 'missing', url: null, contentType: null }
          : { status: 'error', url: null, contentType: null, message: messageOf(reason, 'Could not load the floor plan.') };
        setLoaded({ key, state });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, floorId, mapAssetUrl]);

  if (!floorId) return { status: 'idle', url: null, contentType: null };
  if (!mapAssetUrl) return { status: 'missing', url: null, contentType: null };
  return loaded?.key === key ? loaded.state : { status: 'loading', url: null, contentType: null };
}

function mapTypeFromUrl(url: string) {
  const path = url.split('?', 1)[0].toLowerCase();
  if (path.endsWith('.pdf')) return 'application/pdf';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

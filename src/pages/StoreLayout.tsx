import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { listCameras, updateCamera, type CameraRecord, type CreateCameraRequest } from '../api/cameras';
import { ApiError } from '../api/client';
import {
  getFloorMap,
  listFloors,
  listSupermarkets,
  listZones,
  uploadFloorMap,
  type FloorRecord,
  type SupermarketRecord,
  type ZoneRecord,
} from '../api/floors';
import { AdminLayout } from '../components/AdminLayout';
import { CameraRegistration } from '../components/CameraRegistration';
import { FloorPlanSurface, type PlacementChange } from '../components/FloorPlanSurface';
import { Icon } from '../components/Icon';
import { Button, Callout, Card, CardHeader, Chip, Overline } from '../components/ui';
import s from './StoreLayout.module.css';

const MAX_MAP_BYTES = 20 * 1024 * 1024;
const SUPPORTED_MAP_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf']);

type MapState =
  | { status: 'idle' | 'loading' | 'missing'; url: null; contentType: null; message?: string }
  | { status: 'ready'; url: string; contentType: string }
  | { status: 'error'; url: null; contentType: null; message: string };

const initialMapState: MapState = { status: 'idle', url: null, contentType: null };

export default function StoreLayout() {
  const [stores, setStores] = useState<SupermarketRecord[]>([]);
  const [floors, setFloors] = useState<FloorRecord[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PlacementChange>>({});
  const [mapState, setMapState] = useState<MapState>(initialMapState);
  const [mapVersion, setMapVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const loadedStores = await listSupermarkets(controller.signal);
        const loadedFloors = (await Promise.all(loadedStores.map((store) => listFloors(store.supermarketId, controller.signal)))).flat();
        if (controller.signal.aborted) return;
        setStores(loadedStores);
        setFloors(loadedFloors);
        setSelectedFloorId((current) => loadedFloors.some((floor) => floor.floorId === current) ? current : loadedFloors[0]?.floorId ?? null);
      } catch (reason) {
        if (!controller.signal.aborted) setLoadError(messageOf(reason, 'Could not load the store layout.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedFloorId) return;
    const controller = new AbortController();
    void (async () => {
      setDetailsLoading(true);
      setLoadError('');
      try {
        const [loadedZones, loadedCameras] = await Promise.all([
          listZones(selectedFloorId, controller.signal),
          listCameras(selectedFloorId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setZones(loadedZones);
        setCameras(loadedCameras);
        setDrafts({});
        setSelectedCameraId((current) => loadedCameras.some((camera) => camera.cameraId === current) ? current : loadedCameras[0]?.cameraId ?? null);
      } catch (reason) {
        if (!controller.signal.aborted) setLoadError(messageOf(reason, 'Could not load floor details.'));
      } finally {
        if (!controller.signal.aborted) setDetailsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selectedFloorId]);

  const selectedFloor = floors.find((floor) => floor.floorId === selectedFloorId) ?? null;

  useEffect(() => {
    if (!selectedFloorId || !selectedFloor?.mapAssetUrl) return;
    const controller = new AbortController();
    const mapAssetUrl = selectedFloor.mapAssetUrl;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const blob = await getFloorMap(selectedFloorId, controller.signal);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setMapState({ status: 'ready', url: objectUrl, contentType: blob.type || mapTypeFromUrl(mapAssetUrl) });
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 404) setMapState({ status: 'missing', url: null, contentType: null });
        else setMapState({ status: 'error', url: null, contentType: null, message: messageOf(reason, 'Could not load the floor plan.') });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mapVersion, selectedFloor?.mapAssetUrl, selectedFloorId]);

  const displayedCameras = useMemo(() => cameras.map((camera) => {
    const draft = drafts[camera.cameraId];
    return draft ? { ...camera, mapX: draft.x, mapY: draft.y, mapRotationDeg: draft.rotationDeg } : camera;
  }), [cameras, drafts]);
  const selectedCamera = cameras.find((camera) => camera.cameraId === selectedCameraId) ?? null;
  const selectedDraft = selectedCameraId ? drafts[selectedCameraId] : undefined;
  const dirtyCameraIds = useMemo(() => new Set(Object.keys(drafts)), [drafts]);
  const storeName = stores.find((store) => store.supermarketId === selectedFloor?.supermarketId)?.name ?? stores[0]?.name;

  const selectFloor = (floorId: string) => {
    setSelectedFloorId(floorId);
    setMapState(initialMapState);
    setActionError('');
    setActionMessage('');
    setRegistrationOpen(false);
  };

  const uploadMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedFloorId) return;
    setActionError('');
    setActionMessage('');
    if (!SUPPORTED_MAP_TYPES.has(file.type)) return setActionError('Choose a PNG, JPEG, or PDF floor plan.');
    if (file.size <= 0 || file.size > MAX_MAP_BYTES) return setActionError('Choose a non-empty floor plan of at most 20 MB.');
    setUploading(true);
    try {
      const result = await uploadFloorMap(selectedFloorId, file);
      setFloors((all) => all.map((floor) => floor.floorId === selectedFloorId ? {
        ...floor,
        mapAssetUrl: result.mapUrl,
        mapWidth: result.mapWidth,
        mapHeight: result.mapHeight,
      } : floor));
      setMapState({ status: 'loading', url: null, contentType: null });
      setMapVersion((value) => value + 1);
      setActionMessage('Floor plan uploaded.');
    } catch (reason) {
      setActionError(messageOf(reason, 'Could not upload the floor plan.'));
    } finally {
      setUploading(false);
    }
  };

  const changePlacement = (cameraId: string, placement: PlacementChange) => {
    setSelectedCameraId(cameraId);
    setDrafts((current) => ({ ...current, [cameraId]: placement }));
    setActionError('');
    setActionMessage('');
  };

  const savePlacement = async () => {
    if (!selectedCamera || !selectedDraft) return;
    if (!selectedCamera.installedAt || !selectedCamera.warrantyExpiresAt) {
      setActionError('This camera is missing installation or warranty metadata and cannot be updated safely.');
      return;
    }
    const request: CreateCameraRequest = {
      code: selectedCamera.code,
      name: selectedCamera.name,
      manufacturer: selectedCamera.manufacturer,
      model: selectedCamera.model,
      serialNumber: selectedCamera.serialNumber,
      installedAt: selectedCamera.installedAt,
      warrantyExpiresAt: selectedCamera.warrantyExpiresAt,
      mapX: selectedDraft.x,
      mapY: selectedDraft.y,
      mapRotationDeg: selectedDraft.rotationDeg,
      status: selectedCamera.status,
    };
    setSaving(true);
    setActionError('');
    setActionMessage('');
    try {
      const saved = await updateCamera(selectedCamera.cameraId, request);
      setCameras((all) => all.map((camera) => camera.cameraId === saved.cameraId ? saved : camera));
      setDrafts((current) => {
        const next = { ...current };
        delete next[saved.cameraId];
        return next;
      });
      setActionMessage('Camera placement saved.');
    } catch (reason) {
      setActionError(messageOf(reason, 'Could not save camera placement.'));
    } finally {
      setSaving(false);
    }
  };

  const cameraRegistered = (camera: CameraRecord) => {
    if (camera.floorId !== selectedFloorId) {
      selectFloor(camera.floorId);
      return;
    }
    setCameras((all) => [...all.filter((item) => item.cameraId !== camera.cameraId), camera]);
    setSelectedCameraId(camera.cameraId);
    setDrafts((current) => ({ ...current, [camera.cameraId]: { x: 0.5, y: 0.5, rotationDeg: 0 } }));
    setRegistrationOpen(false);
    setActionMessage('Camera created. Place it on the map, then save its placement.');
  };

  const subtitle = loading
    ? 'Loading store configuration…'
    : `${storeName ?? 'No supermarket'} · ${floors.length} floor${floors.length === 1 ? '' : 's'} · ${cameras.length} camera${cameras.length === 1 ? '' : 's'} on selected floor`;

  return (
    <AdminLayout title="Store layout" subtitle={subtitle}>
      <Card className={s.structure}>
        <CardHeader title="Store structure" subtitle="Configuration loaded from the backend" />
        {loading ? <p className={s.state}>Loading floors…</p> : floors.length === 0 ? (
          <Callout tone="warning" icon="alert-warning">Create a supermarket and floor before uploading a floor plan.</Callout>
        ) : (
          <div className={s.floorList} aria-label="Floors">
            {floors.map((floor) => (
              <button
                key={floor.floorId}
                className={`${s.floorRow} ${selectedFloorId === floor.floorId ? s.activeRow : ''}`}
                aria-pressed={selectedFloorId === floor.floorId}
                onClick={() => selectFloor(floor.floorId)}
              >
                <Icon name="layers" size={14} />
                <span><strong>{floor.name || `Floor ${floor.floorNumber}`}</strong><small>Floor {floor.floorNumber}</small></span>
                <Chip tone={floor.mapAssetUrl ? 'success' : 'neutral'}>{floor.mapAssetUrl ? 'Map' : 'No map'}</Chip>
              </button>
            ))}
          </div>
        )}

        <Overline>CAMERAS ON THIS FLOOR</Overline>
        <div className={s.cameraList}>
          {detailsLoading ? <p className={s.state}>Loading cameras…</p> : displayedCameras.map((camera) => (
            <button
              key={camera.cameraId}
              className={`${s.cameraRow} ${selectedCameraId === camera.cameraId ? s.activeRow : ''}`}
              onClick={() => setSelectedCameraId(camera.cameraId)}
              aria-pressed={selectedCameraId === camera.cameraId}
            >
              <Icon name="tree-camera" size={14} />
              <span><strong>{camera.code}</strong><small>{camera.name}</small></span>
              {drafts[camera.cameraId] && <i>Unsaved</i>}
            </button>
          ))}
          {!detailsLoading && cameras.length === 0 && <p className={s.state}>No cameras registered on this floor.</p>}
        </div>
        <Button variant="secondary" icon="plus-primary" block disabled={!selectedFloor} onClick={() => setRegistrationOpen((open) => !open)}>
          {registrationOpen ? 'Close camera form' : 'Add camera'}
        </Button>

        <div className={s.source}>
          <Overline>FLOOR PLAN SOURCE</Overline>
          <p className={s.sourceName}>{selectedFloor?.mapAssetUrl ? 'Authenticated uploaded asset' : 'No floor plan uploaded'}</p>
          {selectedFloor?.mapWidth && selectedFloor.mapHeight && <p className={s.meta}>{selectedFloor.mapWidth} × {selectedFloor.mapHeight} px</p>}
          <input
            ref={fileInput}
            className={s.fileInput}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            aria-label="Upload floor plan"
            disabled={!selectedFloor || uploading}
            onChange={uploadMap}
          />
          <Button variant="secondary" icon="upload" block disabled={!selectedFloor || uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? 'Uploading…' : selectedFloor?.mapAssetUrl ? 'Replace floor plan' : 'Upload floor plan'}
          </Button>
          <p className={s.meta}>PNG, JPEG, or PDF · maximum 20 MB</p>
        </div>
      </Card>

      <div className={s.workspace}>
        {registrationOpen && selectedFloor && (
          <CameraRegistration
            floors={[{ id: selectedFloor.floorId, key: `F${selectedFloor.floorNumber}`, label: selectedFloor.name }]}
            onCancel={() => setRegistrationOpen(false)}
            onRegistered={cameraRegistered}
          />
        )}
        <Card className={s.canvas}>
          <div className={s.canvasHeader}>
            <CardHeader
              title={selectedFloor?.name ?? 'Floor plan'}
              subtitle="Drag the camera body. Use the amber handle to align its muzzle and field of view."
            />
            {selectedFloor && <Chip tone="neutral">{zones.length} zones</Chip>}
          </div>
          {mapState.status === 'ready' ? (
            <FloorPlanSurface
              mapUrl={mapState.url}
              mapContentType={mapState.contentType}
              cameras={displayedCameras}
              selectedCameraId={selectedCameraId}
              dirtyCameraIds={dirtyCameraIds}
              onSelectCamera={setSelectedCameraId}
              onChangePlacement={changePlacement}
            />
          ) : mapState.status === 'loading' || (mapState.status === 'idle' && Boolean(selectedFloor?.mapAssetUrl)) ? (
            <div className={s.emptyPlan}><Icon name="scan" size={20} /><p>Loading floor plan…</p></div>
          ) : mapState.status === 'error' ? (
            <div className={s.emptyPlan}><p role="alert">{mapState.message}</p><Button variant="secondary" onClick={() => { setMapState({ status: 'loading', url: null, contentType: null }); setMapVersion((value) => value + 1); }}>Retry</Button></div>
          ) : (
            <div className={s.emptyPlan}>
              <Icon name="upload" size={20} />
              <p>Upload a floor plan before positioning cameras.</p>
              <Button variant="secondary" icon="upload" disabled={!selectedFloor} onClick={() => fileInput.current?.click()}>Upload floor plan</Button>
            </div>
          )}
        </Card>
      </div>

      <Card className={s.props}>
        <CardHeader title="Camera placement" subtitle="Normalized coordinates persist across screen sizes" />
        {selectedCamera ? (
          <>
            <div className={s.cameraTitle}>
              <Icon name="camera-row" size={17} />
              <div><strong>{selectedCamera.code}</strong><small>{selectedCamera.name}</small></div>
              <Chip tone={selectedCamera.healthStatus === 'ONLINE' ? 'success' : 'neutral'}>{selectedCamera.healthStatus}</Chip>
            </div>
            <dl className={s.coordinates}>
              <div><dt>X position</dt><dd>{formatPosition(selectedDraft?.x ?? selectedCamera.mapX)}</dd></div>
              <div><dt>Y position</dt><dd>{formatPosition(selectedDraft?.y ?? selectedCamera.mapY)}</dd></div>
              <div><dt>Direction</dt><dd>{Math.round(selectedDraft?.rotationDeg ?? selectedCamera.mapRotationDeg ?? 0)}°</dd></div>
            </dl>
            <Callout tone="info" icon="info">Arrow keys move the selected camera by 1%. Shift + arrow moves it by 5%. The rotation handle also supports left/right arrows.</Callout>
            {selectedDraft && <p className={s.unsaved}>Unsaved placement</p>}
            <div className={s.actions}>
              <Button variant="secondary" disabled={!selectedDraft || saving} onClick={() => setDrafts((current) => {
                const next = { ...current };
                delete next[selectedCamera.cameraId];
                return next;
              })}>Reset</Button>
              <Button disabled={!selectedDraft || saving} onClick={() => void savePlacement()}>{saving ? 'Saving…' : 'Save placement'}</Button>
            </div>
            <p className={s.meta}>Saving placement does not test, enable, or start monitoring for this camera.</p>
          </>
        ) : <p className={s.state}>Select a camera, or add one to this floor.</p>}
        {loadError && <p className={s.error} role="alert">{loadError}</p>}
        {actionError && <p className={s.error} role="alert">{actionError}</p>}
        {actionMessage && <p className={s.success} role="status">{actionMessage}</p>}
      </Card>
    </AdminLayout>
  );
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function formatPosition(value: number | null | undefined) {
  return value == null ? 'Not placed' : `${(value * 100).toFixed(1)}%`;
}

function mapTypeFromUrl(url: string) {
  const path = url.split('?', 1)[0].toLowerCase();
  if (path.endsWith('.pdf')) return 'application/pdf';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

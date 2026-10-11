import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCameraPreview, listCameras, type CameraRecord } from '../../api/cameras';
import type { FloorRecord, ZoneRecord } from '../../api/floors';
import { FloorPlanView } from '../../components/FloorPlanView';
import { OperatorLayout } from '../../components/OperatorLayout';
import { Button, Chip, Overline } from '../../components/ui';
import {
  COVERAGE,
  formatSeen,
  healthLabel,
  healthTone,
  loadFloorDetails,
  loadStoreFloors,
  messageOf,
  useFloorMap,
  zoneCoverage,
  zonesForCamera,
  type FloorDetails,
} from './operatorData';
import s from './OperatorFloorMap.module.css';

const HEALTH_REFRESH_MS = 30_000;
const emptyDetails: FloorDetails = { zones: [], cameras: [], mappings: [] };

export default function OperatorFloorMap() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [storeName, setStoreName] = useState('');
  const [floors, setFloors] = useState<FloorRecord[] | null>(null);
  const [loaded, setLoaded] = useState<{ floorId: string; details: FloorDetails } | null>(null);
  const [error, setError] = useState('');
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const selectedFloorId = params.get('floor') ?? floors?.[0]?.floorId ?? null;
  const selectedFloor = floors?.find((floor) => floor.floorId === selectedFloorId) ?? null;
  const details = loaded?.floorId === selectedFloorId ? loaded.details : emptyDetails;
  const loading = floors === null || (selectedFloorId !== null && loaded?.floorId !== selectedFloorId && !error);
  const map = useFloorMap(selectedFloor);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { stores, floors: loadedFloors } = await loadStoreFloors(controller.signal);
        if (controller.signal.aborted) return;
        setStoreName(stores[0]?.name ?? '');
        setFloors(loadedFloors);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(messageOf(reason, 'Could not load the store floors.'));
          setFloors([]);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedFloorId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const floorDetails = await loadFloorDetails(selectedFloorId, controller.signal);
        if (controller.signal.aborted) return;
        setLoaded({ floorId: selectedFloorId, details: floorDetails });
        setError('');
      } catch (reason) {
        if (!controller.signal.aborted) setError(messageOf(reason, 'Could not load zones and cameras.'));
      }
    })();
    return () => controller.abort();
  }, [selectedFloorId]);

  // Camera health changes over time (health worker); refresh it without reloading zones or the map.
  useEffect(() => {
    if (!selectedFloorId) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      listCameras(selectedFloorId, controller.signal)
        .then((cameras) => setLoaded((current) => (current?.floorId === selectedFloorId
          ? { floorId: current.floorId, details: { ...current.details, cameras } }
          : current)))
        .catch(() => undefined);
    }, HEALTH_REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [selectedFloorId]);

  const coverage = useMemo(
    () => new Map(details.zones.map((zone) => [zone.zoneId, zoneCoverage(zone, details.cameras, details.mappings)])),
    [details],
  );
  const zoneTone = (zone: ZoneRecord) => COVERAGE[coverage.get(zone.zoneId)?.status ?? 'uncovered'].tone;
  const selectedCamera = details.cameras.find((camera) => camera.cameraId === selectedCameraId) ?? null;
  const highlighted = useMemo(() => {
    if (selectedZoneId) return new Set([selectedZoneId]);
    if (selectedCameraId) return new Set(zonesForCamera(selectedCameraId, details.zones, details.mappings).map((zone) => zone.zoneId));
    return undefined;
  }, [details, selectedCameraId, selectedZoneId]);
  const unplaced = details.cameras.filter((camera) => camera.mapX === null || camera.mapY === null).length;
  const online = details.cameras.filter((camera) => healthTone(camera) === 'success').length;

  const subtitle = selectedFloor
    ? `${storeName ? `${storeName} · ` : ''}${selectedFloor.name || `Floor ${selectedFloor.floorNumber}`} · ${online}/${details.cameras.length} cameras online`
    : 'Live store overview';

  return (
    <OperatorLayout title="Floor map" subtitle={subtitle}>
      <aside className={s.left}>
        <Overline>FLOORS</Overline>
        <div className={s.floorList}>
          {(floors ?? []).map((floor) => (
            <button
              key={floor.floorId}
              className={`${s.floor} ${floor.floorId === selectedFloorId ? s.floorActive : ''}`}
              aria-pressed={floor.floorId === selectedFloorId}
              onClick={() => {
                setSelectedCameraId(null);
                setSelectedZoneId(null);
                setParams({ floor: floor.floorId });
              }}
            >
              {floor.name || `Floor ${floor.floorNumber}`}
            </button>
          ))}
          {floors?.length === 0 && <p className={s.muted}>No floors configured yet.</p>}
        </div>

        <Overline>LEGEND</Overline>
        <ul className={s.legend}>
          {(['covered', 'degraded', 'offline', 'uncovered'] as const).map((status) => (
            <li key={status}><span className={`${s.swatch} ${s[`swatch-${COVERAGE[status].tone}`]}`} />{COVERAGE[status].label}</li>
          ))}
          <li><span className={`${s.swatch} ${s.swatchCamera}`} />Camera</li>
        </ul>
        <p className={s.hint}>Zone colours show live camera coverage. Queue and crowd states appear once AI monitoring (MF-02) is connected.</p>
      </aside>

      <section className={s.center}>
        <div className={s.board}>
          <span className={s.boardHint}>Click a camera to inspect it</span>
          {error && <p className={s.error} role="alert">{error}</p>}
          {map.status === 'ready' ? (
            <FloorPlanView
              mapUrl={map.url}
              mapContentType={map.contentType}
              zones={details.zones}
              cameras={details.cameras}
              zoneTone={zoneTone}
              cameraTone={healthTone}
              selectedCameraId={selectedCameraId}
              highlightedZoneIds={highlighted}
              onSelectCamera={(cameraId) => {
                setSelectedZoneId(null);
                setSelectedCameraId((current) => (current === cameraId ? null : cameraId));
              }}
              onSelectZone={(zoneId) => {
                setSelectedCameraId(null);
                setSelectedZoneId((current) => (current === zoneId ? null : zoneId));
              }}
              cameraPopup={selectedCamera && (
                <CameraPopup
                  camera={selectedCamera}
                  zones={zonesForCamera(selectedCamera.cameraId, details.zones, details.mappings)}
                  onOpenLive={() => navigate(`/operator/cameras/${selectedCamera.cameraId}`)}
                  onClose={() => setSelectedCameraId(null)}
                />
              )}
            />
          ) : (
            <div className={s.empty}>
              {map.status === 'error' ? map.message
                : map.status === 'missing' ? 'This floor has no floor plan yet. An Admin uploads it in Store layout.'
                  : floors?.length === 0 ? 'No floor to show yet.'
                    : 'Loading floor plan…'}
            </div>
          )}
          {unplaced > 0 && <p className={s.muted}>{unplaced} camera{unplaced === 1 ? ' is' : 's are'} not placed on the floor plan yet.</p>}
        </div>
      </section>

      <aside className={s.right}>
        <Overline>ZONE STATUS</Overline>
        <div className={s.zoneList}>
          {details.zones.map((zone) => {
            const info = coverage.get(zone.zoneId);
            const meta = COVERAGE[info?.status ?? 'uncovered'];
            const active = zone.zoneId === selectedZoneId;
            return (
              <button
                key={zone.zoneId}
                className={`${s.zoneCard} ${s[`zone-${meta.tone}`]} ${active ? s.zoneActive : ''}`}
                aria-pressed={active}
                onClick={() => {
                  setSelectedCameraId(null);
                  setSelectedZoneId(active ? null : zone.zoneId);
                }}
              >
                <span className={s.zoneHead}>
                  <strong>{zone.name}</strong>
                  <Chip tone={meta.tone} pill>{meta.label}</Chip>
                </span>
                <span className={s.zoneMeta}>
                  {[zone.zoneType, zone.areaM2 ? `${zone.areaM2} m²` : null, `${info?.onlineCount ?? 0}/${info?.cameraCount ?? 0} cameras online`].filter(Boolean).join(' · ')}
                </span>
              </button>
            );
          })}
          {!loading && details.zones.length === 0 && <p className={s.muted}>No zones on this floor yet.</p>}
        </div>

        <Overline>ACTIVE INCIDENTS</Overline>
        <div className={s.incidents}>
          <strong>No incident feed yet</strong>
          <p>AI-detected and staff-reported incidents appear here once MF-02 monitoring is connected.</p>
        </div>
      </aside>
    </OperatorLayout>
  );
}

function CameraPopup({ camera, zones, onOpenLive, onClose }: { camera: CameraRecord; zones: ZoneRecord[]; onOpenLive: () => void; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<{ cameraId: string; url: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    getCameraPreview(camera.cameraId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSnapshot({ cameraId: camera.cameraId, url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSnapshot({ cameraId: camera.cameraId, url: null, failed: true });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [camera.cameraId]);

  const current = snapshot?.cameraId === camera.cameraId ? snapshot : null;

  return (
    <div className={s.popup} role="dialog" aria-label={`Camera ${camera.code}`}>
      <div className={s.popupHead}>
        <div>
          <strong>{camera.code}</strong>
          <small>{camera.name}</small>
        </div>
        <Chip tone={healthTone(camera)} pill>{healthLabel(camera)}</Chip>
        <button className={s.close} aria-label="Close camera details" onClick={onClose}>×</button>
      </div>
      <div className={s.snapshot}>
        {current?.url ? <img src={current.url} alt={`Latest frame from ${camera.code}`} />
          : <span>{current?.failed ? 'Snapshot unavailable' : 'Loading snapshot…'}</span>}
      </div>
      <dl className={s.facts}>
        <dt>Zones</dt><dd>{zones.length ? zones.map((zone) => zone.name).join(', ') : 'Not mapped'}</dd>
        <dt>Last seen</dt><dd>{formatSeen(camera.lastSeenAt)}</dd>
      </dl>
      <Button block onClick={onOpenLive}>Open live</Button>
    </div>
  );
}

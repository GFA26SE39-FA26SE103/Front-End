import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCamera, getCameraConnection, type CameraConnection, type CameraRecord } from '../../api/cameras';
import type { FloorRecord, ZoneRecord } from '../../api/floors';
import { AnnotatedPreview } from '../../components/AnnotatedPreview';
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
import s from './OperatorCameraLive.module.css';

export default function OperatorCameraLive() {
  const { cameraId = '' } = useParams();
  // Keyed so all page state resets when the operator opens a different camera.
  return <CameraLiveView key={cameraId} cameraId={cameraId} />;
}

function CameraLiveView({ cameraId }: { cameraId: string }) {
  const [camera, setCamera] = useState<CameraRecord | null>(null);
  const [connection, setConnection] = useState<CameraConnection | null>(null);
  const [floor, setFloor] = useState<FloorRecord | null>(null);
  const [details, setDetails] = useState<FloorDetails | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  const map = useFloorMap(floor);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const loaded = await getCamera(cameraId, controller.signal);
        const [{ floors }, floorDetails, loadedConnection] = await Promise.all([
          loadStoreFloors(controller.signal),
          loadFloorDetails(loaded.floorId, controller.signal),
          getCameraConnection(cameraId, controller.signal).catch(() => null),
        ]);
        if (controller.signal.aborted) return;
        setCamera(loaded);
        setFloor(floors.find((item) => item.floorId === loaded.floorId) ?? null);
        setDetails(floorDetails);
        setConnection(loadedConnection);
      } catch (reason) {
        if (!controller.signal.aborted) setError(messageOf(reason, 'Could not load this camera.'));
      }
    })();
    return () => controller.abort();
  }, [cameraId]);

  const zones = useMemo(() => (details && camera ? zonesForCamera(camera.cameraId, details.zones, details.mappings) : []), [camera, details]);
  const zoneIds = useMemo(() => new Set(zones.map((zone) => zone.zoneId)), [zones]);
  const zoneTone = (zone: ZoneRecord) => (details ? COVERAGE[zoneCoverage(zone, details.cameras, details.mappings).status].tone : 'neutral');
  const floorLink = `/operator/floor-map${floor ? `?floor=${floor.floorId}` : ''}`;

  if (error) {
    return (
      <OperatorLayout title="Camera live" subtitle="Camera unavailable">
        <div className={s.message}>
          <p role="alert">{error}</p>
          <Link to="/operator/floor-map">Back to floor map</Link>
        </div>
      </OperatorLayout>
    );
  }

  const title = camera ? `${camera.code}${zones.length ? ` · ${zones.map((zone) => zone.name).join(', ')}` : ''}` : 'Camera live';

  return (
    <OperatorLayout title={title} subtitle={camera ? `${camera.name} · live` : 'Loading camera…'}>
      <section className={s.stage}>
        <div className={s.video}>
          <AnnotatedPreview cameraId={cameraId} enabled={live && Boolean(camera)} />
          {map.status === 'ready' && details && camera && (
            <div className={s.minimap}>
              <p className={s.minimapTitle}>{floor?.name ?? 'Floor'} <span>· minimap</span></p>
              <FloorPlanView
                compact
                mapUrl={map.url}
                mapContentType={map.contentType}
                zones={details.zones}
                cameras={[camera]}
                zoneTone={zoneTone}
                cameraTone={healthTone}
                selectedCameraId={camera.cameraId}
                highlightedZoneIds={zoneIds}
              />
              {zones[0] && (
                <p className={s.minimapZone}>
                  <span className={`${s.dot} ${s[`dot-${zoneTone(zones[0])}`]}`} />
                  {zones.map((zone) => zone.name).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
        <div className={s.controls}>
          <Button variant={live ? 'secondary' : 'primary'} disabled={!camera} onClick={() => setLive((value) => !value)}>
            {live ? 'Stop live view' : 'Start live view'}
          </Button>
          <span className={s.controlNote}>Frames are tracked by YOLO + ByteTrack in the AI service before they reach this page.</span>
          <Link className={s.back} to={floorLink}>Back to floor map</Link>
        </div>
      </section>

      <aside className={s.panel}>
        <Overline>CAMERA</Overline>
        {camera ? (
          <>
            <div className={s.cameraHead}>
              <strong>{camera.code}</strong>
              <Chip tone={healthTone(camera)} pill>{healthLabel(camera)}</Chip>
            </div>
            <dl className={s.facts}>
              <dt>Zones</dt><dd>{zones.length ? zones.map((zone) => zone.name).join(', ') : 'Not mapped'}</dd>
              <dt>Floor</dt><dd>{floor?.name ?? '—'}</dd>
              <dt>Source</dt><dd>{connection ? `${connection.sourceType} · ${connection.protocol}` : '—'}</dd>
              <dt>Last test</dt><dd>{connection?.lastTestResult ?? 'Not tested'}</dd>
              <dt>Last seen</dt><dd>{formatSeen(camera.lastSeenAt)}</dd>
            </dl>
          </>
        ) : <p className={s.muted}>Loading camera…</p>}

        <Overline>COVERED ZONES</Overline>
        <div className={s.zoneList}>
          {zones.map((zone) => {
            const meta = details ? COVERAGE[zoneCoverage(zone, details.cameras, details.mappings).status] : COVERAGE.uncovered;
            return (
              <div key={zone.zoneId} className={s.zoneRow}>
                <span>{zone.name}</span>
                <Chip tone={meta.tone} pill>{meta.label}</Chip>
              </div>
            );
          })}
          {camera && zones.length === 0 && <p className={s.muted}>An Admin has not mapped this camera to any zone yet.</p>}
        </div>

        <Overline>RELATED INCIDENT</Overline>
        <div className={s.incident}>
          <strong>No incident feed yet</strong>
          <p>Incidents raised from this camera appear here once MF-02 monitoring is connected.</p>
        </div>

        <Overline>CAMERAS ON THIS FLOOR</Overline>
        <nav className={s.switcher} aria-label="Cameras on this floor">
          {(details?.cameras ?? []).map((item) => {
            const current = item.cameraId === cameraId;
            const itemZones = details ? zonesForCamera(item.cameraId, details.zones, details.mappings) : [];
            return (
              <Link
                key={item.cameraId}
                to={`/operator/cameras/${item.cameraId}`}
                className={`${s.switchRow} ${current ? s.switchCurrent : ''}`}
                aria-current={current ? 'page' : undefined}
              >
                <span className={`${s.dot} ${s[`dot-${healthTone(item)}`]}`} aria-hidden="true" />
                <span className={s.switchLabels}>
                  <strong>{item.code}</strong>
                  <small>{itemZones.length ? itemZones.map((zone) => zone.name).join(', ') : 'Not mapped'}</small>
                </span>
                <span className={`${s.switchStatus} ${current ? '' : s[`status-${healthTone(item)}`]}`}>{current ? 'Viewing' : healthLabel(item)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </OperatorLayout>
  );
}

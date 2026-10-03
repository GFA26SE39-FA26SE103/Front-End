import { useEffect, useMemo, useState } from 'react';
import { icon as iconUrl } from '../assets/icons';
import {
  enableCameraConnection,
  listCameraMappings,
  listCameras,
  listFloors,
  listSupermarkets,
  listZones,
  testCameraConnection,
  type CameraRecord,
  type FloorRecord,
  type ZoneRecord,
} from '../api/cameras';
import { AdminLayout } from '../components/AdminLayout';
import { AnnotatedPreview } from '../components/AnnotatedPreview';
import { CameraRegistration, type CameraFloorOption } from '../components/CameraRegistration';
import { CameraConnectionConfiguration } from '../components/CameraConnectionConfiguration';
import { RecordedVideoUpload } from '../components/RecordedVideoUpload';
import { Icon } from '../components/Icon';
import { Button, Card, CardHeader, Chip, SearchBox, Select } from '../components/ui';
import { cameraPlacements, zoneRects } from '../data/floorPlan';
import { statusChip } from './cameraStatus';
import s from './Cameras.module.css';

type CameraStatus = 'Online' | 'Degraded' | 'Offline';
type FloorOption = CameraFloorOption;
type CameraView = {
  id: string;
  code: string;
  name: string;
  floorId: string;
  floor: string;
  floorLabel: string;
  zones: { code: string; name: string }[];
  status: CameraStatus;
  lifecycleStatus: string;
  installed: string;
  warrantyUntil: string;
  model: string;
  serial: string;
  lastSeen: string;
};
type TestState = { cameraId: string; state: 'running' | 'ok' | 'fail'; message?: string };

const mini = (x: number, y: number) => ({ x: 7 + ((x - 14) * 96) / 508, y: 7 + ((y - 14) * 96) / 636 });

export default function Cameras() {
  const [cameras, setCameras] = useState<CameraView[]>([]);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [query, setQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [streamLabels, setStreamLabels] = useState<Record<string, string>>({});
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [connectionEditorOpen, setConnectionEditorOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const stores = await listSupermarkets(controller.signal);
        const floorRecords = (await Promise.all(stores.map((store) => listFloors(store.supermarketId, controller.signal)))).flat();
        const floorOptions = floorRecords.map((floor) => ({ id: floor.floorId, key: `F${floor.floorNumber}`, label: floor.name || `Floor ${floor.floorNumber}` }));
        const groups = await Promise.all(floorRecords.map((floor) => loadFloor(floor, floorOptions, controller.signal)));
        if (controller.signal.aborted) return;
        const loaded = groups.flat();
        setFloors(floorOptions);
        setCameras(loaded);
        setSelected((current) => loaded.some((camera) => camera.id === current) ? current : loaded[0]?.id ?? null);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load cameras.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cameras.filter((camera) =>
      (floorFilter === 'all' || camera.floorId === floorFilter)
      && (!normalized || camera.code.toLowerCase().includes(normalized) || camera.name.toLowerCase().includes(normalized) || camera.zones.some((zone) => zone.name.toLowerCase().includes(normalized))));
  }, [cameras, floorFilter, query]);

  const camera = cameras.find((item) => item.id === selected);
  const counts = {
    online: cameras.filter((item) => item.status === 'Online').length,
    degraded: cameras.filter((item) => item.status === 'Degraded').length,
    offline: cameras.filter((item) => item.status === 'Offline').length,
  };

  const selectCamera = (cameraId: string) => {
    if (uploadBusy) return;
    setUploadOpen(false);
    setPreviewEnabled(false);
    setConnectionEditorOpen(false);
    setSelected(cameraId);
    setTest(null);
  };

  const registered = (record: CameraRecord, recorded = false) => {
    const floor = floors.find((item) => item.id === record.floorId)!;
    const view: CameraView = {
      id: record.cameraId,
      code: record.code,
      name: record.name,
      floorId: record.floorId,
      floor: floor.key,
      floorLabel: floor.label,
      zones: [],
      status: healthStatus(record.healthStatus),
      lifecycleStatus: record.status,
      installed: formatDate(record.installedAt),
      warrantyUntil: formatDate(record.warrantyExpiresAt),
      model: [record.manufacturer, record.model].filter(Boolean).join(' · ') || '—',
      serial: record.serialNumber ?? '—',
      lastSeen: formatDate(record.lastSeenAt),
    };
    setCameras((all) => [...all.filter((item) => item.id !== view.id), view]);
    setPreviewEnabled(false);
    setConnectionEditorOpen(false);
    setTest(null);
    setSelected(view.id);
    setFloorFilter(view.floorId);
    setStreamLabels((all) => ({ ...all, [view.id]: recorded ? 'No source · upload video next' : 'HTTP · configured in backend' }));
    setUploadOpen(recorded);
    setRegistrationOpen(false);
  };

  const runTest = async (target: CameraView) => {
    setPreviewEnabled(false);
    setTest({ cameraId: target.id, state: 'running' });
    try {
      const tested = await testCameraConnection(target.id);
      if (tested.lastTestResult !== 'SUCCESS') {
        setTest({ cameraId: target.id, state: 'fail', message: tested.lastTestMessage ?? 'No frame received.' });
        return;
      }
      const enabled = tested.isEnabled ? tested : await enableCameraConnection(target.id);
      setStreamLabels((all) => ({ ...all, [target.id]: `${enabled.protocol} · configured in backend` }));
      setTest({ cameraId: target.id, state: 'ok', message: tested.lastTestMessage ?? 'FRAME_RECEIVED' });
    } catch (error) {
      setTest({ cameraId: target.id, state: 'fail', message: error instanceof Error ? error.message : 'Stream test failed.' });
    }
  };

  return (
    <AdminLayout title="Cameras" subtitle={`${cameras.length} cameras · ${counts.online} online · ${counts.degraded} unknown · ${counts.offline} offline`}>
      <Card className={s.registry}>
        <CardHeader title="Camera registry" subtitle="Live records loaded from the MF-01 backend">
          <SearchBox value={query} onChange={setQuery} placeholder="Search camera" width={170} />
          <div style={{ width: 130 }}>
            <Select value={floorFilter} onChange={setFloorFilter} chevron="chevron-down-small" chevronSize={13} height={32} options={[{ value: 'all', label: 'All floors' }, ...floors.map((floor) => ({ value: floor.id, label: floor.label }))]} />
          </div>
          <Button onClick={() => { setUploadOpen(false); setConnectionEditorOpen(false); setRegistrationOpen(true); }} disabled={loading || uploadBusy}>Add camera</Button>
        </CardHeader>

        {registrationOpen && <CameraRegistration floors={floors} onCancel={() => setRegistrationOpen(false)} onRegistered={registered} />}

        {loading && <p className={s.empty}>Loading camera registry…</p>}
        {loadError && <p className={s.errorBanner} role="alert">{loadError}</p>}
        {!loading && !loadError && (
          <div className={s.table} role="table">
            <div className={`${s.row} ${s.head}`} role="row">
              <span>CAMERA</span><span>FLOOR · ZONE</span><span>STATUS</span><span>INSTALLED</span><span>WARRANTY</span><span>LAST SEEN</span>
            </div>
            {visible.map((item) => {
              const active = item.id === selected;
              return (
                <button key={item.id} role="row" disabled={uploadBusy} className={`${s.row} ${active ? s.selected : ''}`} onClick={() => selectCamera(item.id)}>
                  <span className={s.code}><Icon name={active ? 'camera-row-active' : 'camera-row'} size={14} />{item.code}</span>
                  <span>{item.floor} · {item.zones.length ? item.zones.map((zone) => `${zone.code} ${zone.name}`).join(', ') : 'Unmapped'}</span>
                  <span>{statusChip(item.status)}</span>
                  <span>{item.installed}</span>
                  <span className={s.strong}>{item.warrantyUntil}</span>
                  <span>{item.lastSeen}</span>
                </button>
              );
            })}
            {visible.length === 0 && <p className={s.empty}>No camera matches “{query}”.</p>}
          </div>
        )}
      </Card>

      {camera && (
        <Card className={s.detail}>
          <div className={s.detailHeader}>
            <div style={{ flex: 1 }}>
              <div className={s.detailTitle}>{camera.code}{statusChip(camera.status)}</div>
              <p className={s.detailSub}>{camera.floorLabel} · {camera.name}</p>
            </div>
            <Chip tone={previewEnabled ? 'success' : 'neutral'}>{previewEnabled ? 'AI PREVIEW' : 'AI STOPPED'}</Chip>
          </div>

          <div className={s.media}>
            <div className={s.trackedPreview}><AnnotatedPreview cameraId={camera.id} enabled={previewEnabled} /></div>
            <Placement camera={camera} />
          </div>

          <dl className={s.streamInfo}>
            <KV k="Model" v={camera.model} />
            <KV k="Serial no." v={camera.serial} />
            <KV k="Lifecycle" v={camera.lifecycleStatus} />
            <KV k="Stream" v={streamLabels[camera.id] ?? 'Stored securely in backend'} />
            <KV k="Tracking" v="YOLO person · ByteTrack camera-local ID" />
          </dl>

          {test?.cameraId === camera.id && (
            <p className={s.testResult} style={{ color: test.state === 'fail' ? 'var(--color-danger)' : test.state === 'ok' ? 'var(--color-success)' : 'var(--color-text-muted)' }} role="status">
              {test.state === 'running' ? 'Testing stream…' : test.state === 'ok' ? `Stream ready · ${test.message}` : `Stream failed · ${test.message}`}
            </p>
          )}

          {connectionEditorOpen && (
            <CameraConnectionConfiguration
              cameraId={camera.id}
              onCancel={() => setConnectionEditorOpen(false)}
              onSaved={() => {
                setPreviewEnabled(false);
                setTest(null);
                setStreamLabels((all) => ({ ...all, [camera.id]: 'HTTP · configured in backend' }));
                setConnectionEditorOpen(false);
              }}
            />
          )}

          {uploadOpen && <RecordedVideoUpload key={camera.id} cameraId={camera.id} onBusy={setUploadBusy} onCancel={() => setUploadOpen(false)} onSaved={() => {
            setPreviewEnabled(false);
            setTest(null);
            setCameras((all) => all.map((item) => item.id === camera.id ? { ...item, status: 'Degraded' } : item));
            setStreamLabels((all) => ({ ...all, [camera.id]: 'RECORDED · MP4 · test & enable next' }));
            setUploadOpen(false);
          }} />}

          <div className={s.actions}>
            <Button variant="secondary" size="lg" disabled={uploadBusy} onClick={() => { setUploadOpen(false); setPreviewEnabled(false); setConnectionEditorOpen(true); }}>Configure connection</Button>
            <Button variant="secondary" size="lg" disabled={uploadBusy || test?.state === 'running'} onClick={() => { setPreviewEnabled(false); setConnectionEditorOpen(false); setUploadOpen(true); }}>Upload video</Button>
            <Button variant="secondary" size="lg" icon="refresh" onClick={() => void runTest(camera)} disabled={uploadOpen || test?.state === 'running'}>Test &amp; enable</Button>
            <Button size="lg" disabled={uploadOpen || test?.state === 'running'} onClick={() => setPreviewEnabled((value) => !value)}>{previewEnabled ? 'Stop AI preview' : 'Start AI preview'}</Button>
          </div>
          <p className={s.previewNote}>Bounding boxes and track IDs are drawn by YOLO + ByteTrack before this JPEG reaches React.</p>
        </Card>
      )}
    </AdminLayout>
  );
}

async function loadFloor(floor: FloorRecord, floorOptions: FloorOption[], signal: AbortSignal): Promise<CameraView[]> {
  const [records, zones] = await Promise.all([listCameras(floor.floorId, signal), listZones(floor.floorId, signal)]);
  const zoneById = new Map(zones.map((zone) => [zone.zoneId, zone]));
  return Promise.all(records.map(async (camera) => {
    const mappings = await listCameraMappings(camera.cameraId, signal);
    const cameraZones = mappings.filter((mapping) => mapping.status === 'ACTIVE').map((mapping) => zoneById.get(mapping.zoneId)).filter((zone): zone is ZoneRecord => Boolean(zone));
    return toView(camera, floor, floorOptions, cameraZones);
  }));
}

function toView(camera: CameraRecord, floor: FloorRecord, floorOptions: FloorOption[], zones: ZoneRecord[]): CameraView {
  const floorOption = floorOptions.find((item) => item.id === floor.floorId)!;
  return {
    id: camera.cameraId,
    code: camera.code,
    name: camera.name,
    floorId: camera.floorId,
    floor: floorOption.key,
    floorLabel: floorOption.label,
    zones: zones.map((zone) => ({ code: zone.code, name: zone.name })),
    status: healthStatus(camera.healthStatus),
    lifecycleStatus: camera.status,
    installed: formatDate(camera.installedAt),
    warrantyUntil: formatDate(camera.warrantyExpiresAt),
    model: [camera.manufacturer, camera.model].filter(Boolean).join(' · ') || '—',
    serial: camera.serialNumber ?? '—',
    lastSeen: formatDate(camera.lastSeenAt),
  };
}

function healthStatus(value: string): CameraStatus {
  if (value === 'ONLINE') return 'Online';
  if (value === 'OFFLINE') return 'Offline';
  return 'Degraded';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB').format(date);
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className={s.kv}><dt>{k}</dt><dd>{v}</dd></div>;
}

function Placement({ camera }: { camera: CameraView }) {
  const placement = cameraPlacements[camera.code];
  return (
    <div className={s.placement} aria-label="Position on floor plan">
      <span className={s.planBase} />
      {camera.zones.map((zone) => {
        const rect = zoneRects[zone.code];
        if (!rect) return null;
        const a = mini(rect.x, rect.y);
        const b = mini(rect.x + rect.w, rect.y + rect.h);
        return <span key={zone.code} style={{ position: 'absolute', left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)', border: '1.2px solid var(--color-primary)' }} />;
      })}
      {placement && (() => {
        const marker = mini(placement.marker.x + 11, placement.marker.y + 11);
        return <img src={iconUrl('placement-dot')} width={10} height={10} alt="" style={{ position: 'absolute', left: Math.min(marker.x - 5, 93), top: Math.min(marker.y - 5, 93) }} />;
      })()}
      <span className={s.planLabel}>Floor plan</span>
    </div>
  );
}

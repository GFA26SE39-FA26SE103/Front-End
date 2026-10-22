import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  enableCameraConnection,
  cameraUpdateRequest,
  getCameraConnection,
  listCameraMappings,
  listCameras,
  listFloors,
  listSupermarkets,
  listZones,
  stopAiPreview,
  testCameraConnection,
  updateCamera,
  type CameraRecord,
  type FloorRecord,
  type ZoneRecord,
} from '../api/cameras';
import { ApiError } from '../api/client';
import { AdminLayout } from '../components/AdminLayout';
import { AnnotatedPreview } from '../components/AnnotatedPreview';
import { CameraLivePreview, type CameraLiveViewState } from '../components/CameraLivePreview';
import { CameraRegistration, type CameraFloorOption } from '../components/CameraRegistration';
import { CameraEditor } from '../components/CameraEditor';
import { CameraConnectionConfiguration } from '../components/CameraConnectionConfiguration';
import { Dialog } from '../components/Dialog';
import { RecordedVideoUpload } from '../components/RecordedVideoUpload';
import { Icon } from '../components/Icon';
import { Button, Card, CardHeader, Chip, SearchBox, Segmented, Select } from '../components/ui';
import { cameraWhepUrl } from '../config/webrtc';
import { statusChip, type CameraDisplayStatus } from './cameraStatus';
import s from './Cameras.module.css';

type FloorOption = CameraFloorOption;
type CameraView = {
  record: CameraRecord;
  id: string;
  code: string;
  name: string;
  floorId: string;
  floor: string;
  floorLabel: string;
  zones: { zoneId: string; code: string; name: string }[];
  status: CameraDisplayStatus;
  lifecycleStatus: string;
  installed: string;
  warrantyUntil: string;
  model: string;
  serial: string;
  lastSeen: string;
};
type ViewMode = 'live' | 'ai';
type PreviewState = 'stopped' | 'connecting' | 'starting' | 'running' | 'error';
type ConnectionState = 'not-configured' | 'checking' | 'ready' | 'failed' | 'inactive';
type ConnectionView = {
  cameraId: string;
  state: ConnectionState;
  protocol?: string;
  lastChecked?: string | null;
  errorCode?: string;
  message?: string;
  actionableError?: boolean;
};
type PreviewFailure = {
  errorCode: string;
  message: string;
  actionableError: boolean;
};

export default function Cameras() {
  const [params] = useSearchParams();
  const requestedCameraId = params.get('cameraId') ?? '';
  const [cameras, setCameras] = useState<CameraView[]>([]);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [query, setQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CameraDisplayStatus>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [previewState, setPreviewState] = useState<PreviewState>('stopped');
  const [previewFailures, setPreviewFailures] = useState<Record<string, PreviewFailure>>({});
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [connectionEditorOpen, setConnectionEditorOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [lifecycleConfirmOpen, setLifecycleConfirmOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError('');
      setSelectionError('');
      try {
        const stores = await listSupermarkets(controller.signal);
        const floorRecords = (await Promise.all(stores.map((store) => listFloors(store.supermarketId, controller.signal)))).flat();
        const floorOptions = floorRecords.map((floor) => ({ id: floor.floorId, key: `F${floor.floorNumber}`, label: floor.name || `Floor ${floor.floorNumber}` }));
        const groups = await Promise.all(floorRecords.map((floor) => loadFloor(floor, floorOptions, controller.signal)));
        if (controller.signal.aborted) return;
        const loaded = groups.flat();
        setFloors(floorOptions);
        setCameras(loaded);
        const requested = loaded.find(camera => camera.id === requestedCameraId);
        setSelected((current) => requestedCameraId ? requested?.id ?? null : loaded.some((camera) => camera.id === current) ? current : loaded[0]?.id ?? null);
        if (requested) setFloorFilter(requested.floorId);
        if (requestedCameraId && !requested) setSelectionError('The requested camera was not found. Choose a camera from the list.');
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load cameras.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [requestedCameraId]);

  useEffect(() => {
    if (floors.length === 0) return;
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    const refreshHealth = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const groups = await Promise.all(floors.map((floor) => listCameras(floor.id, controller!.signal)));
        if (disposed || controller.signal.aborted) return;
        const records = new Map(groups.flat().map((record) => [record.cameraId, record]));
        setCameras((current) => current.map((item) => {
          const record = records.get(item.id);
          return record ? updateView(item, { ...item.record, healthStatus: record.healthStatus, lastSeenAt: record.lastSeenAt }) : item;
        }));
      } catch {
        // Keep the last known status. The next poll or a manual reload can recover.
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void refreshHealth(), 15000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [floors]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cameras.filter((camera) =>
      (floorFilter === 'all' || camera.floorId === floorFilter)
      && (statusFilter === 'all' || camera.status === statusFilter)
      && (!normalized || camera.code.toLowerCase().includes(normalized) || camera.name.toLowerCase().includes(normalized) || camera.zones.some((zone) => zone.name.toLowerCase().includes(normalized))));
  }, [cameras, floorFilter, query, statusFilter]);

  const camera = cameras.find((item) => item.id === selected);
  const previewFailure = camera ? previewFailures[camera.id] : undefined;
  const selectedCameraId = camera?.id;
  const selectedLifecycleStatus = camera?.lifecycleStatus;
  useEffect(() => {
    if (!selectedCameraId || selectedLifecycleStatus !== 'ACTIVE') return;

    const controller = new AbortController();
    void getCameraConnection(selectedCameraId, controller.signal)
      .then((current) => {
        if (controller.signal.aborted) return;
        setConnection({
          cameraId: selectedCameraId,
          state: current.isEnabled && current.lastTestResult === 'SUCCESS'
            ? 'ready'
            : current.lastTestResult && current.lastTestResult !== 'SUCCESS'
              ? 'failed'
              : 'not-configured',
          protocol: current.protocol,
          lastChecked: current.lastTestedAt,
          errorCode: current.lastTestResult && current.lastTestResult !== 'SUCCESS'
            ? current.lastTestMessage ?? current.lastTestResult
            : undefined,
          message: current.lastTestResult && current.lastTestResult !== 'SUCCESS'
            ? 'The last connection test failed.'
            : undefined,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setConnection(error instanceof ApiError && error.status === 404
          ? { cameraId: selectedCameraId, state: 'not-configured' }
          : {
              cameraId: selectedCameraId,
              state: 'failed',
              errorCode: error instanceof ApiError ? error.code : 'CONNECTION_STATUS_UNAVAILABLE',
              message: error instanceof Error ? error.message : 'Could not read the camera connection.',
              actionableError: false,
            });
      });
    return () => controller.abort();
  }, [selectedCameraId, selectedLifecycleStatus]);

  const counts = {
    online: cameras.filter((item) => item.status === 'Online').length,
    offline: cameras.filter((item) => item.status === 'Offline').length,
    notChecked: cameras.filter((item) => item.status === 'Not checked').length,
    inactive: cameras.filter((item) => item.status === 'Inactive').length,
  };

  const selectCamera = (cameraId: string) => {
    if (uploadBusy) return;
    setSelectionError('');
    setUploadOpen(false);
    setPreviewState(previewFailures[cameraId] ? 'error' : 'stopped');
    setViewMode('live');
    setConnectionEditorOpen(false);
    setEditorOpen(false);
    setLifecycleConfirmOpen(false);
    setMoreActionsOpen(false);
    setSelected(cameraId);
  };

  const registered = (record: CameraRecord, recorded = false) => {
    const floor = floors.find((item) => item.id === record.floorId)!;
    const view: CameraView = {
      record,
      id: record.cameraId,
      code: record.code,
      name: record.name,
      floorId: record.floorId,
      floor: floor.key,
      floorLabel: floor.label,
      zones: [],
      status: displayStatus(record),
      lifecycleStatus: record.status,
      installed: formatDate(record.installedAt),
      warrantyUntil: formatDate(record.warrantyExpiresAt),
      model: [record.manufacturer, record.model].filter(Boolean).join(' · ') || '—',
      serial: record.serialNumber ?? '—',
      lastSeen: formatDate(record.lastSeenAt),
    };
    setCameras((all) => [...all.filter((item) => item.id !== view.id), view]);
    setPreviewState('stopped');
    setViewMode('live');
    setConnectionEditorOpen(false);
    setConnection({ cameraId: view.id, state: recorded ? 'not-configured' : 'checking' });
    setSelected(view.id);
    setFloorFilter(view.floorId);
    setUploadOpen(recorded);
    setRegistrationOpen(false);
  };

  const saved = (record: CameraRecord) => {
    setCameras((all) => all.map((item) => item.id === record.cameraId
      ? updateView(item, record)
      : item));
    setEditorOpen(false);
  };

  const changeLifecycle = async (target: CameraView, status: 'ACTIVE' | 'INACTIVE') => {
    setLifecycleBusy(true); setLifecycleError(''); setPreviewState('stopped');
    try {
      const record = await updateCamera(target.id, cameraUpdateRequest(target.record, status));
      saved(record);
      setConnection({ cameraId: target.id, state: status === 'INACTIVE' ? 'inactive' : 'checking' });
      setConnectionEditorOpen(false);
      setUploadOpen(false);
      setLifecycleConfirmOpen(false);
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : `Could not ${status === 'ACTIVE' ? 'reactivate' : 'deactivate'} the camera.`);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const prepareConnection = async (target: CameraView) => {
    setConnection({ cameraId: target.id, state: 'checking' });
    try {
      const tested = await testCameraConnection(target.id);
      if (tested.lastTestResult !== 'SUCCESS') {
        setConnection({
          cameraId: target.id,
          state: 'failed',
          protocol: tested.protocol,
          lastChecked: tested.lastTestedAt,
          errorCode: tested.lastTestMessage ?? tested.lastTestResult ?? 'CONNECTION_TEST_FAILED',
          message: 'The camera did not return a usable frame.',
          actionableError: true,
        });
        return false;
      }
      const enabled = tested.isEnabled ? tested : await enableCameraConnection(target.id);
      setConnection({ cameraId: target.id, state: 'ready', protocol: enabled.protocol, lastChecked: tested.lastTestedAt });
      setPreviewFailures((current) => withoutKey(current, target.id));
      return true;
    } catch (error) {
      setConnection({
        cameraId: target.id,
        state: 'failed',
        errorCode: error instanceof ApiError ? error.code : 'CONNECTION_TEST_FAILED',
        message: error instanceof Error ? error.message : 'Could not connect to the camera.',
        actionableError: true,
      });
      return false;
    }
  };

  const startPreview = async (target: CameraView) => {
    if (target.lifecycleStatus !== 'ACTIVE') return;
    setPreviewFailures((current) => withoutKey(current, target.id));
    setPreviewState('connecting');
    const ready = connection?.cameraId === target.id && connection.state === 'ready'
      ? true
      : await prepareConnection(target);
    setPreviewState(ready ? (viewMode === 'live' ? 'starting' : 'running') : 'error');
  };

  const changeViewMode = async (next: ViewMode) => {
    if (!camera || next === viewMode) return;
    const restart = previewState === 'running' || previewState === 'starting';
    setPreviewState('stopped');
    setViewMode(next);
    if (!restart) return;
    try {
      if (viewMode === 'ai') await stopAiPreview(camera.id);
      else await new Promise((resolve) => window.setTimeout(resolve, 0));
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : 'Could not stop the previous preview.');
      return;
    }
    setPreviewState(next === 'live' ? 'starting' : 'running');
  };

  const liveViewChanged = (target: CameraView, state: CameraLiveViewState, error?: ApiError) => {
    if (state === 'live') {
      setPreviewFailures((current) => withoutKey(current, target.id));
      setPreviewState('running');
      return;
    }
    if (state === 'starting' || state === 'reconnecting') {
      setPreviewState('starting');
      return;
    }
    if (state !== 'error' && state !== 'unauthorized') return;
    const failure: PreviewFailure = {
      errorCode: state === 'unauthorized' ? 'SESSION_EXPIRED' : error?.code ?? 'LIVE_VIEW_UNAVAILABLE',
      message: state === 'unauthorized'
        ? 'Your session expired while opening the live view.'
        : error?.message ?? 'The camera source stopped returning preview frames.',
      actionableError: state !== 'unauthorized',
    };
    setPreviewFailures((current) => ({ ...current, [target.id]: failure }));
    setPreviewState('error');
  };

  return (
    <AdminLayout title="Cameras" subtitle={cameraSummary(cameras.length, counts)}>
      <Card className={s.registry}>
        <CardHeader title="Camera registry" subtitle="Live records loaded from the MF-01 backend">
          <div className={s.registryFilters}>
            <SearchBox value={query} onChange={setQuery} placeholder="Search camera" width={170} />
            <div className={s.floorFilter}>
              <Select ariaLabel="Filter by floor" value={floorFilter} onChange={setFloorFilter} chevron="chevron-down-small" chevronSize={13} height={32} options={[{ value: 'all', label: 'All floors' }, ...floors.map((floor) => ({ value: floor.id, label: floor.label }))]} />
            </div>
            <div className={s.statusFilter}>
              <Select ariaLabel="Filter by status" value={statusFilter} onChange={setStatusFilter} chevron="chevron-down-small" chevronSize={13} height={32} options={[
                { value: 'all', label: 'All statuses' },
                { value: 'Online', label: 'Online' },
                { value: 'Offline', label: 'Offline' },
                { value: 'Not checked', label: 'Not checked' },
                { value: 'Inactive', label: 'Inactive' },
              ]} />
            </div>
            <Button onClick={() => { setUploadOpen(false); setConnectionEditorOpen(false); setRegistrationOpen(true); }} disabled={loading || uploadBusy}>Add camera</Button>
          </div>
        </CardHeader>

        {registrationOpen && <CameraRegistration floors={floors} onCancel={() => setRegistrationOpen(false)} onRegistered={registered} />}

        {loading && <p className={s.empty}>Loading camera registry…</p>}
        {loadError && <p className={s.errorBanner} role="alert">{loadError}</p>}
        {selectionError && <p className={s.errorBanner} role="alert">{selectionError}</p>}
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
            {visible.length === 0 && <p className={s.empty}>{statusFilter !== 'all' || floorFilter !== 'all' ? 'No cameras match the selected filters.' : `No camera matches “${query}”.`}</p>}
          </div>
        )}
      </Card>

      {camera && (
        <Card className={s.detail}>
          <div className={s.detailHeader}>
            <div style={{ flex: 1 }}>
              <div className={s.detailTitle}>{camera.code}</div>
              <p className={s.detailSub}>{camera.floorLabel} · {camera.name}</p>
            </div>
            <Chip tone={connectionBadge(camera, connection, previewState, viewMode, Boolean(previewFailure)).tone}>{connectionBadge(camera, connection, previewState, viewMode, Boolean(previewFailure)).label}</Chip>
          </div>

          {lifecycleError && <p className={s.errorBanner} role="alert">{lifecycleError}</p>}
          {camera.lifecycleStatus !== 'ACTIVE' && <p className={s.inactiveNote}>This camera is inactive. Its configuration and history are retained; reactivate it before testing, previewing or changing its source.</p>}

          <div className={s.media}>
            <div className={s.trackedPreview}>
              {viewMode === 'ai'
                ? <AnnotatedPreview key={`${camera.id}-ai`} cameraId={camera.id} enabled={previewState === 'running'} />
                : <CameraLivePreview
                    key={`${camera.id}-live`}
                    cameraId={camera.id}
                    whepUrl={cameraWhepUrl(camera.id, camera.code, connection?.cameraId === camera.id ? connection.protocol : undefined)}
                    enabled={previewState === 'starting' || previewState === 'running'}
                    onStateChange={(state, error) => liveViewChanged(camera, state, error)}
                  />}
            </div>
          </div>

          <div className={s.previewControls}>
            <span className={s.controlLabel}>View mode</span>
            <Segmented value={viewMode} onChange={(mode) => void changeViewMode(mode)} options={[
              { value: 'live', label: 'Live feed' },
              { value: 'ai', label: 'AI detection' },
            ]} />
            <Button
              className={s.previewButton}
              size="lg"
              disabled={uploadOpen || uploadBusy || previewState === 'connecting' || previewState === 'starting' || camera.lifecycleStatus !== 'ACTIVE'}
              onClick={() => previewState === 'running' ? setPreviewState('stopped') : void startPreview(camera)}
            >
              {previewState === 'connecting' || previewState === 'starting' ? 'Connecting…' : previewState === 'running' ? 'Stop preview' : 'Start preview'}
            </Button>
          </div>

          {previewFailure && (
            <div className={s.connectionError} role="alert">
              <strong>Preview could not read the camera source</strong>
              <span>{previewFailure.errorCode}</span>
              <p>{previewFailure.message}</p>
              {previewFailure.actionableError && <div className={s.errorActions}>
                <Button variant="secondary" onClick={() => void startPreview(camera)}>Retry</Button>
                <Button variant="secondary" onClick={() => { setUploadOpen(false); setConnectionEditorOpen(true); }}>Edit connection</Button>
              </div>}
            </div>
          )}

          {!previewFailure && connection?.cameraId === camera.id && connection.state === 'failed'
            && (connection.actionableError || connection.errorCode === 'SESSION_EXPIRED') && (
            <div className={s.connectionError} role="alert">
              <strong>Could not connect to camera</strong>
              <span>{connection.errorCode ?? 'CONNECTION_TEST_FAILED'}</span>
              {connection.message && <p>{connection.message}</p>}
              {connection.actionableError && <div className={s.errorActions}>
                  <Button variant="secondary" onClick={() => void startPreview(camera)}>Retry</Button>
                  <Button variant="secondary" onClick={() => { setUploadOpen(false); setConnectionEditorOpen(true); }}>Edit connection</Button>
                </div>}
            </div>
          )}

          <dl className={s.streamInfo}>
            <KV k="Camera source" v={connection?.cameraId === camera.id ? connection.protocol ?? '—' : '—'} />
            <KV k="Last source test" v={connectionDetail(camera, connection)} />
            <KV k="Last connection test" v={connection?.cameraId === camera.id ? formatDateTime(connection.lastChecked) : '—'} />
          </dl>

          {connectionEditorOpen && (
            <CameraConnectionConfiguration
              cameraId={camera.id}
              onCancel={() => setConnectionEditorOpen(false)}
              onSaved={async () => {
                setPreviewState('stopped');
                await prepareConnection(camera);
                setConnectionEditorOpen(false);
              }}
            />
          )}

          {uploadOpen && <RecordedVideoUpload key={camera.id} cameraId={camera.id} onBusy={setUploadBusy} onCancel={() => setUploadOpen(false)} onSaved={() => {
            setPreviewState('stopped');
            setConnection({ cameraId: camera.id, state: 'not-configured', protocol: 'FILE' });
            setCameras((all) => all.map((item) => item.id === camera.id ? { ...item, status: 'Not checked' } : item));
            setUploadOpen(false);
          }} />}

          <div className={s.secondaryActions}>
            <Button variant="secondary" size="lg" disabled={uploadBusy || camera.lifecycleStatus !== 'ACTIVE'} onClick={() => { setUploadOpen(false); setPreviewState('stopped'); setConnectionEditorOpen(true); }}>Connection settings</Button>
            <div className={s.moreActions}>
              <Button variant="secondary" size="lg" aria-haspopup="menu" aria-expanded={moreActionsOpen} onClick={() => setMoreActionsOpen((open) => !open)}>More actions ⋯</Button>
              {moreActionsOpen && <div className={s.actionsMenu} role="menu" aria-label="Camera actions">
                <Button role="menuitem" variant="secondary" disabled={uploadBusy || camera.lifecycleStatus !== 'ACTIVE' || connection?.state === 'checking'} onClick={() => { setMoreActionsOpen(false); setPreviewState('stopped'); void prepareConnection(camera); }}>Re-test source</Button>
                <Button role="menuitem" variant="secondary" disabled={uploadBusy || camera.lifecycleStatus !== 'ACTIVE'} onClick={() => { setMoreActionsOpen(false); setPreviewState('stopped'); setConnectionEditorOpen(false); setUploadOpen(true); }}>Upload video</Button>
                <Button role="menuitem" variant="secondary" disabled={uploadBusy || lifecycleBusy} onClick={() => { setMoreActionsOpen(false); setLifecycleError(''); setEditorOpen(true); }}>Edit camera</Button>
                {camera.lifecycleStatus === 'ACTIVE'
                  ? <Button role="menuitem" variant="dangerGhost" disabled={uploadBusy || lifecycleBusy} onClick={() => { setMoreActionsOpen(false); setLifecycleError(''); setLifecycleConfirmOpen(true); }}>Deactivate camera</Button>
                  : <Button role="menuitem" variant="secondary" disabled={uploadBusy || lifecycleBusy} onClick={() => { setMoreActionsOpen(false); void changeLifecycle(camera, 'ACTIVE'); }}>{lifecycleBusy ? 'Reactivating…' : 'Reactivate camera'}</Button>}
              </div>}
            </div>
          </div>
          {camera.zones.length ? <div className={s.actions}>{camera.zones.map(zone => <a key={zone.zoneId} href={`/admin/ai-config?zoneId=${encodeURIComponent(zone.zoneId)}`}>Configure monitoring: {zone.name}</a>)}</div> : <p className={s.previewNote}>Map this camera and draw its zone ROI in <a href="/admin/store-layout">Store layout</a> before configuring monitoring.</p>}
        </Card>
      )}
      {camera && editorOpen && <CameraEditor camera={camera.record} floorLabel={camera.floorLabel} onClose={() => setEditorOpen(false)} onSaved={saved} />}
      {camera && lifecycleConfirmOpen && <Dialog title="Deactivate camera?" busy={lifecycleBusy} onClose={() => { setLifecycleConfirmOpen(false); setLifecycleError(''); }}>
        <p className={s.dialogText}>Deactivate <strong>{camera.code}</strong>? Its connection will be disabled and health will become UNKNOWN.</p>
        <p className={s.dialogText}>Camera metadata, source configuration, zone mappings, health events and incident history are retained. You can reactivate it later.</p>
        {lifecycleError && <p className={s.errorBanner} role="alert">{lifecycleError}</p>}
        <div className={s.dialogActions}><Button variant="secondary" data-autofocus disabled={lifecycleBusy} onClick={() => setLifecycleConfirmOpen(false)}>Cancel</Button><Button className={s.confirmDeactivate} disabled={lifecycleBusy} onClick={() => void changeLifecycle(camera, 'INACTIVE')}>{lifecycleBusy ? 'Deactivating…' : 'Deactivate camera'}</Button></div>
      </Dialog>}
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
    record: camera,
    id: camera.cameraId,
    code: camera.code,
    name: camera.name,
    floorId: camera.floorId,
    floor: floorOption.key,
    floorLabel: floorOption.label,
    zones: zones.map((zone) => ({ zoneId: zone.zoneId, code: zone.code, name: zone.name })),
    status: displayStatus(camera),
    lifecycleStatus: camera.status,
    installed: formatDate(camera.installedAt),
    warrantyUntil: formatDate(camera.warrantyExpiresAt),
    model: [camera.manufacturer, camera.model].filter(Boolean).join(' · ') || '—',
    serial: camera.serialNumber ?? '—',
    lastSeen: formatDate(camera.lastSeenAt),
  };
}

function updateView(current: CameraView, camera: CameraRecord): CameraView {
  return {
    ...current,
    record: camera,
    code: camera.code,
    name: camera.name,
    status: displayStatus(camera),
    lifecycleStatus: camera.status,
    installed: formatDate(camera.installedAt),
    warrantyUntil: formatDate(camera.warrantyExpiresAt),
    model: [camera.manufacturer, camera.model].filter(Boolean).join(' · ') || '—',
    serial: camera.serialNumber ?? '—',
    lastSeen: formatDate(camera.lastSeenAt),
  };
}

function displayStatus(camera: CameraRecord): CameraDisplayStatus {
  if (camera.status !== 'ACTIVE') return 'Inactive';
  if (camera.healthStatus === 'ONLINE') return 'Online';
  if (camera.healthStatus === 'OFFLINE') return 'Offline';
  return 'Not checked';
}

function cameraSummary(total: number, counts: { online: number; offline: number; notChecked: number; inactive: number }): string {
  return [
    `${total} cameras`,
    `${counts.online} online`,
    `${counts.offline} offline`,
    `${counts.notChecked} not checked`,
    counts.inactive ? `${counts.inactive} inactive` : '',
  ].filter(Boolean).join(' · ');
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB').format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function connectionBadge(camera: CameraView, connection: ConnectionView | null, preview: PreviewState, mode: ViewMode, previewFailed: boolean) {
  if (camera.lifecycleStatus !== 'ACTIVE') return { label: 'Inactive', tone: 'neutral' as const };
  if (preview === 'running') return { label: mode === 'live' ? 'LIVE FEED' : 'AI DETECTION', tone: 'success' as const };
  if (previewFailed) return { label: 'Source unavailable', tone: 'danger' as const };
  if (preview === 'connecting' || preview === 'starting' || connection?.cameraId !== camera.id || connection.state === 'checking') return { label: 'Connecting…', tone: 'warning' as const };
  if (connection.state === 'failed') return { label: 'Source test failed', tone: 'danger' as const };
  if (connection.state === 'ready') {
    if (camera.status === 'Offline') return { label: 'Offline', tone: 'danger' as const };
    if (camera.status === 'Online') return { label: 'Online', tone: 'success' as const };
    return { label: 'Configured', tone: 'neutral' as const };
  }
  return { label: 'Not configured', tone: 'neutral' as const };
}

function connectionDetail(camera: CameraView, connection: ConnectionView | null): string {
  if (camera.lifecycleStatus !== 'ACTIVE') return 'Inactive';
  if (connection?.cameraId !== camera.id || connection.state === 'checking') return 'Checking…';
  if (connection.state === 'ready') return 'Passed';
  if (connection.state === 'failed') return 'Failed';
  return 'Not tested';
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className={s.kv}><dt>{k}</dt><dd>{v}</dd></div>;
}

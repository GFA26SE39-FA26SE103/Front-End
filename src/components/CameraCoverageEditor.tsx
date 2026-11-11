import { useEffect, useState } from 'react';
import { getCameraPreview, listCameraMappings, removeCameraMapping, saveCameraMapping,
  type CameraRecord, type CameraZoneMapping, type ZoneRecord } from '../api/cameras';
import { PolygonRoiEditor, type RoiDraft } from './PolygonRoiEditor';
import { validateRoiPolygon } from './roiPolygonValidation';
import { CheckoutCoverageEditor } from './CheckoutCoverageEditor';
import { Button, CardHeader, Chip } from './ui';
import s from './CameraCoverageEditor.module.css';

export type CameraCoverageEditorProps = { camera: CameraRecord; zones: ZoneRecord[]; onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void };
const emptyDraft = (): RoiDraft => ({ points: [], complete: false, editing: false });
const messageOf = (reason: unknown, fallback: string) => reason instanceof Error && reason.message ? reason.message : fallback;

export function CameraCoverageEditor(props: CameraCoverageEditorProps) {
  return <CoverageSession key={props.camera.cameraId} {...props} />;
}

function CoverageSession({ camera, zones, onClose, onDirtyChange, onBusyChange }: CameraCoverageEditorProps) {
  const [mode, setMode] = useState<'zone' | 'checkout'>('zone');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const discard = () => !dirty || window.confirm('Discard unsaved ROI or counter changes?');
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const floorZones = zones.filter(z => z.floorId === camera.floorId);
  return <section className={s.editor} aria-label={`Coverage configuration for ${camera.code}`}>
    <div className={s.header}>
      <CardHeader title="Camera coverage" subtitle={`${camera.code} · Draw the regions seen by this camera.`} />
      <Button variant="secondary" disabled={busy} onClick={() => { if (discard()) onClose(); }}>Back to floor plan</Button>
    </div>
    <div className={s.modeBar} role="group" aria-label="ROI mode">
      {(['zone', 'checkout'] as const).map(value => <Button key={value} variant={mode === value ? 'primary' : 'secondary'} aria-pressed={mode === value} disabled={busy}
        onClick={() => { if (value !== mode && discard()) { setDirty(false); setMode(value); } }}>
        {value === 'zone' ? 'Zone monitoring ROI' : 'Checkout counter ROI'}
      </Button>)}
    </div>
    {mode === 'checkout' ? <CheckoutCoverageEditor camera={camera} zones={floorZones} onDirtyChange={setDirty} onBusyChange={setBusy} />
      : <ZoneCoverageEditor camera={camera} zones={floorZones} onDirtyChange={setDirty} onBusyChange={setBusy} />}
  </section>;
}

function ZoneCoverageEditor({ camera, zones, onDirtyChange, onBusyChange }: Omit<CameraCoverageEditorProps, 'onClose'> & {
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [mappings, setMappings] = useState<CameraZoneMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('');
  const [active, setActive] = useState('');
  const [draft, setDraft] = useState<RoiDraft>(emptyDraft);
  const [editSession, setEditSession] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined;
    void getCameraPreview(camera.cameraId, controller.signal).then(blob => {
      if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setPreviewUrl(objectUrl);
    }).catch(e => { if (!controller.signal.aborted) setError(messageOf(e, 'Could not load a camera preview.')); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    void listCameraMappings(camera.cameraId, controller.signal).then(rows => { if (!controller.signal.aborted) setMappings(rows); })
      .catch(e => { if (!controller.signal.aborted) setError(messageOf(e, 'Could not load camera coverage.')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [camera.cameraId]);
  const zoneById = (id: string) => zones.find(z => z.zoneId === id);
  const confirmChange = () => !dirty || window.confirm('Discard unsaved ROI changes?');
  const edit = (mapping: CameraZoneMapping) => {
    if (!confirmChange()) return;
    setTarget(mapping.zoneId); setActive(mapping.zoneId);
    setEditSession(n => n + 1);
    setDraft({ points: mapping.roiPolygon.map(p => ({ ...p })), complete: true, editing: true });
    setDirty(false); setError(''); setMessage('');
  };
  const save = async () => {
    const zoneId = active || target;
    const issue = validateRoiPolygon(draft.points);
    if (!zoneId || !draft.complete || issue) { setError(issue ?? 'Close the ROI polygon before saving.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await saveCameraMapping(camera.cameraId, zoneId, { roiPolygon: draft.points, status: 'ACTIVE' });
      setMappings(rows => [...rows.filter(m => m.zoneId !== saved.zoneId), saved]);
      setActive(saved.zoneId); setDirty(false); setMessage(`${zoneById(zoneId)?.name ?? 'Zone'} mapped.`);
    } catch (e) { setError(messageOf(e, 'Could not save the ROI.')); }
    finally { setBusy(false); }
  };
  const remove = async (mapping: CameraZoneMapping) => {
    if (!confirmChange()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await removeCameraMapping(camera.cameraId, mapping.zoneId);
      setMappings(rows => rows.filter(m => m.zoneId !== mapping.zoneId));
      if (active === mapping.zoneId) { setActive(''); setDraft(emptyDraft()); setDirty(false); }
      setMessage(`${zoneById(mapping.zoneId)?.name ?? 'Zone'} mapping removed.`);
    } catch (e) { setError(messageOf(e, 'Could not remove the ROI.')); }
    finally { setBusy(false); }
  };
  return <div className={s.layout}>
    <PolygonRoiEditor key={`${active || target}:${editSession}`} previewUrl={previewUrl} previewLoading={previewLoading} cameraCode={camera.code}
      draft={draft} disabled={busy || loading} canDraw={Boolean(target)} color={zoneById(active || target)?.colorHex ?? '#3B82F6'}
      onChange={next => { setActive(target); setDraft(next); setDirty(true); setError(''); setMessage(''); }}
      backgroundRois={mappings.filter(m => m.zoneId !== active).map(m => ({ id: m.cameraZoneId, points: m.roiPolygon, color: zoneById(m.zoneId)?.colorHex ?? '#3B82F6' }))} />
    <aside className={s.controls}>
      <label className={s.field}>Target zone<select value={target} disabled={!previewUrl || busy || loading} onChange={e => {
        if (!confirmChange()) return;
        setTarget(e.target.value); setActive(''); setDraft(emptyDraft()); setDirty(false); setError(''); setMessage('');
      }}><option value="">Select a zone</option>{zones.map(z => <option key={z.zoneId} value={z.zoneId}>{z.name} ({z.code})</option>)}</select></label>
      {(active || draft.points.length > 0) && <Button disabled={!draft.complete || draft.points.length < 3 || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save ROI'}</Button>}
      <p className={s.hint}>Map a floor zone to its visible region in this camera. This does not project floor-map geometry.</p>
      <div className={s.mappingHeader}><strong>Mapped zones</strong><Chip tone="neutral">{mappings.length}</Chip></div>
      {loading ? <p className={s.muted}>Loading mappings…</p> : mappings.length === 0 ? <p className={s.muted}>No zones are mapped to this camera yet.</p>
        : <ul className={s.mappingList}>{mappings.map(mapping => {
          const zone = zoneById(mapping.zoneId), name = zone?.name ?? 'Unknown zone';
          return <li key={mapping.cameraZoneId}>
            <span className={s.zoneDot} style={{ backgroundColor: zone?.colorHex ?? '#3B82F6' }} aria-hidden="true" /><span><strong>{name}</strong><small>{mapping.roiPolygon.length} points</small></span>
            {mapping.status === 'ACTIVE' && <a href={`/admin/ai-config?zoneId=${encodeURIComponent(mapping.zoneId)}`} onClick={e => { if (!confirmChange()) e.preventDefault(); }}>Configure monitoring for {name}</a>}
            <button type="button" disabled={!previewUrl || busy} onClick={() => edit(mapping)}>Edit ROI for {name}</button>
            <button type="button" className={s.remove} disabled={busy} onClick={() => void remove(mapping)}>Remove ROI for {name}</button>
          </li>;
        })}</ul>}
      {error && <p className={s.error} role="alert">{error}</p>}{message && <p className={s.success} role="status">{message}</p>}
    </aside>
  </div>;
}

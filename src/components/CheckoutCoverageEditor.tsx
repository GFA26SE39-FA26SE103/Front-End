import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { getCameraPreview, type CameraRecord, type ZoneRecord } from '../api/cameras';
import { ApiError } from '../api/client';
import {
  createCheckoutCounter, deleteCheckoutCounter, deleteCheckoutMapping, listCameraCheckoutMappings,
  listCheckoutCounters, listCounterCheckoutMappings, saveCheckoutMapping, updateCheckoutCounter,
  type CheckoutCounter, type CheckoutMapping, type CheckoutCounterRequest, type CheckoutMappingRequest,
} from '../api/checkout';
import { PolygonRoiEditor, type RoiDraft } from './PolygonRoiEditor';
import { validateRoiPolygon } from './roiPolygonValidation';
import { useRoiMonitoringStatus } from './useRoiMonitoringStatus';
import { Button, Chip } from './ui';
import z from './CameraCoverageEditor.module.css';
import s from './CheckoutCoverageEditor.module.css';

export type CheckoutCoverageEditorProps = {
  camera: CameraRecord;
  zones: ZoneRecord[];
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
};
type CounterForm = { code: string; name: string; isEnabled: boolean };
type MappingForm = { lane: RoiDraft; staff: RoiDraft; service: RoiDraft; isEnabled: boolean; isQueueSource: boolean };
const emptyRoi = (): RoiDraft => ({ points: [], complete: false, editing: false });
const counterForm = (counter: CheckoutCounter | null): CounterForm => ({
  code: counter?.code ?? '', name: counter?.name ?? '', isEnabled: counter?.isEnabled ?? false,
});
const mappingForm = (mapping: CheckoutMapping | null): MappingForm => ({
  lane: mapping ? { points: mapping.laneRoi.map(p => ({ ...p })), complete: true, editing: true } : emptyRoi(),
  staff: mapping ? { points: mapping.staffRoi.map(p => ({ ...p })), complete: true, editing: true } : emptyRoi(),
  service: mapping?.serviceRoi ? { points: mapping.serviceRoi.map(p => ({ ...p })), complete: true, editing: true } : emptyRoi(),
  isEnabled: mapping?.isEnabled ?? false, isQueueSource: mapping?.isQueueSource ?? false,
});
const mappingValue = (form: MappingForm) => JSON.stringify({
  lane: form.lane.points, laneComplete: form.lane.complete, staff: form.staff.points,
  staffComplete: form.staff.complete, service: form.service.points, serviceComplete: form.service.complete,
  isEnabled: form.isEnabled, isQueueSource: form.isQueueSource,
});
const queueSources = (mappings: CheckoutMapping[]) => mappings.filter(m => m.isEnabled && m.isQueueSource);
function errorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'Could not update checkout configuration.';
  if (reason instanceof ApiError && reason.status === 409)
    return `${message} Your draft and saved version were kept. Use Reload saved checkout data explicitly to resolve the conflict.`;
  if (reason instanceof ApiError && reason.status === 503) return `Checkout configuration unavailable (503). ${message}`;
  return message;
}

export function CheckoutCoverageEditor(props: CheckoutCoverageEditorProps) {
  return <CheckoutSession key={`${props.camera.cameraId}:${props.camera.floorId}`} {...props} />;
}

function CheckoutSession({ camera, zones, onDirtyChange, onBusyChange }: CheckoutCoverageEditorProps) {
  const availableZones = zones.filter(z => z.floorId === camera.floorId && z.zoneType === 'CHECKOUT');
  const [zoneId, setZoneId] = useState('');
  const monitoring = useRoiMonitoringStatus([zoneId]);
  const monitoringStatus = monitoring.status(zoneId);
  const readOnly = Boolean(zoneId) && monitoringStatus !== 'editable';
  const [counterId, setCounterId] = useState('');
  const [counters, setCounters] = useState<CheckoutCounter[]>([]);
  const [baseline, setBaseline] = useState<CheckoutCounter | null>(null);
  const [counter, setCounter] = useState<CounterForm>(() => counterForm(null));
  const [mappingBaseline, setMappingBaseline] = useState<CheckoutMapping | null>(null);
  const [mapping, setMapping] = useState<MappingForm>(() => mappingForm(null));
  const [sources, setSources] = useState<CheckoutMapping[]>([]);
  const [target, setTarget] = useState<'lane' | 'staff' | 'service'>('lane');
  const [reloadKey, setReloadKey] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const alive = useRef(true);
  const revision = useRef(0);
  const readAbort = useRef<AbortController | null>(null);
  const busyLock = useRef(false);
  const callbacks = useRef({ onDirtyChange, onBusyChange });
  const dirty = JSON.stringify(counter) !== JSON.stringify(counterForm(baseline))
    || Boolean(counterId) && mappingValue(mapping) !== mappingValue(mappingForm(mappingBaseline));

  useEffect(() => {
    callbacks.current.onDirtyChange = onDirtyChange;
    callbacks.current.onBusyChange = onBusyChange;
  }, [onDirtyChange, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    const notifications = callbacks.current;
    return () => {
      alive.current = false;
      notifications.onDirtyChange?.(false);
      notifications.onBusyChange?.(false);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void getCameraPreview(camera.cameraId, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }).catch(reason => {
      if (!controller.signal.aborted) setPreviewError(errorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [camera.cameraId, previewKey]);

  useEffect(() => {
    if (!zoneId) return;
    const controller = new AbortController();
    readAbort.current = controller;
    const token = ++revision.current;
    void Promise.all([
      listCheckoutCounters(zoneId, controller.signal),
      listCameraCheckoutMappings(camera.cameraId, controller.signal),
      counterId ? listCounterCheckoutMappings(counterId, controller.signal) : Promise.resolve<CheckoutMapping[]>([]),
    ]).then(([rows, cameraMappings, counterMappings]) => {
      if (controller.signal.aborted || token !== revision.current || !alive.current) return;
      // Scoped APIs are bounded; reject overflow rather than silently omit counter/source coverage.
      if (rows.length > 128 || cameraMappings.length > 128 || counterMappings.length > 16)
        throw new Error('Checkout configuration exceeds the supported counter or camera-source limits.');
      const selected = counterId ? rows.find(c => c.checkoutCounterId === counterId) : null;
      if (counterId && !selected) throw new Error('This counter no longer exists. Select another counter or reload.');
      const own = counterMappings.filter(m => m.cameraId === camera.cameraId);
      const cameraOwn = cameraMappings.filter(m => m.checkoutCounterId === counterId);
      if (own.length > 1 || cameraOwn.length > 1 || own[0]?.updatedAt !== cameraOwn[0]?.updatedAt)
        throw new Error('Checkout mapping changed while loading. Reload saved checkout data.');
      setCounters(rows);
      setBaseline(selected ?? null);
      setCounter(counterForm(selected ?? null));
      setMappingBaseline(own[0] ?? null);
      setMapping(mappingForm(own[0] ?? null));
      setSources(counterMappings);
      setEditorKey(k => k + 1);
    }).catch(reason => {
      if (!controller.signal.aborted && token === revision.current && alive.current) setLoadError(errorMessage(reason));
    }).finally(() => {
      if (!controller.signal.aborted && token === revision.current && alive.current) setLoading(false);
    });
    return () => controller.abort();
  }, [camera.cameraId, zoneId, counterId, reloadKey]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved checkout changes?');
  const resetDrafts = () => {
    setBaseline(null); setCounter(counterForm(null)); setMappingBaseline(null); setMapping(mappingForm(null));
    setSources([]); setTarget('lane'); setError(''); setMessage(''); setLoadError('');
  };
  const select = (nextZone: string, nextCounter: string) => {
    if (busyLock.current || !confirmDiscard()) return;
    revision.current++; readAbort.current?.abort();
    if (nextZone !== zoneId) setCounters([]);
    resetDrafts();
    setLoading(Boolean(nextZone)); setZoneId(nextZone); setCounterId(nextCounter);
  };
  const reload = () => {
    if (busyLock.current || !confirmDiscard()) return;
    revision.current++; readAbort.current?.abort();
    setLoading(true); setLoadError(''); setError(''); setMessage(''); setReloadKey(k => k + 1);
    monitoring.reload();
  };
  const blocked = busy || loading || Boolean(loadError) || !zoneId || readOnly;
  async function mutate<T>(work: () => Promise<T>, apply: (value: T) => void) {
    if (busyLock.current || blocked) return;
    const token = revision.current;
    busyLock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await work();
      if (alive.current && token === revision.current) apply(result);
    } catch (reason) {
      if (alive.current && token === revision.current) {
        if (reason instanceof ApiError && reason.code === 'MONITORING_ACTIVE') monitoring.reload();
        setError(errorMessage(reason));
      }
    } finally {
      busyLock.current = false;
      if (alive.current && token === revision.current) setBusy(false);
    }
  }
  const saveCounter = () => {
    if (blocked || busyLock.current) return;
    const code = counter.code.trim(), name = counter.name.trim();
    if (!code || code.length > 50 || !name || name.length > 100) {
      setError('Enter a counter code (up to 50 characters) and name (up to 100 characters).'); return;
    }
    if (counterId && counter.isEnabled && queueSources(sources).length !== 1) {
      setError('An enabled counter requires exactly one enabled queue source. Save its camera mapping first.'); return;
    }
    const request: CheckoutCounterRequest = { code, name, isEnabled: counterId ? counter.isEnabled : false,
      ...(baseline ? { expectedUpdatedAt: baseline.updatedAt } : {}) };
    void mutate(() => counterId ? updateCheckoutCounter(counterId, request) : createCheckoutCounter(zoneId, request), saved => {
      if (saved.zoneId !== zoneId || counterId && saved.checkoutCounterId !== counterId)
        throw new Error('The server returned a different counter. Reload saved checkout data.');
      setCounters(rows => [...rows.filter(c => c.checkoutCounterId !== saved.checkoutCounterId), saved]);
      if (!counterId) setLoading(true);
      setBaseline(saved); setCounter(counterForm(saved)); setCounterId(saved.checkoutCounterId);
      setMessage('Checkout counter saved. New counters remain disabled until coverage is configured.');
    });
  };
  const saveMapping = () => {
    if (blocked || busyLock.current || !counterId || !baseline) return;
    const count = queueSources(sources.filter(m => m.cameraId !== camera.cameraId)).length
      + Number(mapping.isEnabled && mapping.isQueueSource);
    if (count > 1) { setError('Another camera is already the queue source. Keep only one enabled queue source and switch manually.'); return; }
    for (const [label, roi] of [['Lane ROI', mapping.lane], ['Staff ROI', mapping.staff],
      ...(mapping.isQueueSource ? [['Service ROI', mapping.service] as const] : [])] as const) {
      if (!roi.complete) { setError(`${label}: close the polygon before saving.`); return; }
      const problem = validateRoiPolygon(roi.points);
      if (problem) { setError(`${label}: ${problem}`); return; }
    }
    if (mapping.isQueueSource && !mapping.isEnabled) { setError('A queue source must be an enabled mapping.'); return; }
    if (baseline.isEnabled && count !== 1) { setError('Disable the counter and save it before removing or switching its queue source.'); return; }
    const request: CheckoutMappingRequest = {
      laneRoi: mapping.lane.points.map(p => ({ ...p })), staffRoi: mapping.staff.points.map(p => ({ ...p })),
      ...(mapping.service.complete ? { serviceRoi: mapping.service.points.map(p => ({ ...p })) }
        : mappingBaseline?.serviceRoi ? { serviceRoi: null } : {}),
      isEnabled: mapping.isEnabled, isQueueSource: mapping.isQueueSource,
      ...(mappingBaseline ? { expectedUpdatedAt: mappingBaseline.updatedAt } : {}),
    };
    void mutate(() => saveCheckoutMapping(counterId, camera.cameraId, request), saved => {
      if (saved.checkoutCounterId !== counterId || saved.cameraId !== camera.cameraId)
        throw new Error('The server returned a different camera mapping. Reload saved checkout data.');
      setMappingBaseline(saved); setMapping(mappingForm(saved));
      setSources(rows => [...rows.filter(m => m.cameraId !== camera.cameraId), saved]);
      setEditorKey(k => k + 1); setMessage('Checkout ROIs saved together.');
    });
  };
  const otherSources = sources.filter(m => m.cameraId !== camera.cameraId);
  const otherQueue = queueSources(otherSources);
  const canDeleteMapping = Boolean(mappingBaseline) && (!baseline?.isEnabled || otherQueue.length === 1);
  const canDeleteCounter = Boolean(baseline) && !baseline?.isEnabled && sources.every(m => !m.isEnabled);
  const removeMapping = () => {
    if (!mappingBaseline || !canDeleteMapping || blocked || busyLock.current
      || !window.confirm(`Delete this camera mapping for ${baseline?.code}? Other camera mappings will be kept.`)) return;
    void mutate(() => deleteCheckoutMapping(counterId, camera.cameraId, mappingBaseline.updatedAt), () => {
      setMappingBaseline(null); setMapping(mappingForm(null));
      setSources(rows => rows.filter(m => m.cameraId !== camera.cameraId)); setEditorKey(k => k + 1);
      setMessage('This camera mapping deleted. Other camera coverage was kept.');
    });
  };
  const removeCounter = () => {
    if (!baseline || !canDeleteCounter || blocked || busyLock.current
      || !window.confirm(`Delete counter ${baseline.code} and all ${sources.length} camera mappings, including other cameras? This cannot be undone.`)) return;
    void mutate(() => deleteCheckoutCounter(counterId, baseline.updatedAt), () => {
      setCounters(rows => rows.filter(c => c.checkoutCounterId !== counterId));
      resetDrafts(); setLoading(true); setCounterId(''); setMessage('Checkout counter and all its camera mappings deleted.');
    });
  };
  const followMonitoring = (event: MouseEvent<HTMLAnchorElement>) => {
    if (busyLock.current || !confirmDiscard()) event.preventDefault();
  };
  type RoiKey = 'lane' | 'staff' | 'service';
  const ROI_KEYS: RoiKey[] = ['lane', 'staff', 'service'];
  const roiName = (key: RoiKey) => key === 'lane' ? 'Lane ROI' : key === 'staff' ? 'Staff ROI' : 'Service ROI';
  // Hex colours: SVG fill/stroke attributes cannot resolve CSS var(), which left checkout shapes invisible.
  const roiColor = (key: RoiKey) => key === 'lane' ? '#2563EB' : key === 'staff' ? '#7C5CC4' : '#16965F';
  const shownMapping = readOnly ? mappingForm(mappingBaseline) : mapping;
  const roiStatus = (key: RoiKey) => {
    const roi = shownMapping[key];
    if (roi.complete) return `Closed · ${roi.points.length} points`;
    if (roi.points.length) return `Not closed · ${roi.points.length} points`;
    if (key === 'service') return shownMapping.isQueueSource ? 'Required for the queue source' : 'Optional unless queue source';
    return 'Required';
  };
  const label = roiName(target);
  const canDraw = Boolean(counterId) && !blocked;
  const hint = !zoneId ? 'Select the checkout zone this camera covers.'
    : !counterId ? 'Select a counter, or create one first, to draw its Lane, Staff and Service ROIs.'
      : !mapping[target].complete ? `Draw the ${label} on the camera image and select Finish shape.`
        : dirty ? 'Close Lane and Staff ROIs (and Service ROI for the queue source), then save the mapping.'
          : 'The saved ROIs are shown on the camera image.';

  return <section className={s.editor} aria-label={`Checkout coverage for ${camera.code}`} aria-busy={busy || loading}>
    <div className={z.layout}>
      <PolygonRoiEditor key={`${counterId}:${target}:${editorKey}`} cameraCode={camera.code} previewUrl={previewUrl} previewLoading={previewLoading}
        label={label} color={roiColor(target)} draft={shownMapping[target]} canDraw={Boolean(counterId)}
        disabled={!canDraw} readOnly={readOnly} onChange={draft => { if (canDraw) setMapping(v => ({ ...v, [target]: draft })); }}
        backgroundRois={ROI_KEYS.filter(key => key !== target && shownMapping[key].points.length)
          .map(key => ({ id: key, points: shownMapping[key].points, color: roiColor(key),
            label: `${roiName(key)}${shownMapping[key].complete ? '' : ' (incomplete)'}` }))} />
      <aside className={z.controls}>
        <label className={z.field}>Checkout zone
          <select value={zoneId} disabled={busy} onChange={e => select(e.target.value, '')}>
            <option value="">Select a checkout zone</option>
            {availableZones.map(zone => <option key={zone.zoneId} value={zone.zoneId}>{zone.name} ({zone.code})</option>)}
          </select>
        </label>
        {availableZones.length === 0 && <p className={z.muted}>Create a CHECKOUT zone on this camera's floor first.</p>}
        {zoneId && <a className={s.link} href={`/admin/ai-config?zoneId=${encodeURIComponent(zoneId)}`} onClick={followMonitoring} aria-disabled={busy}>Configure checkout monitoring</a>}
        {readOnly && <p className={z.monitoringLock} role="status">{monitoringStatus === 'active'
          ? 'Monitoring is active. Deactivate it before editing checkout ROIs or counters.'
          : monitoringStatus === 'checking' ? 'Checking monitoring status…' : 'Monitoring status could not be checked. Reload saved checkout data to retry.'}</p>}
        <label className={z.field}>Checkout counter
          <select value={counterId} disabled={!zoneId || busy || counters.length === 0} onChange={e => select(zoneId, e.target.value)}>
            <option value="">New counter (disabled first)</option>
            {counters.map(c => <option key={c.checkoutCounterId} value={c.checkoutCounterId}>{c.code} · {c.name}{c.isEnabled ? ' · enabled' : ' · disabled'}</option>)}
          </select>
        </label>
        {loading && <p className={z.muted} role="status">Loading checkout configuration…</p>}

        {zoneId && <form className={s.group} noValidate onSubmit={event => { event.preventDefault(); saveCounter(); }}>
          <strong className={s.groupTitle}>{counterId ? 'Counter' : 'Create disabled counter'}</strong>
          {!loading && !loadError && counters.length === 0 && <p className={z.muted}>No counters in this checkout zone yet.</p>}
          <fieldset className={s.fields} disabled={blocked}>
            <label className={s.field}>Counter code<input value={counter.code} maxLength={50} onChange={e => setCounter(v => ({ ...v, code: e.target.value }))} /></label>
            <label className={s.field}>Counter name<input value={counter.name} maxLength={100} onChange={e => setCounter(v => ({ ...v, name: e.target.value }))} /></label>
            <label className={s.check}><input type="checkbox" checked={counter.isEnabled} disabled={!counterId} onChange={e => setCounter(v => ({ ...v, isEnabled: e.target.checked }))} />Counter enabled</label>
            <div className={s.actions}>
              <Button type="submit">{counterId ? 'Save counter' : 'Create disabled counter'}</Button>
              {counterId && <Button variant="dangerGhost" disabled={!canDeleteCounter} onClick={removeCounter}>Delete counter</Button>}
            </div>
          </fieldset>
          {!readOnly && counterId && !canDeleteCounter && <p className={z.muted}>Disable the counter and all its camera mappings before deleting it.</p>}
        </form>}

        {zoneId && <form className={s.group} noValidate onSubmit={event => { event.preventDefault(); saveMapping(); }}>
          <strong className={s.groupTitle}>Checkout ROIs</strong>
          <ul className={z.mappingList} aria-label="Checkout ROI legend">
            {ROI_KEYS.map(key => <li key={key} className={target === key ? s.activeRoi : undefined}>
              <span className={z.zoneDot} style={{ backgroundColor: roiColor(key) }} aria-hidden="true" />
              <span><strong>{roiName(key)}</strong><small>{roiStatus(key)}</small></span>
              <button type="button" aria-pressed={target === key} disabled={busy || loading || Boolean(loadError) || !counterId || readOnly && !shownMapping[key].complete}
                onClick={() => setTarget(key)}>{readOnly ? 'View' : 'Edit'} {roiName(key)}</button>
            </li>)}
          </ul>
          <fieldset className={s.fields} disabled={blocked || !counterId}>
            <label className={s.check}><input type="checkbox" checked={mapping.isEnabled} onChange={e => setMapping(v => ({ ...v, isEnabled: e.target.checked }))} />Mapping enabled</label>
            <label className={s.check}><input type="checkbox" checked={mapping.isQueueSource} onChange={e => setMapping(v => ({ ...v, isQueueSource: e.target.checked }))} />Use as queue source</label>
            <div className={s.actions}>
              <Button type="submit">{busy ? 'Saving…' : 'Save checkout mapping'}</Button>
              <Button variant="dangerGhost" disabled={!canDeleteMapping} onClick={removeMapping}>Delete camera mapping</Button>
            </div>
          </fieldset>
          {!readOnly && baseline?.isEnabled && mappingBaseline?.isQueueSource && !canDeleteMapping && <p className={z.muted}>Disable the counter and save before deleting its queue source.</p>}
        </form>}

        {!readOnly && <p className={z.hint}>{hint}</p>}

        {counterId && <>
          <div className={z.mappingHeader}><strong>Saved camera sources</strong><Chip tone="neutral">{sources.length}</Chip></div>
          {sources.length === 0 ? <p className={z.muted}>No camera mappings saved for this counter.</p>
            : <ul className={s.sourceList}>{sources.map(m => <li key={m.mappingId}>{m.cameraId === camera.cameraId ? `${camera.code} (this camera)` : `Camera ${m.cameraId}`} · {m.isEnabled ? 'enabled' : 'disabled'}{m.isQueueSource ? ' · queue source' : ''}</li>)}</ul>}
          {!readOnly && otherQueue.length > 0 && <p className={s.notice}>Queue source: Camera {otherQueue[0].cameraId}. To switch manually, disable and save this counter, edit that other camera to clear its queue-source flag, then select this camera. No automatic failover.</p>}
        </>}

        {zoneId && <Button variant="secondary" disabled={busy || loading} onClick={reload}>Reload saved checkout data</Button>}

        {previewError && <div className={z.error} role="alert">Preview unavailable: {previewError} <Button variant="secondary" disabled={busy || previewLoading} onClick={() => { setPreviewLoading(true); setPreviewUrl(undefined); setPreviewError(''); setPreviewKey(k => k + 1); }}>Retry camera preview</Button></div>}
        {loadError && <div className={z.error} role="alert">{loadError} <Button variant="secondary" disabled={busy || loading} onClick={reload}>Retry checkout load</Button></div>}
        {error && <p className={z.error} role="alert">{error}</p>}
        {message && <p className={z.success} role="status">{message}</p>}
        {busy && <p className={z.muted} role="status">Saving checkout changes…</p>}
      </aside>
    </div>
  </section>;
}

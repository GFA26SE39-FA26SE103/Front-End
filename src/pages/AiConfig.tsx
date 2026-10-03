import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { AnnotatedPreview } from '../components/AnnotatedPreview';
import { Button, Chip } from '../components/ui';
import { ApiError } from '../api/client';
import { listFloors, listSupermarkets, listZones, type ZoneRecord } from '../api/floors';
import { getMonitoring, listIncidentTypes, reviewMonitoring, saveMonitoring, setMonitoringActive, type IncidentType, type MonitoringConfiguration, type MonitoringReview, type MonitoringRule } from '../api/monitoring';
import s from './AiConfig.module.css';

type RuleInput = Omit<MonitoringRule, 'warningThreshold' | 'criticalThreshold' | 'sustainSec' | 'cooldownSec'> & {
  warningThreshold: string; criticalThreshold: string; sustainSec: string; cooldownSec: string;
};
type ZoneOption = ZoneRecord & { location: string };
const inputRule = (r: MonitoringRule): RuleInput => ({ ...r, warningThreshold: String(r.warningThreshold), criticalThreshold: String(r.criticalThreshold), sustainSec: String(r.sustainSec), cooldownSec: String(r.cooldownSec) });
const message = (e: unknown) => e instanceof Error ? e.message : 'The request could not be completed.';
function decimal(raw: string, label: string) {
  if (!/^\d+(\.\d{1,4})?$/.test(raw.trim()) || !Number.isFinite(Number(raw))) throw new Error(label + ' must be a non-negative number with at most 4 decimal places.');
  return Number(raw);
}
function seconds(raw: string, label: string) {
  const n = decimal(raw, label);
  if (!Number.isInteger(n) || n > 2147483647) throw new Error(label + ' must be whole seconds from 0 to 2147483647.');
  return n;
}

export default function AiConfig() {
  const [params, setParams] = useSearchParams();
  const initialZone = useRef(params.get('zoneId'));
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [config, setConfig] = useState<MonitoringConfiguration | null>(null);
  const [name, setName] = useState('');
  const [confidence, setConfidence] = useState('0.5');
  const [rules, setRules] = useState<RuleInput[]>([]);
  const [typeId, setTypeId] = useState('');
  const [review, setReview] = useState<MonitoringReview | null>(null);
  const [previewCameraId, setPreviewCameraId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);
  const resetLoadedState = () => {
    setLoading(true); setLoadFailed(false); setError(''); setConfig(null); setReview(null); setPreviewCameraId(null); setDirty(false); setRules([]);
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [stores, catalog] = await Promise.all([listSupermarkets(controller.signal), listIncidentTypes(controller.signal)]);
        const floors = (await Promise.all(stores.map(async store => (await listFloors(store.supermarketId, controller.signal)).map(f => ({ ...f, storeName: store.name }))))).flat();
        const all = (await Promise.all(floors.map(async f => (await listZones(f.floorId, controller.signal)).map(z => ({ ...z, location: f.storeName + ' / ' + f.name }))))).flat();
        if (controller.signal.aborted) return;
        setTypes(catalog); setZones(all);
        const selected = all.find(z => z.zoneId === initialZone.current) ?? all[0];
        if (initialZone.current && !all.some(z => z.zoneId === initialZone.current)) setNotice('Requested zone was not found. Select an available zone.');
        if (selected) setZoneId(selected.zoneId); else setLoading(false);
      } catch (e) { if (!controller.signal.aborted) { setError(message(e)); setLoading(false); } }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!zoneId) return;
    const controller = new AbortController();
    async function load() {
      try {
        let saved: MonitoringConfiguration | null = null;
        try { saved = await getMonitoring(zoneId, controller.signal); }
        catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
        if (controller.signal.aborted) return;
        setConfig(saved); setName(saved?.name ?? 'Zone monitoring'); setConfidence(String(saved?.confidenceThreshold ?? .5));
        setRules(saved?.rules.map(inputRule) ?? []);
      } catch (e) { if (!controller.signal.aborted) { setLoadFailed(true); setError(message(e)); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [zoneId, reloadKey]);
  const zone = zones.find(z => z.zoneId === zoneId);
  const active = config?.status === 'ACTIVE';
  const locked = loading || busy || active;
  const available = types.filter(t => t.status === 'ACTIVE' && !rules.some(r => r.incidentTypeId === t.incidentTypeId));
  const selectedType = available.find(t => t.incidentTypeId === typeId) ?? available[0];
  const touch = () => { setDirty(true); setReview(null); setPreviewCameraId(null); setNotice(''); setError(''); };
  const changeRule = (id: string, patch: Partial<RuleInput>) => { setRules(all => all.map(r => r.incidentTypeId === id ? { ...r, ...patch } : r)); touch(); };
  const apply = (saved: MonitoringConfiguration) => { setConfig(saved); setName(saved.name); setConfidence(String(saved.confidenceThreshold)); setRules(saved.rules.map(inputRule)); setPreviewCameraId(null); setDirty(false); };
  async function operation(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { if (mounted.current) setError(message(e)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save() {
    await operation(async () => {
      const conf = decimal(confidence, 'Detection confidence');
      if (conf > 1) throw new Error('Detection confidence must be between 0 and 1.');
      if (!name.trim()) throw new Error('Configuration name is required.');
      const parsed = rules.map(r => {
        const label = types.find(t => t.incidentTypeId === r.incidentTypeId)?.name ?? 'Rule';
        const warning = decimal(r.warningThreshold, label + ' warning');
        const critical = decimal(r.criticalThreshold, label + ' critical');
        if (warning >= critical) throw new Error(label + ': warning must be less than critical.');
        if (!r.thresholdUnit.trim()) throw new Error(label + ': threshold unit is required.');
        if (r.thresholdUnit === 'PEOPLE' && (!Number.isInteger(warning) || !Number.isInteger(critical))) throw new Error(label + ': people thresholds must be whole numbers.');
        return { incidentTypeId: r.incidentTypeId, warningThreshold: warning, criticalThreshold: critical, thresholdUnit: r.thresholdUnit, sustainSec: seconds(r.sustainSec, label + ' sustain time'), cooldownSec: seconds(r.cooldownSec, label + ' cooldown'), enabled: r.enabled, parametersJson: r.parametersJson };
      });
      const saved = await saveMonitoring(zoneId, { name: name.trim(), confidenceThreshold: conf, rules: parsed, ...(config ? { expectedUpdatedAt: config.updatedAt } : {}) });
      if (mounted.current) { apply(saved); setReview(null); setNotice('Draft saved to database.'); }
    });
  }
  async function changeActive(value: boolean) {
    const version = value ? review?.configuration.updatedAt : config?.updatedAt;
    if (!version || (value && (!review?.canActivate || dirty))) return;
    await operation(async () => {
      const saved = await setMonitoringActive(zoneId, value, version);
      if (mounted.current) { apply(saved); setReview(null); setNotice(value ? 'Configuration activated. MF-02 incident processing is not started by this action.' : 'Monitoring deactivated. Edit and save a new Draft before reactivation.'); }
    });
  }
  return (
    <AdminLayout title="AI Configuration" subtitle="MF-01 · zone rules · review & activate">
      <div className={s.column}>
        <section className={s.panel}>
          <h2 className={s.title}>Configure monitoring for a zone</h2>
          <p className={s.help}>Reuse camera mapping and ROI from Store layout. Draft changes do not change an active configuration.</p>
          <label className={s.field}>Zone
            <select aria-label="Zone" value={zoneId} disabled={loading || busy} onChange={e => {
              if (dirty && !window.confirm('Discard unsaved changes and select another zone?')) return;
              resetLoadedState(); setZoneId(e.target.value); setParams({ zoneId: e.target.value }); setNotice('');
            }}>
              {!zones.length && <option value="">No zones available</option>}
              {zones.map(z => <option key={z.zoneId} value={z.zoneId}>{z.location} · {z.code} · {z.name}</option>)}
            </select>
          </label>
          {loading && <p role="status">Loading configuration…</p>}
          {error && <p className={s.error} role="alert">{error}</p>}
          {notice && <p className={s.saved} role="status">{notice}</p>}
          {zone && !loading && <Button variant="secondary" disabled={busy} onClick={() => {
            if (dirty && !window.confirm('Discard unsaved changes and reload the saved configuration?')) return;
            resetLoadedState(); setReloadKey(k => k + 1); setNotice('');
          }}>Reload saved configuration</Button>}
          {!loading && !zone && <p>Create a store, floor and zone in <a href="/admin/store-layout">Store layout</a> first.</p>}
          {zone && !loading && !loadFailed && <>
            <div className={s.head}><p>{zone.name} · Area: {zone.areaM2 ?? 'not configured'} m² · {zone.status}</p><Chip tone={active ? 'success' : 'neutral'}>{config?.status ?? 'NEW DRAFT'}</Chip></div>
            {active && <p className={s.help}>This saved configuration is active for this zone. Deactivate before changing confidence or rules.</p>}
            <fieldset disabled={locked} className={s.fields}>
              <label className={s.field}>Configuration name<input aria-label="Configuration name" maxLength={100} value={name} onChange={e => { setName(e.target.value); touch(); }} /></label>
              <label className={s.field}>Detection confidence<input aria-label="Detection confidence" type="number" min="0" max="1" step=".0001" value={confidence} onChange={e => { setConfidence(e.target.value); touch(); }} /></label>
            </fieldset>
            <p className={s.help}>Confidence filters detection scores, not incident severity. Save Draft → Review to test the saved zone confidence in AI preview.</p>
            <div className={s.actions}>
              <label className={s.field}>Incident type<select aria-label="Incident type" disabled={locked || !available.length} value={selectedType?.incidentTypeId ?? ''} onChange={e => setTypeId(e.target.value)}>
                {!available.length && <option value="">No more incident types</option>}
                {available.map(t => <option key={t.incidentTypeId} value={t.incidentTypeId}>{t.name}{!t.supported ? ' (disabled Draft only)' : ''}</option>)}
              </select></label>
              <Button disabled={locked || !selectedType} onClick={() => {
                if (!selectedType) return;
                setRules(all => [...all, inputRule({ incidentTypeId: selectedType.incidentTypeId, warningThreshold: selectedType.defaultWarningThreshold ?? 0, criticalThreshold: selectedType.defaultCriticalThreshold ?? 1, thresholdUnit: selectedType.thresholdUnit ?? '', sustainSec: 30, cooldownSec: 300, enabled: selectedType.supported, parametersJson: null })]); touch();
              }}>Add rule</Button>
            </div>
            {!rules.length && <p className={s.help}>No rules yet. An empty Draft can be saved but cannot be activated.</p>}
            {rules.map(r => {
              const t = types.find(t => t.incidentTypeId === r.incidentTypeId);
              const label = t?.name ?? r.incidentName ?? 'Unknown incident type';
              return <section key={r.incidentTypeId} className={s.rule}>
                <div className={s.head}><h3>{label}</h3><Button variant="secondary" disabled={locked} onClick={() => { setRules(all => all.filter(x => x.incidentTypeId !== r.incidentTypeId)); touch(); }}>Remove {label}</Button></div>
                {t?.unsupportedReason && <p className={s.help}>{t.unsupportedReason}</p>}
                <fieldset disabled={locked} className={s.fields}>
                  <label className={s.field}>Warning threshold ≥<input aria-label={label + ' warning'} type="number" min="0" step={r.thresholdUnit === 'PEOPLE' ? '1' : '.0001'} value={r.warningThreshold} onChange={e => changeRule(r.incidentTypeId, { warningThreshold: e.target.value })} /></label>
                  <label className={s.field}>Critical threshold ≥<input aria-label={label + ' critical'} type="number" min="0" step={r.thresholdUnit === 'PEOPLE' ? '1' : '.0001'} value={r.criticalThreshold} onChange={e => changeRule(r.incidentTypeId, { criticalThreshold: e.target.value })} /></label>
                  <label className={s.field}>Threshold unit<input aria-label={label + ' unit'} value={r.thresholdUnit} maxLength={30} readOnly={!!t?.thresholdUnit} onChange={e => changeRule(r.incidentTypeId, { thresholdUnit: e.target.value })} /></label>
                  <label className={s.field}>Sustain time (seconds)<input aria-label={label + ' sustain time'} type="number" min="0" step="1" value={r.sustainSec} onChange={e => changeRule(r.incidentTypeId, { sustainSec: e.target.value })} /></label>
                  <label className={s.field}>Cooldown (seconds)<input aria-label={label + ' cooldown'} type="number" min="0" step="1" value={r.cooldownSec} onChange={e => changeRule(r.incidentTypeId, { cooldownSec: e.target.value })} /></label>
                  <label className={s.check}><input type="checkbox" aria-label={label + ' enabled'} checked={r.enabled} disabled={!t?.supported || t.status !== 'ACTIVE'} onChange={e => changeRule(r.incidentTypeId, { enabled: e.target.checked })} />Enabled</label>
                </fieldset>
              </section>;
            })}
            <p className={s.help}>Warning &lt; critical. Sustain is the continuous time above threshold. Cooldown starts after incident closure (MF-02). Crowd density needs a positive zone area.</p>
            <div className={s.actions}>
              <Button disabled={locked} onClick={() => void save()}>Save Draft</Button>
              <Button variant="secondary" disabled={loading || busy || !config || dirty} onClick={() => { setReview(null); void operation(async () => { const result = await reviewMonitoring(zoneId); if (mounted.current) { apply(result.configuration); setReview(result); } }); }}>Review configuration</Button>
              {active && <Button variant="secondary" disabled={busy} onClick={() => void changeActive(false)}>Deactivate configuration</Button>}
              {dirty && <span className={s.help}>Unsaved changes — save Draft before review.</span>}
            </div>
          </>}
        </section>
        {review && <section className={s.panel}>
          <h2 className={s.title}>Review & activate</h2>
          <p>Zone: {review.zone.name} · Configuration: {review.configuration.name} · {review.configuration.status}</p>
          <p className={s.help}>Saved version: {review.configuration.updatedAt} · Confidence: {review.configuration.confidenceThreshold}</p>
          <ul>{review.configuration.rules.map(r => <li key={r.incidentTypeId}>{r.incidentName ?? types.find(t => t.incidentTypeId === r.incidentTypeId)?.name}: {r.enabled ? 'Enabled' : 'Disabled'} · warning ≥ {r.warningThreshold}, critical ≥ {r.criticalThreshold} {r.thresholdUnit} · sustain {r.sustainSec}s · cooldown {r.cooldownSec}s</li>)}</ul>
          <h3>Mapped cameras & camera ROI</h3>
          <p className={s.help}><a href="/admin/store-layout">Review or edit camera ROI in Store layout</a> (deactivate an active configuration before editing).</p>
          {!review.cameras.length && <p>No active camera mapping.</p>}
          {review.cameras.map(c => <div key={c.cameraId} className={s.rule}>
            <strong>{c.code}</strong><p>{c.name} · {c.sourceType ?? 'No source'} / {c.protocol ?? '—'} · {c.ready ? 'Ready' : 'Not ready'}</p>
            <p className={s.help}>ROI: {c.roiPolygon.length} points · Connection: {c.isEnabled ? 'Enabled' : 'Disabled'} · Last test: {c.lastTestResult ?? 'Not tested'}{c.lastTestedAt ? ' / ' + c.lastTestedAt : ''}</p>
            {c.roiPolygon.length >= 3 && <svg className={s.roi} viewBox="0 0 100 100" role="img" aria-label={'Saved camera-frame ROI for ' + c.code}><polygon points={c.roiPolygon.map(p => p.x * 100 + ',' + p.y * 100).join(' ')} /></svg>}
            <ul>{c.issues.map(i => <li key={i.code} className={s.error}>{i.message}</li>)}</ul>
            <Button variant="secondary" disabled={!c.ready || busy} onClick={() => setPreviewCameraId(id => id === c.cameraId ? null : c.cameraId)}>{previewCameraId === c.cameraId ? 'Stop zone preview: ' : 'Preview zone confidence: '}{c.code}</Button>
          </div>)}
          {previewCameraId && <div className={s.zonePreview}><AnnotatedPreview cameraId={previewCameraId} zoneId={zoneId} enabled /></div>}
          <ul>{review.issues.map((i, n) => <li key={n} className={s.error}><strong>{i.code}: </strong><span>{i.message}</span></li>)}</ul>
          {review.warnings.map(w => <p key={w} className={s.help}>{w}</p>)}
          <p className={s.help}>Zone preview restarts the shared camera session to apply saved confidence (track IDs reset; another viewer may be interrupted). Boxes cover the camera frame; this preview does not compute ROI incident measurements.</p>
          <Button disabled={busy || dirty || active || !review.canActivate} onClick={() => void changeActive(true)}>Activate configuration</Button>
          <p className={s.help}>The backend rechecks source, mapping, ROI and rules at activation. MF-01 activation does not start MF-02 measurements or generate incidents.</p>
        </section>}
      </div>
    </AdminLayout>
  );
}

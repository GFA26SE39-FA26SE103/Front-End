import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { AnnotatedPreview } from '../components/AnnotatedPreview';
import { Button, Chip, type Tone } from '../components/ui';
import { ApiError } from '../api/client';
import { listFloors, listSupermarkets, listZones, type ZoneRecord } from '../api/floors';
import { getMonitoring, listIncidentTypes, reviewMonitoring, saveMonitoring, setMonitoringActive, type IncidentType, type MonitoringConfiguration, type MonitoringReview, type MonitoringRule } from '../api/monitoring';
import s from './AiConfig.module.css';

type RuleInput = Omit<MonitoringRule, 'warningThreshold' | 'criticalThreshold' | 'sustainSec' | 'cooldownSec'> & {
  warningThreshold: string; criticalThreshold: string; sustainSec: string; cooldownSec: string;
};
type FloorGroup = { floorId: string; name: string; zones: ZoneRecord[] };
// undefined = still loading, null = no configuration saved for the zone, 'error' = could not be loaded.
type ConfigSummary = MonitoringConfiguration | null | 'error' | undefined;

const inputRule = (r: MonitoringRule): RuleInput => ({ ...r, warningThreshold: String(r.warningThreshold), criticalThreshold: String(r.criticalThreshold), sustainSec: String(r.sustainSec), cooldownSec: String(r.cooldownSec) });
const message = (e: unknown) => e instanceof Error ? e.message : 'The request could not be completed.';
const RULE_REQUIRED = 'Add at least one incident rule before saving. Choose an incident type and click Add rule.';
function decimal(raw: string, label: string) {
  if (!/^\d+(\.\d{1,4})?$/.test(raw.trim()) || !Number.isFinite(Number(raw))) throw new Error(label + ' must be a non-negative number with at most 4 decimal places.');
  return Number(raw);
}
function seconds(raw: string, label: string) {
  const n = decimal(raw, label);
  if (!Number.isInteger(n) || n > 2147483647) throw new Error(label + ' must be whole seconds from 0 to 2147483647.');
  return n;
}
async function loadConfig(zoneId: string, signal?: AbortSignal) {
  try { return await getMonitoring(zoneId, signal); }
  catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}
const statusTone = (status: string | undefined): Tone => status === 'ACTIVE' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral';
const ruleName = (rule: MonitoringRule, types: IncidentType[]) => rule.incidentName ?? types.find(t => t.incidentTypeId === rule.incidentTypeId)?.name ?? 'Unknown incident type';
const formatTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); };

export default function AiConfig() {
  const [params, setParams] = useSearchParams();
  const zoneId = params.get('zoneId') ?? '';
  const editing = params.get('mode') === 'edit';
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ConfigSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [stores, catalog] = await Promise.all([listSupermarkets(controller.signal), listIncidentTypes(controller.signal)]);
        // The system runs with a single default store, so the overview is grouped by floor only.
        const floorRecords = (await Promise.all(stores.map(store => listFloors(store.supermarketId, controller.signal)))).flat()
          .sort((a, b) => a.floorNumber - b.floorNumber);
        const groups = await Promise.all(floorRecords.map(async f => ({ floorId: f.floorId, name: f.name || `Floor ${f.floorNumber}`, zones: await listZones(f.floorId, controller.signal) })));
        if (controller.signal.aborted) return;
        setTypes(catalog); setFloors(groups); setLoading(false);
        const zones = groups.flatMap(g => g.zones);
        await Promise.all(zones.map(async z => {
          let summary: ConfigSummary;
          try { summary = await loadConfig(z.zoneId, controller.signal); } catch { summary = 'error'; }
          if (!controller.signal.aborted) setSummaries(all => ({ ...all, [z.zoneId]: summary }));
        }));
      } catch (e) { if (!controller.signal.aborted) { setError(message(e)); setLoading(false); } }
    }
    void load();
    return () => controller.abort();
  }, []);

  const floor = floors.find(f => f.zones.some(z => z.zoneId === zoneId));
  const zone = floor?.zones.find(z => z.zoneId === zoneId);
  const open = (id: string, edit = false) => setParams(edit ? { zoneId: id, mode: 'edit' } : { zoneId: id });

  return (
    <AdminLayout title="AI Configuration" subtitle="MF-01 · zone monitoring rules · review & activate">
      <div className={s.column}>
        {loading && <p className={s.help} role="status">Loading zones and AI configurations…</p>}
        {error && <p className={s.error} role="alert">{error}</p>}
        {!loading && !error && zone && floor
          ? <ZoneConfig
              key={zone.zoneId}
              zone={zone}
              floorName={floor.name}
              types={types}
              editing={editing}
              onOpen={edit => open(zone.zoneId, edit)}
              onBack={() => setParams({})}
              onChanged={config => setSummaries(all => ({ ...all, [zone.zoneId]: config }))}
            />
          : !loading && !error && <Overview floors={floors} summaries={summaries} types={types} missingZone={Boolean(zoneId)} onOpen={id => open(id)} />}
      </div>
    </AdminLayout>
  );
}

function Overview({ floors, summaries, types, missingZone, onOpen }: {
  floors: FloorGroup[]; summaries: Record<string, ConfigSummary>; types: IncidentType[]; missingZone: boolean; onOpen: (zoneId: string) => void;
}) {
  const zoneCount = floors.reduce((n, f) => n + f.zones.length, 0);
  return <>
    <section className={s.panel}>
      <h2 className={s.title}>AI configuration by zone</h2>
      <p className={s.help}>Each zone has one monitoring configuration: a detection confidence and the incident rules the AI checks. Open a zone to see its configuration, then edit, review and activate it.</p>
      {missingZone && <p className={s.error} role="alert">The requested zone was not found. Choose a zone below.</p>}
      {!zoneCount && <p>No zones yet. Create a floor and draw zones in <a href="/admin/store-layout">Store layout</a> first.</p>}
    </section>
    {floors.filter(f => f.zones.length).map(f => {
      const configured = f.zones.filter(z => { const c = summaries[z.zoneId]; return c && c !== 'error'; }).length;
      return <section key={f.floorId} className={s.panel} aria-label={f.name}>
        <div className={s.head}>
          <h2 className={s.title}>{f.name}</h2>
          <span className={s.help}>{f.zones.length} zone{f.zones.length === 1 ? '' : 's'} · {configured} configured</span>
        </div>
        <div className={s.zoneTable}>
          <div className={`${s.zoneRow} ${s.zoneHeadRow}`} aria-hidden="true">
            <span>ZONE</span><span>STATUS</span><span>CONFIDENCE</span><span>INCIDENT RULES</span><span />
          </div>
          {f.zones.map(z => {
            const c = summaries[z.zoneId];
            const rules = c && c !== 'error' ? c.rules : [];
            return <button key={z.zoneId} type="button" className={s.zoneRow} onClick={() => onOpen(z.zoneId)} aria-label={`Open AI configuration for ${z.name}`}>
              <span className={s.zoneName}><i style={{ background: z.colorHex ?? 'var(--color-primary)' }} /><span><strong>{z.name}</strong><small>{z.code}</small></span></span>
              <span>{c === undefined ? <span className={s.help}>Loading…</span> : c === 'error' ? <Chip tone="danger">Load failed</Chip> : c ? <Chip tone={statusTone(c.status)}>{c.status}</Chip> : <Chip tone="neutral">Not configured</Chip>}</span>
              <span>{c && c !== 'error' ? c.confidenceThreshold : '—'}</span>
              <span className={s.ruleNames}>{rules.length ? rules.map(r => ruleName(r, types)).join(', ') : c && c !== 'error' ? <em className={s.missingText}>No incident rules</em> : '—'}</span>
              <span className={s.open}>{c ? 'View' : 'Set up'} ›</span>
            </button>;
          })}
        </div>
      </section>;
    })}
  </>;
}

function ZoneConfig({ zone, floorName, types, editing, onOpen, onBack, onChanged }: {
  zone: ZoneRecord; floorName: string; types: IncidentType[]; editing: boolean;
  onOpen: (edit: boolean) => void; onBack: () => void; onChanged: (config: MonitoringConfiguration | null) => void;
}) {
  const zoneId = zone.zoneId;
  const [config, setConfig] = useState<MonitoringConfiguration | null>(null);
  const [name, setName] = useState('Zone monitoring');
  const [confidence, setConfidence] = useState('0.5');
  const [rules, setRules] = useState<RuleInput[]>([]);
  const [typeId, setTypeId] = useState('');
  const [review, setReview] = useState<MonitoringReview | null>(null);
  const [previewCameraId, setPreviewCameraId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [rulesMissing, setRulesMissing] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);
  const typeSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fillForm = (saved: MonitoringConfiguration | null) => {
    setName(saved?.name ?? 'Zone monitoring'); setConfidence(String(saved?.confidenceThreshold ?? .5));
    setRules(saved?.rules.map(inputRule) ?? []); setDirty(false); setRulesMissing(false);
  };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const saved = await loadConfig(zoneId, controller.signal);
        if (controller.signal.aborted) return;
        setConfig(saved); fillForm(saved);
      } catch (e) { if (!controller.signal.aborted) { setLoadFailed(true); setError(message(e)); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [zoneId, reloadKey]);

  const active = config?.status === 'ACTIVE';
  const showForm = editing && !active && !loadFailed;
  const locked = loading || busy || active;
  const available = types.filter(t => t.status === 'ACTIVE' && !rules.some(r => r.incidentTypeId === t.incidentTypeId));
  const selectedType = available.find(t => t.incidentTypeId === typeId) ?? available[0];
  const touch = () => { setDirty(true); setReview(null); setPreviewCameraId(null); setNotice(''); setError(''); };
  const changeRule = (id: string, patch: Partial<RuleInput>) => { setRules(all => all.map(r => r.incidentTypeId === id ? { ...r, ...patch } : r)); touch(); };
  const apply = (saved: MonitoringConfiguration) => { setConfig(saved); fillForm(saved); setPreviewCameraId(null); onChanged(saved); };
  const confirmDiscard = (text: string) => !dirty || window.confirm(text);

  async function operation(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { if (mounted.current) setError(message(e)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save() {
    if (!rules.length) {
      setRulesMissing(true); setError(RULE_REQUIRED); setNotice('');
      typeSelect.current?.focus();
      return;
    }
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
      if (mounted.current) { apply(saved); setReview(null); setNotice('Configuration saved as Draft. Review it before activating.'); onOpen(false); }
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
  function addRule() {
    if (!selectedType) return;
    setRules(all => [...all, inputRule({ incidentTypeId: selectedType.incidentTypeId, warningThreshold: selectedType.defaultWarningThreshold ?? 0, criticalThreshold: selectedType.defaultCriticalThreshold ?? 1, thresholdUnit: selectedType.thresholdUnit ?? '', sustainSec: 30, cooldownSec: 300, enabled: selectedType.supported, parametersJson: null })]);
    touch(); setRulesMissing(false);
  }

  return <>
    <button type="button" className={s.back} onClick={() => { if (confirmDiscard('Discard unsaved changes and go back to all zones?')) onBack(); }}>‹ All zones</button>
    <section className={s.panel}>
      <div className={s.head}>
        <div>
          <h2 className={s.title}>{showForm ? (config ? 'Edit configuration' : 'Create configuration') + ' · ' + zone.name : zone.name}</h2>
          <p className={s.sub}>{floorName} · {zone.code} · Area: {zone.areaM2 ?? 'not configured'} m² · Zone {zone.status}</p>
        </div>
        {!loading && !loadFailed && <Chip tone={statusTone(config?.status)}>{config?.status ?? 'NOT CONFIGURED'}</Chip>}
      </div>
      {loading && <p className={s.help} role="status">Loading configuration…</p>}
      {error && <p className={s.alertBox} role="alert">{error}</p>}
      {notice && <p className={s.saved} role="status">{notice}</p>}
      {loadFailed && <Button variant="secondary" onClick={() => { setLoading(true); setLoadFailed(false); setError(''); setReloadKey(k => k + 1); }}>Retry</Button>}

      {!loading && !loadFailed && !showForm && <>
        {editing && active && <p className={s.help}>An active configuration cannot be edited. Deactivate it first.</p>}
        {config ? <>
          <dl className={s.facts}>
            <div><dt>Configuration name</dt><dd>{config.name}</dd></div>
            <div><dt>Detection confidence</dt><dd>{config.confidenceThreshold}</dd></div>
            <div><dt>Status</dt><dd>{config.status}</dd></div>
            <div><dt>Last saved</dt><dd>{formatTime(config.updatedAt)}</dd></div>
          </dl>
          <h3 className={s.section}>Incident rules</h3>
          {config.rules.length ? <div className={s.ruleTable} role="table" aria-label="Incident rules">
            <div role="row" className={s.ruleHeadRow}><span role="columnheader">Incident type</span><span role="columnheader">Warning ≥</span><span role="columnheader">Critical ≥</span><span role="columnheader">Sustain</span><span role="columnheader">Cooldown</span><span role="columnheader">State</span></div>
            {config.rules.map(r => <div role="row" key={r.incidentTypeId}>
              <span role="cell"><strong>{ruleName(r, types)}</strong></span>
              <span role="cell">{r.warningThreshold} {r.thresholdUnit}</span>
              <span role="cell">{r.criticalThreshold} {r.thresholdUnit}</span>
              <span role="cell">{r.sustainSec}s</span>
              <span role="cell">{r.cooldownSec}s</span>
              <span role="cell"><Chip tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'Enabled' : 'Disabled'}</Chip></span>
            </div>)}
          </div> : <p className={s.missingBox}>This configuration has no incident rules. Edit it and add at least one rule.</p>}
          <div className={s.actions}>
            <Button disabled={busy || active} onClick={() => { fillForm(config); setError(''); setNotice(''); onOpen(true); }}>Edit configuration</Button>
            {!active && <Button variant="secondary" disabled={busy} onClick={() => { setReview(null); void operation(async () => { const result = await reviewMonitoring(zoneId); if (mounted.current) { apply(result.configuration); setReview(result); } }); }}>Review &amp; activate</Button>}
            {active && <Button variant="secondary" disabled={busy} onClick={() => void changeActive(false)}>Deactivate configuration</Button>}
          </div>
          {active && <p className={s.help}>This configuration is active. Deactivate it before changing confidence or rules.</p>}
        </> : <div className={s.empty}>
          <p>This zone has no AI configuration yet.</p>
          <Button onClick={() => { fillForm(null); setError(''); setNotice(''); onOpen(true); }}>Create configuration</Button>
        </div>}
      </>}

      {!loading && showForm && <>
        <fieldset disabled={locked} className={s.fields}>
          <label className={s.field}>Configuration name<input aria-label="Configuration name" maxLength={100} value={name} onChange={e => { setName(e.target.value); touch(); }} /></label>
          <label className={s.field}>Detection confidence<input aria-label="Detection confidence" type="number" min="0" max="1" step=".0001" value={confidence} onChange={e => { setConfidence(e.target.value); touch(); }} /></label>
        </fieldset>
        <p className={s.help}>Confidence filters detection scores, not incident severity.</p>

        <h3 className={s.section}>Incident rules <span className={s.required}>Required</span></h3>
        <div className={`${s.addRule} ${rulesMissing ? s.addRuleMissing : ''}`}>
          <label className={s.field}>Incident type<select ref={typeSelect} aria-label="Incident type" aria-invalid={rulesMissing || undefined} disabled={locked || !available.length} value={selectedType?.incidentTypeId ?? ''} onChange={e => setTypeId(e.target.value)}>
            {!available.length && <option value="">No more incident types</option>}
            {available.map(t => <option key={t.incidentTypeId} value={t.incidentTypeId}>{t.name}{!t.supported ? ' (disabled Draft only)' : ''}</option>)}
          </select></label>
          <Button disabled={locked || !selectedType} onClick={addRule}>Add rule</Button>
        </div>
        {!rules.length && <p className={rulesMissing ? s.error : s.help}>No incident rules yet. A configuration needs at least one rule before it can be saved.</p>}
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
          <Button disabled={locked} onClick={() => void save()}>Save configuration</Button>
          <Button variant="secondary" disabled={busy} onClick={() => {
            if (!confirmDiscard('Discard unsaved changes?')) return;
            fillForm(config); setError(''); onOpen(false);
          }}>Cancel</Button>
          {dirty && <span className={s.help}>Unsaved changes</span>}
        </div>
      </>}
    </section>

    {review && !showForm && <section className={s.panel}>
      <h2 className={s.title}>Review & activate</h2>
      <p>Zone: {review.zone.name} · Configuration: {review.configuration.name} · {review.configuration.status}</p>
      <p className={s.help}>Saved version: {review.configuration.updatedAt} · Confidence: {review.configuration.confidenceThreshold}</p>
      <ul>{review.configuration.rules.map(r => <li key={r.incidentTypeId}>{ruleName(r, types)}: {r.enabled ? 'Enabled' : 'Disabled'} · warning ≥ {r.warningThreshold}, critical ≥ {r.criticalThreshold} {r.thresholdUnit} · sustain {r.sustainSec}s · cooldown {r.cooldownSec}s</li>)}</ul>
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
  </>;
}

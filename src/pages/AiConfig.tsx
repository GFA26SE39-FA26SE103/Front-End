import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { AnnotatedPreview } from '../components/AnnotatedPreview';
import { CheckoutRuntimePanel } from '../components/CheckoutRuntimePanel';
import { Dialog } from '../components/Dialog';
import { Button, Chip, type Tone } from '../components/ui';
import { ApiError } from '../api/client';
import { listFloors, listSupermarkets, listZones, type ZoneRecord } from '../api/floors';
import { deleteMonitoring, getMonitoring, listMonitoringEventTypes, reviewMonitoring, saveMonitoring, setMonitoringActive, type MonitoringEventType, type MonitoringConfiguration, type MonitoringReview, type MonitoringRule } from '../api/monitoring';
import { listResponsePolicies, type PolicyPriority, type ResponsePolicy } from '../api/responsePolicies';
import { ResponsePolicyEditor } from './admin/ResponsePolicies';
import s from './AiConfig.module.css';
import { measurementMode, modeLabel } from './monitoringRuleMode';

type MeasurementOption = NonNullable<MonitoringEventType['measurementOptions']>[number];
type RuleInput = Omit<MonitoringRule, 'warningThreshold' | 'criticalThreshold' | 'sustainSec' | 'cooldownSec' | 'clearDurationSec' | 'warningExitThreshold' | 'criticalExitThreshold'> & {
  warningThreshold: string; criticalThreshold: string; sustainSec: string; cooldownSec: string;
  clearDurationSec: string;
  warningExitThreshold: string; criticalExitThreshold: string;
};
type FloorGroup = { floorId: string; floorNumber: number; name: string; zones: ZoneRecord[] };
// undefined = still loading, null = no configuration saved for the zone, 'error' = could not be loaded.
type ConfigSummary = MonitoringConfiguration | null | 'error' | undefined;
type PolicySummary = ResponsePolicy[] | 'error' | undefined;

const inputRule = (r: MonitoringRule): RuleInput => ({ ...r, warningThreshold: String(r.warningThreshold), criticalThreshold: String(r.criticalThreshold), sustainSec: String(r.sustainSec), cooldownSec: String(r.cooldownSec),
  clearDurationSec: r.clearDurationSec == null ? '' : String(r.clearDurationSec),
  warningExitThreshold: r.warningExitThreshold == null ? '' : String(r.warningExitThreshold),
  criticalExitThreshold: r.criticalExitThreshold == null ? '' : String(r.criticalExitThreshold) });
/** Shows "≥ enter" and, when a dead band is configured, "held until < exit". */
const band = (enter: number, exit: number | null | undefined, unit: string) => `≥ ${enter}${exit != null && exit !== enter ? ` · held until < ${exit}` : ''} ${unit}`;
const message = (e: unknown) => e instanceof ApiError && e.code === 'CONFIGURATION_CHANGED' ? 'Configuration changed. Refresh the page and try again.' : e instanceof Error ? e.message : 'The request could not be completed.';
const RULE_REQUIRED = 'Add at least one operational event rule before saving. Choose a rule from the list.';
function decimal(raw: string, label: string) {
  if (!/^\d+(\.\d{1,4})?$/.test(raw.trim()) || !Number.isFinite(Number(raw))) throw new Error(label + ' must be a non-negative number with at most 4 decimal places.');
  return Number(raw);
}
const thresholdFields = [
  { level: 'WARNING', entry: 'warningThreshold', exit: 'warningExitThreshold' },
  { level: 'CRITICAL', entry: 'criticalThreshold', exit: 'criticalExitThreshold' },
] as const;
type ThresholdField = typeof thresholdFields[number]['entry' | 'exit'];

function validateThresholds(rule: RuleInput) {
  const errors: Partial<Record<ThresholdField, string>> = {};
  const parse = (field: ThresholdField) => {
    const input = rule[field].trim();
    const value = Number(input);
    if (!input) errors[field] = 'Enter a threshold.';
    else if (!/^\d+(\.\d{1,4})?$/.test(input) || value >= 1e14) {
      errors[field] = 'Enter a non-negative number below 100 trillion with up to 4 decimal places.';
    } else if (rule.thresholdUnit === 'PEOPLE' && !Number.isInteger(value)) {
      errors[field] = 'Enter a whole number of people.';
    } else return value;
    return null;
  };
  const warning = parse('warningThreshold');
  const critical = parse('criticalThreshold');
  const warningExit = parse('warningExitThreshold');
  const criticalExit = parse('criticalExitThreshold');
  if (warning !== null && critical !== null) {
    if (warning >= critical) errors.criticalThreshold = 'Critical must be higher than warning.';
    else if (rule.thresholdUnit === 'PEOPLE' && critical - warning < 2) {
      errors.criticalThreshold = 'Set Critical entry at least 2 people above Warning entry to allow a whole-number exit between them.';
    }
  }
  if (rule.enabled && rule.thresholdUnit === 'PEOPLE' && warning !== null && warning < 2) {
    errors.warningThreshold = 'Set Warning entry to at least 2 people so its exit can be positive and lower.';
  }
  if (warningExit !== null && warning !== null && warningExit >= warning) {
    errors.warningExitThreshold = 'Warning exit must be below Warning entry.';
  }
  if (rule.enabled && warningExit === 0) {
    errors.warningExitThreshold = 'Use a value above 0 so the event can clear.';
  }
  if (criticalExit !== null && ((warning !== null && criticalExit <= warning) || (critical !== null && criticalExit >= critical))) {
    errors.criticalExitThreshold = 'Critical exit must be above Warning entry and below Critical entry.';
  }
  return { warning, critical, warningExit, criticalExit, errors };
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
const ruleName = (rule: Pick<MonitoringRule, 'eventName' | 'eventTypeId'>, types: MonitoringEventType[]) => rule.eventName ?? types.find(t => t.eventTypeId === rule.eventTypeId)?.name ?? 'Unknown operational event type';
const ruleMode = (rule: Pick<MonitoringRule, 'eventTypeId' | 'eventCode' | 'thresholdUnit' | 'parametersJson'>, types: MonitoringEventType[]) => measurementMode({ ...rule, eventCode: rule.eventCode ?? types.find(t => t.eventTypeId === rule.eventTypeId)?.code });
const formatTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); };

const units: Record<string, string> = { PEOPLE: 'people', MINUTES: 'minutes', PEOPLE_PER_M2: 'people/m²', PEOPLE_PER_STAFFED_COUNTER: 'people/staffed counter' };
const unitName = (unit: string) => units[unit] ?? unit;
// Long Queue, waiting time and capacity are checkout-only and read the counters' Lane/Staff/Service ROIs.
const isCheckoutMode = (mode: string | null | undefined) => mode === 'QUEUE_LENGTH' || mode === 'WAITING_TIME' || mode === 'CHECKOUT_CAPACITY';

function checkoutParameters(rule: Pick<MonitoringRule, 'parametersJson'>): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(rule.parametersJson ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // An existing malformed draft still needs editable fields.
  }
  return {};
}

function responseLabel(summary: PolicySummary, level: PolicyPriority) {
  if (summary === undefined) return 'Checking policy…';
  if (summary === 'error') return 'Policy unavailable';
  if (!summary.length) return 'SLA missing';
  const policy = summary.find(item => item.eventPriority === level);
  if (policy?.issues.includes('POLICY_DISABLED')) return 'SLA disabled';
  if (!policy?.action) return 'Action missing';
  if (!policy.isEnabled || !policy.action.isEnabled) return 'Action disabled';
  if (policy.issues.some(issue => issue !== 'CONFIGURATION_NOT_ACTIVE' && issue !== 'RULE_DISABLED')) return 'Needs attention';
  return level === 'WARNING'
    ? (policy.action.targetRoleCode === 'MANAGER' ? 'Notify Managers' : 'Notify Operators')
    : `Create ${policy.action.taskTypeCode ?? 'Task'}`;
}

function RuleResponses({ summary }: { summary: PolicySummary }) {
  return <div className={s.ruleResponses}>
    <span><strong>WARNING</strong> · {responseLabel(summary, 'WARNING')}</span>
    <span><strong>CRITICAL</strong> · {responseLabel(summary, 'CRITICAL')}</span>
  </div>;
}
export default function AiConfig() {
  const [params, setParams] = useSearchParams();
  const zoneId = params.get('zoneId') ?? '';
  const [editZoneId, setEditZoneId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState('');
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [types, setTypes] = useState<MonitoringEventType[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ConfigSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overviewKey, setOverviewKey] = useState(0);
  const onConfigChanged = useCallback((config: MonitoringConfiguration | null) => {
    setSummaries(all => ({ ...all, [zoneId]: config }));
  }, [zoneId]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const [stores, allTypes] = await Promise.all([listSupermarkets(controller.signal), listMonitoringEventTypes(controller.signal)]);
        const catalog = allTypes;
        const floorRecords = stores[0] ? (await listFloors(stores[0].supermarketId, controller.signal)).sort((a, b) => a.floorNumber - b.floorNumber) : [];
        const groups = await Promise.all(floorRecords.map(async f => ({ floorId: f.floorId, floorNumber: f.floorNumber, name: f.name || 'Floor ' + f.floorNumber, zones: await listZones(f.floorId, controller.signal) })));
        const entries = await Promise.all(groups.flatMap(g => g.zones).map(async z => {
          try { return [z.zoneId, await loadConfig(z.zoneId, controller.signal)] as const; }
          catch { return [z.zoneId, 'error'] as const; }
        }));
        if (controller.signal.aborted) return;
        setTypes(catalog); setFloors(groups); setSummaries(Object.fromEntries(entries));
        setFloorId(id => groups.some(g => g.floorId === id) ? id : '');
      } catch (e) { if (!controller.signal.aborted) setError(message(e)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [overviewKey]);
  const floor = floors.find(f => f.zones.some(z => z.zoneId === zoneId));
  const zone = floor?.zones.find(z => z.zoneId === zoneId);
  const open = (id: string, edit = false) => {
    setEditZoneId(edit ? id : null);
    if (id !== zoneId) setParams({ zoneId: id });
  };
  return <AdminLayout title="Monitoring rules" subtitle={zone && floor ? floor.name + ' · ' + zone.name : undefined}>
    <div className={s.column}>
      {loading && <p className={s.help} role="status">Loading floors, zones and configurations…</p>}
      {error && <section className={s.panel}><p className={s.alertBox} role="alert">{error}</p><Button variant="secondary" onClick={() => setOverviewKey(k => k + 1)}>Retry loading zones</Button></section>}
      {!loading && !error && (zone && floor ? <ZoneConfig
        key={zone.zoneId} zone={zone} floorName={floor.name} types={types} editing={editZoneId === zoneId}
        onOpen={edit => open(zone.zoneId, edit)} onBack={() => { setEditZoneId(null); setParams({}); }}
        onChanged={onConfigChanged}
      /> : <Overview floors={floors} summaries={summaries} types={types} missingZone={Boolean(zoneId)}
        floorId={floorId} onFloorChange={setFloorId} onRefresh={() => setOverviewKey(k => k + 1)} onOpen={id => open(id)} />)}
    </div>
  </AdminLayout>;
}

function Overview({ floors, summaries, types, missingZone, floorId, onFloorChange, onRefresh, onOpen }: {
  floors: FloorGroup[]; summaries: Record<string, ConfigSummary>; types: MonitoringEventType[]; missingZone: boolean;
  floorId: string; onFloorChange: (id: string) => void; onRefresh: () => void; onOpen: (zoneId: string) => void;
}) {
  const zoneCount = floors.reduce((n, f) => n + f.zones.length, 0);
  const configured = Object.values(summaries).filter(c => c && c !== 'error').length;
  const activeCount = Object.values(summaries).filter(c => c && c !== 'error' && c.status === 'ACTIVE').length;
  return <>
    <section className={s.panel}>
      <div className={s.head}><div><h2 className={s.title}>Zones by floor</h2></div><Button variant="secondary" onClick={onRefresh}>Refresh configurations</Button></div>
      {missingZone && <p className={s.alertBox} role="alert">The requested zone was not found. Choose a zone below.</p>}
      <div className={s.stats}><div><strong>{zoneCount}</strong><span>Zones</span></div><div><strong>{configured}</strong><span>Configured</span></div><div><strong>{activeCount}</strong><span>Active configurations</span></div></div>
      <label className={s.floorFilter}>Floor<select aria-label="Filter by floor" value={floorId} onChange={e => onFloorChange(e.target.value)}><option value="">All floors</option>{floors.map(f => <option key={f.floorId} value={f.floorId}>Floor {f.floorNumber} · {f.name}</option>)}</select></label>
      {!floors.length && <p className={s.help}>Create a floor and zone in <a href="/admin/store-layout">Store layout</a> first.</p>}
    </section>
    {floors.filter(f => !floorId || f.floorId === floorId).map(f => <section key={f.floorId} className={s.panel} aria-label={'Floor ' + f.floorNumber + ': ' + f.name}>
      <div className={s.head}><div><p className={s.eyebrow}>Floor {f.floorNumber}</p><h2 className={s.title}>{f.name}</h2></div><span className={s.help}>{f.zones.length} zone{f.zones.length === 1 ? '' : 's'}</span></div>
      {!f.zones.length && <p className={s.help}>No zones on this floor. Add a zone in <a href="/admin/store-layout">Store layout</a>.</p>}
      <div className={s.zoneGrid}>{f.zones.map(z => {
        const summary = summaries[z.zoneId];
        const saved = summary && summary !== 'error' ? summary : null;
        return <button key={z.zoneId} type="button" className={s.zoneCard} aria-label={'View rules for ' + z.name} onClick={() => onOpen(z.zoneId)}>
          <div className={s.head}><span className={s.zoneCode}><i style={{ background: z.colorHex ?? 'var(--color-primary)' }} />{z.code}</span><Chip tone={summary === 'error' ? 'danger' : statusTone(saved?.status)}>{summary === 'error' ? 'Load failed' : saved?.status ?? 'Not configured'}</Chip></div>
          <h3>{z.name}</h3><p className={s.configName}>{saved?.name ?? (summary === 'error' ? 'Configuration unavailable' : 'No monitoring configuration yet')}</p>
          {summary === 'error' ? <p className={s.error}>Could not load this configuration. Open its detail to retry.</p> : saved ? <><p className={s.help}>Confidence: {saved.confidenceThreshold} · {saved.rules.length} operational event {saved.rules.length === 1 ? 'rule' : 'rules'}</p><div className={s.ruleTags}>{saved.rules.map(r => <span key={r.eventTypeId}>{ruleName(r, types)}{!r.enabled ? ' · Disabled' : ''}</span>)}</div>{!saved.rules.length && <p className={s.help}>No operational event rules saved. Edit to add one.</p>}</> : null}
          <span className={s.cardLink}>View rules →</span>
        </button>;
      })}</div>
    </section>)}
  </>;
}

function ZoneConfig({ zone, floorName, types, editing, onOpen, onBack, onChanged }: {
  zone: ZoneRecord; floorName: string; types: MonitoringEventType[]; editing: boolean;
  onOpen: (edit: boolean) => void; onBack: () => void; onChanged: (config: MonitoringConfiguration | null) => void;
}) {
  const zoneId = zone.zoneId;
  const [config, setConfig] = useState<MonitoringConfiguration | null>(null);
  const [name, setName] = useState('Zone monitoring');
  const [confidence, setConfidence] = useState('0.5');
  const [rules, setRules] = useState<RuleInput[]>([]);
  const [policyRuleId, setPolicyRuleId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Record<string, PolicySummary>>({});
  const [policyRevision, setPolicyRevision] = useState(0);
  const [review, setReview] = useState<MonitoringReview | null>(null);
  const [reviewedAreaM2, setReviewedAreaM2] = useState<number | null>();
  const [previewCameraId, setPreviewCameraId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [rulesMissing, setRulesMissing] = useState(false);
  const [showRequiredThresholds, setShowRequiredThresholds] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [deleting, setDeleting] = useState<MonitoringConfiguration | null>(null);
  const [ruleToRemove, setRuleToRemove] = useState<RuleInput | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);
  const typeSelect = useRef<HTMLSelectElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const policyHeading = useRef<HTMLHeadingElement>(null);
  const policyTrigger = useRef<HTMLButtonElement | null>(null);
  const closeEditor = () => { onOpen(false); requestAnimationFrame(() => detailHeading.current?.focus()); };
  useEffect(() => { if (editing && !loading) nameInput.current?.focus(); }, [editing, loading]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fillForm = (saved: MonitoringConfiguration | null) => {
    setName(saved?.name ?? 'Zone monitoring'); setConfidence(String(saved?.confidenceThreshold ?? .5));
    setRules(saved?.rules.map(inputRule) ?? []); setDirty(false); setRulesMissing(false); setShowRequiredThresholds(false);
  };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const saved = await loadConfig(zoneId, controller.signal);
        if (controller.signal.aborted) return;
        setConfig(saved); setPolicies({}); fillForm(saved); onChanged(saved);
      } catch (e) { if (!controller.signal.aborted) { setLoadFailed(true); setError(message(e)); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [zoneId, reloadKey, onChanged]);

  useEffect(() => {
    const controller = new AbortController();
    for (const { ruleId } of config?.rules ?? []) {
      if (!ruleId) continue;
      void listResponsePolicies(ruleId, controller.signal).then(
        summary => { if (!controller.signal.aborted) setPolicies(all => ({ ...all, [ruleId]: summary })); },
        () => { if (!controller.signal.aborted) setPolicies(all => ({ ...all, [ruleId]: 'error' })); },
      );
    }
    return () => controller.abort();
  }, [config, policyRevision]);

  const active = config?.status === 'ACTIVE';
  const showForm = editing && !active && !loadFailed;
  const locked = loading || busy || active;
  const areaM2 = reviewedAreaM2 === undefined ? zone.areaM2 : reviewedAreaM2;
  const hasMeasuredArea = areaM2 != null && areaM2 >= 0.01 && areaM2 <= 9999999999.99;
  const needsZoneArea = (rule: MonitoringRule) => rule.enabled && !hasMeasuredArea && ruleMode(rule, types) === 'CROWD_DENSITY';
  const densityBlocked = config?.rules.some(needsZoneArea) ?? false;
  const needsThresholdUpdate = config?.rules.some(rule => rule.enabled && Object.keys(validateThresholds(inputRule(rule)).errors).length > 0) ?? false;
  const available = types.filter(t => !rules.some(r => r.eventTypeId === t.eventTypeId));
  const ruleChoices = available.flatMap<{ value: string; label: string; type: MonitoringEventType; measurement?: MeasurementOption; unavailableReason?: string }>(type => {
    if (isCheckoutMode(type.measurementType)) {
      if (zone.zoneType !== 'CHECKOUT') return [];
      const unavailableReason = type.status !== 'ACTIVE' || !type.supported
        ? type.unsupportedReason ?? 'Checkout measurement is unavailable in this environment.' : undefined;
      return [{ value: type.eventTypeId, label: type.name, type, unavailableReason }];
    }
    if (type.status !== 'ACTIVE') return [];
    if (type.code === 'CONGESTION') {
      const measurement = type.measurementOptions?.find(option => option.mode === 'CROWD_DENSITY' && option.supported);
      return measurement ? [{ value: `${type.eventTypeId}:CROWD_DENSITY`, label: `${type.name} · Crowd density (people/m²)`, type, measurement }] : [];
    }
    const supported = type.supported && type.measurementType === 'QUEUE_LENGTH';
    return supported ? [{ value: type.eventTypeId, label: type.name, type }] : [];
  });
  const policyRule = !showForm && !loading && !loadFailed && config?.rules.find(rule => rule.ruleId === policyRuleId);
  const refreshPolicies = () => { setPolicies({}); setPolicyRevision(value => value + 1); };
  function openPolicy(ruleId: string, trigger: HTMLButtonElement) {
    policyTrigger.current = trigger;
    setPolicyRuleId(ruleId);
    requestAnimationFrame(() => policyHeading.current?.focus());
  }
  function closePolicy() {
    setPolicyRuleId(null);
    requestAnimationFrame(() => policyTrigger.current?.focus());
  }
  const touch = () => { setDirty(true); setReview(null); setPreviewCameraId(null); setNotice(''); setError(''); };
  const changeRule = (id: string, patch: Partial<RuleInput>) => { setRules(all => all.map(r => r.eventTypeId === id ? { ...r, ...patch } : r)); touch(); };
  const confirmRemoveRule = () => {
    if (!ruleToRemove) return;
    setRules(all => all.filter(rule => rule.eventTypeId !== ruleToRemove.eventTypeId));
    setRuleToRemove(null);
    touch();
    requestAnimationFrame(() => typeSelect.current?.focus());
  };
  const apply = (saved: MonitoringConfiguration) => { setConfig(saved); setPolicies({}); fillForm(saved); setPreviewCameraId(null); onChanged(saved); };
  const confirmDiscard = (text: string) => !dirty || window.confirm(text);
  const reloadSaved = () => {
    if (!confirmDiscard('Discard unsaved changes and reload the saved configuration?')) return;
    setLoading(true); setLoadFailed(false); setError(''); setNotice(''); setReview(null); setPreviewCameraId(null);
    onOpen(false); setReloadKey(k => k + 1);
  };

  async function operation(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { if (mounted.current) setError(message(e)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save(form: HTMLFormElement) {
    if (!rules.length) {
      setRulesMissing(true); setError(RULE_REQUIRED); setNotice('');
      typeSelect.current?.focus();
      return;
    }
    if (rules.some(rule => Object.keys(validateThresholds(rule).errors).length)) {
      setShowRequiredThresholds(true);
      requestAnimationFrame(() => form.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus());
      return;
    }
    await operation(async () => {
      const conf = decimal(confidence, 'Detection confidence');
      if (conf > 1) throw new Error('Detection confidence must be between 0 and 1.');
      if (!name.trim()) throw new Error('Configuration name is required.');
      const parsed = rules.map(r => {
        const label = types.find(t => t.eventTypeId === r.eventTypeId)?.name ?? 'Rule';
        const { warning, critical, warningExit, criticalExit, errors } = validateThresholds(r);
        if (warning === null || critical === null || warningExit === null || criticalExit === null || Object.keys(errors).length) {
          throw new Error(label + ': check the threshold fields.');
        }
        if (!r.thresholdUnit.trim()) throw new Error(label + ': threshold unit is required.');
        const clearDurationSec = r.clearDurationSec === '' ? undefined : seconds(r.clearDurationSec, label + ' clear duration');
        if (clearDurationSec !== undefined && (clearDurationSec < 1 || clearDurationSec > 86400)) {
          throw new Error(label + ': clear duration must be between 1 and 86400 seconds.');
        }
        if (r.enabled && ruleMode(r, types) === 'CHECKOUT_CAPACITY') {
          const { minQueue, noStaffedAlertLevel } = checkoutParameters(r);
          if (typeof minQueue !== 'number' || !Number.isInteger(minQueue) || minQueue < 1 || minQueue > 2147483647) {
            throw new Error('Enter a minimum checkout queue of at least one person.');
          }
          if (noStaffedAlertLevel !== 'WARNING' && noStaffedAlertLevel !== 'CRITICAL') {
            throw new Error('Choose an alert level for a queue with no staffed counter.');
          }
        }
        return { eventTypeId: r.eventTypeId, warningThreshold: warning, criticalThreshold: critical, thresholdUnit: r.thresholdUnit, sustainSec: seconds(r.sustainSec, label + ' sustain time'), cooldownSec: seconds(r.cooldownSec, label + ' cooldown'), enabled: r.enabled, parametersJson: r.parametersJson,
          warningExitThreshold: warningExit, criticalExitThreshold: criticalExit,
          ...(clearDurationSec !== undefined ? { clearDurationSec } : {}) };
      });
      const saved = await saveMonitoring(zoneId, { name: name.trim(), confidenceThreshold: conf, rules: parsed, ...(config ? { expectedUpdatedAt: config.updatedAt } : {}) });
      if (mounted.current) { apply(saved); setReview(null); setNotice('Configuration saved as Draft. Review it before activating.'); closeEditor(); }
    });
  }
  async function changeActive(value: boolean) {
    const version = value ? review?.configuration.updatedAt : config?.updatedAt;
    if (!version || (value && (!review?.canActivate || dirty || densityBlocked || needsThresholdUpdate))) return;
    await operation(async () => {
      const saved = await setMonitoringActive(zoneId, value, version);
      if (mounted.current) { apply(saved); setReview(null); setNotice(value ? 'Configuration activated. Monitoring worker requested; check live monitoring status to confirm it is running.' : 'Monitoring deactivated. Edit and save a new Draft before reactivation.'); }
    });
  }
  async function reviewConfiguration() {
    setReview(null);
    await operation(async () => {
      const result = await reviewMonitoring(zoneId);
      if (!mounted.current) return;
      apply(result.configuration);
      setReviewedAreaM2(result.zone.areaM2 ?? null);
      setReview(result);
      requestAnimationFrame(() => document.getElementById('configuration-review')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
    });
  }
  async function removeConfiguration() {
    if (!deleting || active || busy) return;
    const selected = deleting;
    await operation(async () => {
      await deleteMonitoring(zoneId, selected);
      if (mounted.current) {
        setConfig(null); fillForm(null); setReview(null); setPreviewCameraId(null);
        setDeleting(null); onChanged(null); closeEditor();
        setNotice('Configuration deleted. This zone is now not configured.');
      }
    });
  }
  function addRule(value: string) {
    const choice = ruleChoices.find(option => option.value === value);
    if (!choice || choice.unavailableReason) return;
    const { type: selectedType, measurement } = choice;
    const rule = inputRule({
      eventTypeId: selectedType.eventTypeId, eventCode: selectedType.code,
      warningThreshold: measurement?.defaultWarning ?? selectedType.defaultWarningThreshold ?? 0,
      criticalThreshold: measurement?.defaultCritical ?? selectedType.defaultCriticalThreshold ?? 1,
      thresholdUnit: measurement?.unit ?? selectedType.thresholdUnit ?? '',
      sustainSec: 30, cooldownSec: 300, enabled: true,
      clearDurationSec: measurement?.mode === 'CROWD_DENSITY' || isCheckoutMode(selectedType.measurementType) ? 60 : undefined,
      parametersJson: null,
    });
    if (selectedType.measurementType === 'CHECKOUT_CAPACITY') {
      rule.warningThreshold = '';
      rule.criticalThreshold = '';
    }
    setRules(all => [rule, ...all]);
    touch(); setRulesMissing(false);
  }
  const previewRegions = review?.cameras.filter(camera => camera.cameraId === previewCameraId && camera.roiPolygon.length >= 3)
    .map((camera, index) => ({ id: `${zoneId}:${index}`, label: `${zone.name} ROI ${index + 1}`,
      color: zone.colorHex ?? '#0d9494', points: camera.roiPolygon })) ?? [];

  return <div className={policyRule ? s.zoneWithPolicy : undefined}>
    <div className={s.column}>
    <button type="button" className={s.back} disabled={busy} onClick={() => { if (confirmDiscard('Discard unsaved changes and go back to all zones?')) onBack(); }}>‹ All zones</button>
    <section className={s.panel}>
      <div className={s.head}>
        <div>
          <h2 ref={detailHeading} tabIndex={-1} className={s.title}>{showForm ? (config ? 'Edit configuration' : 'Create configuration') + ' · ' + zone.name : zone.name}</h2>
          <p className={s.sub}>{floorName} · {zone.code} · Zone {zone.status}</p>
        </div>
        {!loading && !loadFailed && <Chip tone={statusTone(config?.status)}>{config?.status ?? 'NOT CONFIGURED'}</Chip>}
      </div>
      {loading && <p className={s.help} role="status">Loading configuration…</p>}
      {error && !deleting && <p className={s.alertBox} role="alert">{error}</p>}
      {notice && <p className={s.saved} role="status">{notice}</p>}
      {loadFailed && <Button variant="secondary" onClick={reloadSaved}>Retry</Button>}

      {!loading && !loadFailed && !showForm && <>
        {editing && active && <p className={s.help}>An active configuration cannot be edited. Deactivate it first.</p>}
        {config ? <>
          <dl className={s.facts}>
            <div><dt>Configuration name</dt><dd>{config.name}</dd></div>
            <div><dt>Detection confidence</dt><dd>{config.confidenceThreshold}</dd></div>
            <div><dt>Status</dt><dd>{config.status}</dd></div>
            <div><dt>Last saved</dt><dd>{formatTime(config.updatedAt)}</dd></div>
          </dl>
          <div className={s.activation}>
            <div><h3>{active ? 'Configuration activated' : 'Configuration activation'}</h3><p>{active ? 'Deactivate before editing or deleting this configuration.' : 'Review and activate the saved configuration.'}</p></div>
            {!active && <Button disabled={busy} onClick={() => void reviewConfiguration()}>{densityBlocked ? 'Review configuration' : 'Review & activate'}</Button>}
            {active && <Button variant="secondary" disabled={busy} onClick={() => void changeActive(false)}>Deactivate configuration</Button>}
          </div>
          {densityBlocked && <p className={s.missingBox}>Crowd density needs a measured zone area before activation. <Link to={`/admin/store-layout?floorId=${encodeURIComponent(zone.floorId)}`}>Set zone area in Store layout</Link>.</p>}
          {!active && needsThresholdUpdate && <p className={s.missingBox}>Edit and save valid Warning and Critical thresholds before activation.</p>}
          <h3 className={s.section}>Operational event rules</h3>
          {config.rules.length ? <div className={s.ruleTable} role="table" aria-label="Operational event rules">
            <div role="row" className={s.ruleHeadRow}><span role="columnheader">Operational event type</span><span role="columnheader">Warning</span><span role="columnheader">Critical</span><span role="columnheader">Sustain</span><span role="columnheader">Cooldown</span><span role="columnheader">Rule setting</span><span role="columnheader">Response</span></div>
            {config.rules.map(r => <div role="row" key={r.eventTypeId} className={r.ruleId && policyRuleId === r.ruleId ? s.selectedRule : undefined}>
              <span role="cell"><strong>{ruleName(r, types)}</strong><small>{modeLabel(ruleMode(r, types))}</small></span>
              <span role="cell">{band(r.warningThreshold, r.warningExitThreshold, unitName(r.thresholdUnit))}</span>
              <span role="cell">{band(r.criticalThreshold, r.criticalExitThreshold, unitName(r.thresholdUnit))}</span>
              <span role="cell">{r.sustainSec}s</span>
              <span role="cell">{r.cooldownSec}s</span>
              <span role="cell"><Chip tone={needsZoneArea(r) ? 'warning' : r.enabled && active ? 'success' : 'neutral'}>{needsZoneArea(r) ? 'Needs zone area' : r.enabled ? active ? 'Enabled' : 'Enabled when active' : 'Disabled'}</Chip></span>
              <div role="cell">{r.ruleId && <>
                <RuleResponses summary={policies[r.ruleId]} />
                <button type="button" className={s.responsePolicyLink} disabled={busy} aria-expanded={policyRuleId === r.ruleId}
                  aria-controls={policyRuleId === r.ruleId ? 'zone-response-policy' : undefined}
                  aria-label={`Manage response policy for ${ruleName(r, types)}`} onClick={event => openPolicy(r.ruleId!, event.currentTarget)}>Manage policy</button>
              </>}</div>
            </div>)}
          </div> : <p className={s.missingBox}>This configuration has no operational event rules. Edit it and add at least one rule.</p>}
          <div className={s.actions}>
            <Button disabled={busy || active} onClick={() => { fillForm(config); setReview(null); setPreviewCameraId(null); setPolicyRuleId(null); setError(''); setNotice(''); onOpen(true); }}>Edit configuration</Button>
            <Button variant="secondary" className={s.deleteButton} disabled={busy || active} onClick={() => { setError(''); setNotice(''); setDeleting(config); }}>Delete configuration</Button>
          </div>
          {active && <p className={s.help}>This configuration is active. Deactivate it before changing confidence or rules.</p>}
        </> : <div className={s.empty}>
          <p>This zone has no monitoring configuration yet.</p>
          <Button onClick={() => { fillForm(null); setError(''); setNotice(''); onOpen(true); }}>Create configuration</Button>
        </div>}
      </>}

      {!loading && showForm && <form noValidate onSubmit={e => { e.preventDefault(); void save(e.currentTarget); }}>
        <fieldset disabled={locked} className={s.fields}>
          <label className={s.field}>Configuration name<input ref={nameInput} aria-label="Configuration name" maxLength={100} value={name} onChange={e => { setName(e.target.value); touch(); }} /></label>
          <label className={s.field}>Minimum detection confidence<input aria-label="Detection confidence" type="number" min="0" max="1" step=".0001" value={confidence} onChange={e => { setConfidence(e.target.value); touch(); }} /></label>
        </fieldset>

        <h3 className={s.section}>Operational event rules <span className={s.required}>Required</span></h3>
        <div className={`${s.addRule} ${rulesMissing ? s.addRuleMissing : ''}`}>
          <label className={s.field}>Add a rule<select ref={typeSelect} aria-label="Add a rule" aria-invalid={rulesMissing || undefined} disabled={locked || !ruleChoices.length} value="" onChange={e => addRule(e.target.value)}>
            <option value="" disabled>{ruleChoices.length ? 'Choose a rule to add…' : 'No more rules available'}</option>
            {ruleChoices.map(option => <option key={option.value} value={option.value} disabled={!!option.unavailableReason}>
              {option.label}{option.unavailableReason ? ' · Unavailable' : ''}
            </option>)}
          </select></label>
          {ruleChoices.filter(choice => choice.unavailableReason).map(choice => (
            <p key={choice.value} className={s.help}>{choice.label}: {choice.unavailableReason}</p>
          ))}
        </div>
        {!rules.length && <p className={rulesMissing ? s.error : s.help}>No operational event rules yet. A configuration needs at least one rule before it can be saved.</p>}
        {rules.map(r => {
          const t = types.find(t => t.eventTypeId === r.eventTypeId);
          const label = t?.name ?? r.eventName ?? 'Unknown operational event type';
          const mode = ruleMode(r, types);
          const { errors } = validateThresholds(r);
          const checkoutMode = isCheckoutMode(mode);
          const supported = checkoutMode
            ? zone.zoneType === 'CHECKOUT' && !!t?.supported
            : !!t?.measurementOptions?.some(option => option.mode === mode && option.supported);
          const parameters = mode === 'CHECKOUT_CAPACITY' ? checkoutParameters(r) : {};
          return <section key={r.eventTypeId} className={s.rule}>
            <div className={s.head}><h3>{label}</h3><Button variant="secondary" className={s.deleteButton} disabled={locked} onClick={() => setRuleToRemove(r)}>Remove {label}</Button></div>
            <p className={s.help}>{modeLabel(supported ? mode : 'UNSUPPORTED')}</p>
            {mode === 'PEOPLE_COUNT' && <p className={s.help}>This saved rule uses people count. To switch to density, remove it and add a Crowd density rule.</p>}
            {mode === 'CROWD_DENSITY' && supported && <p className={hasMeasuredArea || !r.enabled ? s.help : s.missingBox}>
              {hasMeasuredArea ? `Measured zone area: ${areaM2} m².` : 'You can save this rule as a Draft. Enter the measured zone area in Store layout before activation.'}
              {' '}Use one active ROI covering that floor area.
            </p>}
            {!supported && <p className={s.help}>This measurement mode is unavailable.</p>}
            {!supported && checkoutMode && zone.zoneType !== 'CHECKOUT' && <p className={s.help}>{label} only applies to checkout zones. Use Overcrowding / Congestion for other areas.</p>}
            {!supported && t?.unsupportedReason && <p className={s.help}>{t.unsupportedReason}</p>}
            {checkoutMode && supported && <p className={s.help}>
              {mode === 'WAITING_TIME'
                ? 'Review requires an enabled checkout queue source with a Service ROI.'
                : mode === 'QUEUE_LENGTH'
                  ? 'Counts people in the enabled counters\' Lane ROIs. No zone ROI is needed.'
                  : 'Review requires enabled checkout counters with Lane and Staff ROIs and a selected queue source.'}
            </p>}
            <div className={s.thresholdPairs}>
              {thresholdFields.map(({ level, entry, exit }) => {
                const entryValue = r[entry].trim();
                const exitValue = r[exit].trim();
                const validPair = !errors[entry] && !errors[exit];
                return <fieldset key={level} disabled={locked} className={s.thresholdPair}>
                  <legend>{level}</legend>
                  <div className={s.thresholdInputs}>
                    {([entry, exit] as const).map(key => {
                      const isExit = key === exit;
                      const error = showRequiredThresholds || r[key].trim() ? errors[key] : undefined;
                      const errorId = `${r.eventTypeId}-${key}-error`;
                      return <label key={key} className={s.field}>
                        {isExit ? 'Leave level when x <' : 'Reach level when x ≥'}
                        <input aria-label={`${label} ${level.toLowerCase()}${isExit ? ' exit' : ''}`}
                          aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined}
                          type="number" min="0" step={r.thresholdUnit === 'PEOPLE' ? '1' : '.0001'} required
                          value={r[key]} onChange={e => changeRule(r.eventTypeId, { [key]: e.target.value })} />
                        {error && <span id={errorId} className={s.fieldError}>{error}</span>}
                      </label>;
                    })}
                  </div>
                  <p className={s.thresholdHint}>{validPair
                    ? <><strong>Dual threshold</strong> · <code>{exitValue} ≤ x &lt; {entryValue}</code> keeps this rule level if already entered.</>
                    : 'Set the exit below the entry threshold.'}</p>
                </fieldset>;
              })}
            </div>
            <fieldset disabled={locked} className={s.fields}>
              <label className={s.field}>Sustain time (seconds)<input aria-label={label + ' sustain time'} type="number" min="0" step="1" value={r.sustainSec} onChange={e => changeRule(r.eventTypeId, { sustainSec: e.target.value })} /></label>
              <label className={s.field}>Cooldown (seconds)<input aria-label={label + ' cooldown'} type="number" min="0" step="1" value={r.cooldownSec} onChange={e => changeRule(r.eventTypeId, { cooldownSec: e.target.value })} /></label>
              {(mode === 'CROWD_DENSITY' || checkoutMode) && supported && <label className={s.field}>Clear duration (seconds)
                <input aria-label={label + ' clear duration'} type="number" min="1" max="86400" step="1" value={r.clearDurationSec}
                  onChange={e => changeRule(r.eventTypeId, { clearDurationSec: e.target.value })} />
              </label>}
              <label className={s.check}><input type="checkbox" aria-label={label + ' enabled'} checked={r.enabled} disabled={!r.enabled && (!supported || t?.status !== 'ACTIVE')} onChange={e => changeRule(r.eventTypeId, { enabled: e.target.checked })} />Enabled</label>
            </fieldset>
            {mode === 'CHECKOUT_CAPACITY' && <fieldset disabled={locked} className={s.fields}>
              <label className={s.field}>Minimum queue (people)
                <input type="number" min="1" max="2147483647" step="1"
                  value={typeof parameters.minQueue === 'number' ? parameters.minQueue : ''}
                  onChange={e => changeRule(r.eventTypeId, { parametersJson: JSON.stringify({ ...parameters, minQueue: e.target.value === '' ? null : Number(e.target.value) }) })} />
              </label>
              <label className={s.field}>Alert when no counter is staffed
                <select value={typeof parameters.noStaffedAlertLevel === 'string' ? parameters.noStaffedAlertLevel : ''}
                  onChange={e => changeRule(r.eventTypeId, { parametersJson: JSON.stringify({ ...parameters, noStaffedAlertLevel: e.target.value }) })}>
                  <option value="">Choose an alert level</option><option value="WARNING">Warning</option><option value="CRITICAL">Critical</option>
                </select>
              </label>
            </fieldset>}
          </section>;
        })}
        <div className={s.actions}>
          <Button type="submit" disabled={locked}>{busy ? 'Saving…' : 'Save configuration'}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => {
            fillForm(config); setError(''); setNotice(''); closeEditor();
          }}>Cancel</Button>
          {dirty && <span className={s.help}>Unsaved changes</span>}
        </div>
      </form>}
    </section>

    {!loading && !showForm && zone.zoneType === 'CHECKOUT' && <CheckoutRuntimePanel zone={zone} />}

    {review && !showForm && <section className={`${s.panel} ${s.review}`} id="configuration-review" aria-labelledby="configuration-review-title">
      <h2 className={s.title} id="configuration-review-title">Review & activate</h2>
      <p>Zone: {review.zone.name} · Configuration: {review.configuration.name} · {review.configuration.status}</p>
      <ul>{review.configuration.rules.map(r => <li key={r.eventTypeId}>{ruleName(r, types)}: {r.enabled ? 'Enabled' : 'Disabled'} · {modeLabel(ruleMode(r, types))} · warning {band(r.warningThreshold, r.warningExitThreshold, '')}, critical {band(r.criticalThreshold, r.criticalExitThreshold, unitName(r.thresholdUnit))} · sustain {r.sustainSec}s · cooldown {r.cooldownSec}s
        {r.enabled && r.ruleId && <RuleResponses summary={policies[r.ruleId]} />}
      </li>)}</ul>
      <h3>Mapped cameras & camera ROI</h3>
      <p className={s.help}><a href="/admin/store-layout">Review or edit camera ROI in Store layout</a> (deactivate an active configuration before editing).</p>
      {!review.cameras.length && <p>No active camera mapping.</p>}
      {review.cameras.map((c, index) => <div key={`${c.cameraId}:${index}`} className={s.rule}>
        <strong>{c.code}</strong><p>{c.name} · {c.sourceType ?? 'No source'} / {c.protocol ?? '—'} · {c.ready ? 'Ready' : 'Not ready'}</p>
        <p className={s.help}>ROI: {c.roiPolygon.length} points · Connection: {c.isEnabled ? 'Enabled' : 'Disabled'} · Last test: {c.lastTestResult ?? 'Not tested'}{c.lastTestedAt ? ' / ' + c.lastTestedAt : ''}</p>
        {c.roiPolygon.length >= 3 && <svg className={s.roi} viewBox="0 0 100 100" role="img" aria-label={'Saved camera-frame ROI for ' + c.code}><polygon points={c.roiPolygon.map(p => p.x * 100 + ',' + p.y * 100).join(' ')} /></svg>}
        <ul>{c.issues.map(i => <li key={i.code} className={s.error}>{i.message}</li>)}</ul>
        <Button variant="secondary" disabled={!c.ready || busy} onClick={() => setPreviewCameraId(id => id === c.cameraId ? null : c.cameraId)}>{previewCameraId === c.cameraId ? 'Stop zone preview: ' : 'Preview zone confidence: '}{c.code}</Button>
      </div>)}
      {previewCameraId && <div className={s.zonePreview}><AnnotatedPreview cameraId={previewCameraId} zoneId={zoneId} regions={previewRegions} enabled /></div>}
      <ul>{review.issues.map((i, n) => <li key={n} className={s.error}><strong>{i.code}: </strong><span>{i.message}</span></li>)}</ul>
      {review.warnings.map(w => <p key={w} className={s.help}>{w}</p>)}
      <Button disabled={busy || dirty || active || !review.canActivate || densityBlocked || needsThresholdUpdate} onClick={() => void changeActive(true)}>Activate configuration</Button>
    </section>}
    {showForm && ruleToRemove && <Dialog title="Remove monitoring rule?" busy={false} onClose={() => setRuleToRemove(null)}>
      <p className={s.alertBox}><span><strong>{ruleName(ruleToRemove, types)}</strong> will be removed from this draft. Saving the configuration applies the removal to this zone.</span></p>
      {rules.length === 1 && <p className={s.help}>Add another rule before saving.</p>}
      <div className={s.actions}>
        <Button variant="secondary" data-autofocus onClick={() => setRuleToRemove(null)}>Cancel</Button>
        <Button className={s.confirmDelete} onClick={confirmRemoveRule}>Remove rule</Button>
      </div>
    </Dialog>}
    {deleting && <Dialog title="Delete monitoring configuration?" busy={busy} onClose={() => { setDeleting(null); setError(''); }}>
      <p className={s.help}>Delete <strong>{deleting.name}</strong> for <strong>{zone.name}</strong> on {floorName}?</p>
      <p className={s.alertBox}>This permanently removes the configuration and its operational event rules. The zone, cameras and ROI mappings are kept.</p>
      {error && <p className={s.alertBox} role="alert">{error}</p>}
      <div className={s.actions}><Button variant="secondary" data-autofocus disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>Cancel</Button><Button className={s.confirmDelete} disabled={busy} onClick={() => void removeConfiguration()}>{busy ? 'Deleting…' : 'Delete configuration'}</Button></div>
    </Dialog>}
    </div>
    {policyRule && policyRule.ruleId && <aside id="zone-response-policy" className={`${s.panel} ${s.policyPanel}`} aria-labelledby="zone-response-heading"
      onKeyDown={event => { if (event.key === 'Escape') closePolicy(); }}>
      <div className={s.head}>
        <div><h2 ref={policyHeading} tabIndex={-1} id="zone-response-heading" className={s.title}>Response policy</h2>
          <p className={s.sub}>{ruleName(policyRule, types)} · {zone.name}</p></div>
        <Button variant="secondary" onClick={closePolicy}>Close</Button>
      </div>
      <ResponsePolicyEditor key={policyRule.ruleId} ruleId={policyRule.ruleId}
        eventCode={policyRule.eventCode ?? types.find(type => type.eventTypeId === policyRule.eventTypeId)?.code}
        compact onSaved={refreshPolicies} />
    </aside>}
  </div>;
}


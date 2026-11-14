import { useEffect, useMemo, useState } from 'react';
import { createIncidentType, listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import { listSlaPolicies, saveSlaPolicy, type IncidentSlaPolicy } from '../api/slaPolicies';
import { AdminLayout } from '../components/AdminLayout';
import { Button, Card, CardHeader, Chip, SearchBox } from '../components/ui';
import s from './IncidentTypes.module.css';

type TypeDraft = { code: string; name: string; description: string; requiresBeforePhoto: boolean };
type SlaDraft = { isEnabled: boolean; priorityCode: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; responseTargetSec: string; resolutionTargetSec: string; offerTimeoutSec: string; warningPercent: string };
const emptyType: TypeDraft = { code: '', name: '', description: '', requiresBeforePhoto: false };
const emptySla: SlaDraft = { isEnabled: true, priorityCode: 'HIGH', responseTargetSec: '120', resolutionTargetSec: '1200', offerTimeoutSec: '60', warningPercent: '80' };
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';

export default function IncidentTypes() {
  const [types, setTypes] = useState<IncidentType[]>();
  const [policies, setPolicies] = useState<IncidentSlaPolicy[]>([]);
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string>();
  const [typeDraft, setTypeDraft] = useState(emptyType); const [slaDraft, setSlaDraft] = useState(emptySla);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [updatingType, setUpdatingType] = useState<string>();
  async function load(signal?: AbortSignal) { const [catalog, sla] = await Promise.all([listIncidentTypes(signal), listSlaPolicies(signal)]); setTypes(catalog); setPolicies(sla); }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(problem(cause)); }); return () => controller.abort(); }, []);
  const visible = useMemo(() => (types ?? []).filter(type => `${type.code} ${type.name}`.toLowerCase().includes(query.trim().toLowerCase())), [types, query]);
  const chosen = types?.find(type => type.incidentTypeId === selected); const chosenPolicy = policies.find(policy => policy.incidentTypeId === selected);
  function select(type: IncidentType) { setSelected(type.incidentTypeId); const policy = policies.find(row => row.incidentTypeId === type.incidentTypeId); setSlaDraft(policy ? { isEnabled: policy.isEnabled, priorityCode: policy.priorityCode, responseTargetSec: String(policy.responseTargetSec), resolutionTargetSec: String(policy.resolutionTargetSec), offerTimeoutSec: String(policy.offerTimeoutSec), warningPercent: String(policy.warningPercent) } : emptySla); setError(''); }
  async function create() { if (!typeDraft.code.trim() || !typeDraft.name.trim()) return setError('Code and name are required.'); setBusy(true); setError(''); try { await createIncidentType({ code: typeDraft.code.trim(), name: typeDraft.name.trim(), description: typeDraft.description.trim() || null, requiresBeforePhoto: typeDraft.requiresBeforePhoto, status: 'ACTIVE' }); setTypeDraft(emptyType); await load(); } catch (cause) { setError(problem(cause)); } finally { setBusy(false); } }
  async function toggle(type: IncidentType, enabled: boolean) {
    setBusy(true); setError(''); setUpdatingType(type.incidentTypeId);
    try {
      const saved = await updateIncidentType(type.incidentTypeId, {
        name: type.name, description: type.description, requiresBeforePhoto: type.requiresBeforePhoto ?? false,
        status: enabled ? 'ACTIVE' : 'INACTIVE',
      });
      setTypes(current => current?.map(row => row.incidentTypeId === type.incidentTypeId ? { ...row, status: saved.status } : row));
    } catch (cause) { setError(problem(cause)); }
    finally { setUpdatingType(undefined); setBusy(false); }
  }
  async function savePolicy() { if (!chosen) return; const responseTargetSec = Number(slaDraft.responseTargetSec), resolutionTargetSec = Number(slaDraft.resolutionTargetSec), offerTimeoutSec = Number(slaDraft.offerTimeoutSec), warningPercent = Number(slaDraft.warningPercent); if (![responseTargetSec, resolutionTargetSec, offerTimeoutSec, warningPercent].every(Number.isInteger)) return setError('SLA values must be whole seconds/percent.'); setBusy(true); setError(''); try { await saveSlaPolicy(chosen.incidentTypeId, { expectedVersion: chosenPolicy?.version ?? null, ...slaDraft, responseTargetSec, resolutionTargetSec, offerTimeoutSec, warningPercent }); await load(); } catch (cause) { setError(problem(cause)); } finally { setBusy(false); } }

  return <AdminLayout title="Incident types & SLA" subtitle="Backend catalogue and immutable Incident SLA snapshots">
    <Card className={s.list}><CardHeader title="Incident catalogue" subtitle="AI mappings are frozen; new catalogue entries are staff-reported"><SearchBox value={query} onChange={setQuery} placeholder="Search code or name" width={190} /></CardHeader>
      {error && <p className={s.error} role="alert">{error}</p>}{!types && !error && <p className={s.muted}>Loading catalogue…</p>}
      <div className={`${s.row} ${s.head}`}><span>TYPE</span><span>SOURCE</span><span>MEASUREMENT</span><span>SLA</span><span>ON</span></div>
      {visible.map(type => <div key={type.incidentTypeId} className={`${s.row} ${type.status !== 'ACTIVE' ? s.disabled : ''}`}>
        <button type="button" className={s.name} onClick={() => select(type)}>{type.name}<small className={s.muted}>{type.code}</small></button><span><Chip tone={type.sourceType === 'AI_DETECTED' ? 'primary' : 'warning'}>{type.sourceType}</Chip></span>
        <span className={s.muted}>{type.measurementType ?? 'Staff report'}</span><span>{policies.find(row => row.incidentTypeId === type.incidentTypeId)?.priorityCode ?? 'Not configured'}</span>
        {updatingType === type.incidentTypeId && <span className={s.saving} role="status">Saving…</span>}
        <input type="checkbox" aria-label={`${type.name} enabled`} checked={type.status === 'ACTIVE'} disabled={busy}
          onChange={event => void toggle(type, event.target.checked)} />
      </div>)}
    </Card>
    <Card className={s.drawer}>{chosen ? <><CardHeader title={chosen.name} subtitle={`${chosen.code} · ${chosen.sourceType}`} /><p className={s.help}>{chosen.description || 'No description.'}</p><p className={s.help}>Before photo: {chosen.requiresBeforePhoto ? 'Required' : 'Not required'}</p>
      <label>Priority<select value={slaDraft.priorityCode} onChange={event => setSlaDraft(d => ({ ...d, priorityCode: event.target.value as SlaDraft['priorityCode'] }))}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label><input type="checkbox" checked={slaDraft.isEnabled} onChange={event => setSlaDraft(d => ({ ...d, isEnabled: event.target.checked }))} /> Policy enabled</label>
      {([['responseTargetSec', 'Response target (seconds)'], ['resolutionTargetSec', 'Resolution target (seconds)'], ['offerTimeoutSec', 'Offer timeout (seconds)'], ['warningPercent', 'Warning percent']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="1" value={slaDraft[key]} onChange={event => setSlaDraft(d => ({ ...d, [key]: event.target.value }))} /></label>)}
      <Button disabled={busy} onClick={() => void savePolicy()}>{busy ? 'Saving…' : chosenPolicy ? `Save policy v${chosenPolicy.version + 1}` : 'Create SLA policy'}</Button><p className={s.help}>Existing incidents and tasks keep their frozen snapshot when this policy changes.</p>
    </> : <><CardHeader title="New staff-reported type" subtitle="AI-detected mappings cannot be invented here" />
      <label>Code<input value={typeDraft.code} onChange={event => setTypeDraft(d => ({ ...d, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))} /></label><label>Name<input value={typeDraft.name} onChange={event => setTypeDraft(d => ({ ...d, name: event.target.value }))} /></label>
      <label>Description<textarea value={typeDraft.description} onChange={event => setTypeDraft(d => ({ ...d, description: event.target.value }))} /></label><label><input type="checkbox" checked={typeDraft.requiresBeforePhoto} onChange={event => setTypeDraft(d => ({ ...d, requiresBeforePhoto: event.target.checked }))} /> Require before photo</label>
      <Button disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create staff-reported type'}</Button>
    </>}</Card>
  </AdminLayout>;
}

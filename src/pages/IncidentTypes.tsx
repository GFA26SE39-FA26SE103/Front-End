import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createIncidentType, listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import { listSlaPolicies, type IncidentSlaPolicy } from '../api/slaPolicies';
import { AdminLayout } from '../components/AdminLayout';
import { Button, Card, CardHeader, Chip, SearchBox } from '../components/ui';
import s from './IncidentTypes.module.css';

type TypeDraft = { code: string; name: string; description: string; requiresBeforePhoto: boolean };
const emptyType: TypeDraft = { code: '', name: '', description: '', requiresBeforePhoto: false };
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';

async function loadCatalogue(signal?: AbortSignal) {
  const [types, policies] = await Promise.all([listIncidentTypes(signal), listSlaPolicies(signal)]);
  return { types, policies };
}

function PolicyLink({ type, policies }: { type: IncidentType; policies: IncidentSlaPolicy[] }) {
  if (type.sourceType === 'AI_DETECTED') {
    return <Link className={s.policyLink} to="/admin/sla-policies?scope=event">Operational event SLA</Link>;
  }

  const matches = policies.filter(policy => policy.incidentTypeId === type.incidentTypeId);
  const [policy] = matches;
  const label = matches.length > 1 ? 'Multiple incident SLAs'
    : !policy ? 'Missing incident SLA'
      : policy.isEnabled ? `${policy.priorityCode} · Active` : 'Incident SLA disabled';
  return <Link className={s.policyLink} to="/admin/sla-policies?scope=incident" aria-label={`${label} for ${type.name}`}>{label}</Link>;
}

export default function IncidentTypes() {
  const [catalogue, setCatalogue] = useState<Awaited<ReturnType<typeof loadCatalogue>>>();
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string>();
  const [typeDraft, setTypeDraft] = useState(emptyType);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [updatingType, setUpdatingType] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void loadCatalogue(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalogue(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(problem(cause));
    });
    return () => controller.abort();
  }, []);
  const types = catalogue?.types;
  const policies = catalogue?.policies ?? [];
  const visible = useMemo(() => (types ?? []).filter(type => `${type.code} ${type.name}`.toLowerCase().includes(query.trim().toLowerCase())), [types, query]);
  const chosen = types?.find(type => type.incidentTypeId === selected);
  async function create() { if (!typeDraft.code.trim() || !typeDraft.name.trim()) return setError('Code and name are required.'); setBusy(true); setError(''); try { await createIncidentType({ code: typeDraft.code.trim(), name: typeDraft.name.trim(), description: typeDraft.description.trim() || null, requiresBeforePhoto: typeDraft.requiresBeforePhoto, status: 'ACTIVE' }); setTypeDraft(emptyType); setCatalogue(await loadCatalogue()); } catch (cause) { setError(problem(cause)); } finally { setBusy(false); } }
  async function toggle(type: IncidentType, enabled: boolean) {
    setBusy(true); setError(''); setUpdatingType(type.incidentTypeId);
    try {
      const saved = await updateIncidentType(type.incidentTypeId, {
        name: type.name, description: type.description, requiresBeforePhoto: type.requiresBeforePhoto ?? false,
        status: enabled ? 'ACTIVE' : 'INACTIVE',
      });
      setCatalogue(current => current && {
        ...current,
        types: current.types.map(row => row.incidentTypeId === type.incidentTypeId ? { ...row, status: saved.status } : row),
      });
    } catch (cause) { setError(problem(cause)); }
    finally { setUpdatingType(undefined); setBusy(false); }
  }
  return <AdminLayout title="Incident types" subtitle="Manage the types available for incident reporting">
    <Card className={s.list}><CardHeader title="Incident catalogue" subtitle="Select a policy status to open SLA policies for that category."><SearchBox value={query} onChange={setQuery} placeholder="Search code or name" width={190} /></CardHeader>
      {error && <p className={s.error} role="alert">{error}</p>}{!types && !error && <p className={s.muted}>Loading catalogue…</p>}
      <div className={`${s.row} ${s.head}`}><span>TYPE</span><span>SOURCE</span><span>MEASUREMENT</span><span>SLA POLICY</span><span>ON</span></div>
      {visible.map(type => <div key={type.incidentTypeId} className={`${s.row} ${type.status !== 'ACTIVE' ? s.disabled : ''}`}>
        <button type="button" className={s.name} onClick={() => setSelected(type.incidentTypeId)}>{type.name}<small className={s.muted}>{type.code}</small></button><span><Chip tone={type.sourceType === 'AI_DETECTED' ? 'primary' : 'warning'}>{type.sourceType === 'AI_DETECTED' ? 'AI-detected' : 'Staff reported'}</Chip></span>
        <span className={s.muted}>{type.measurementType ?? 'Staff report'}</span><span><PolicyLink type={type} policies={policies} /></span>
        {updatingType === type.incidentTypeId && <span className={s.saving} role="status">Saving…</span>}
        <input type="checkbox" aria-label={`${type.name} enabled`} checked={type.status === 'ACTIVE'} disabled={busy}
          onChange={event => void toggle(type, event.target.checked)} />
      </div>)}
    </Card>
    <Card className={s.drawer}>{chosen ? <><CardHeader title={chosen.name} subtitle={`${chosen.code} · ${chosen.sourceType}`} /><p className={s.help}>{chosen.description || 'No description.'}</p><p className={s.help}>Before photo: {chosen.requiresBeforePhoto ? 'Required' : 'Not required'}</p>
      <p className={s.help}><PolicyLink type={chosen} policies={policies} /></p>
      <Button variant="secondary" onClick={() => setSelected(undefined)}>Back to new incident type</Button>
    </> : <><CardHeader title="New staff-reported type" />
      <label>Code<input value={typeDraft.code} onChange={event => setTypeDraft(d => ({ ...d, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))} /></label><label>Name<input value={typeDraft.name} onChange={event => setTypeDraft(d => ({ ...d, name: event.target.value }))} /></label>
      <label>Description<textarea value={typeDraft.description} onChange={event => setTypeDraft(d => ({ ...d, description: event.target.value }))} /></label><label><input type="checkbox" checked={typeDraft.requiresBeforePhoto} onChange={event => setTypeDraft(d => ({ ...d, requiresBeforePhoto: event.target.checked }))} /> Require before photo</label>
      <Button disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create staff-reported type'}</Button>
    </>}</Card>
  </AdminLayout>;
}

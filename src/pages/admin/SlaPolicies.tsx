import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { listIncidentTypes } from '../../api/monitoring';
import {
  getSlaEscalation, listOperationalEventSlaPolicies, listSlaPolicies, listTaskTypeSlaPolicies, saveOperationalEventSlaPolicy, saveSlaEscalation,
  saveSlaPolicy, saveTaskTypeSlaPolicy, slaPriorities, type EscalationRole, type SlaEscalation, type SlaPolicySummary, type SlaPriority, type SlaTimingSave,
} from '../../api/slaPolicies';
import { AdminLayout } from '../../components/AdminLayout';
import { Button, Card, CardHeader, Chip } from '../../components/ui';
import s from './SlaPolicies.module.css';

/** L1: SLA timing (priority, response, resolution, offer timeout, warning %) and escalation routing for every SLA scope. */
type Scope = 'EVENT' | 'TASK' | 'INCIDENT';
type Row = { id: string; code: string; name: string; detail: string; policy: SlaPolicySummary | null; issues: string[] };
type Draft = { isEnabled: boolean; priorityCode: SlaPriority; responseTargetSec: string; resolutionTargetSec: string; offerTimeoutSec: string; warningPercent: string };
const scopes: { id: Scope; label: string; help: string }[] = [
  { id: 'EVENT', label: 'Operational events', help: 'Camera OperationalEvent types. WARNING/CRITICAL actions are configured per monitoring rule in AI Config.' },
  { id: 'TASK', label: 'Task types', help: 'StaffReport routine Tasks and Tasks an Operator creates manually. A missing policy blocks those Tasks with a configuration error.' },
  { id: 'INCIDENT', label: 'Incident types', help: 'Confirmed Incidents and their mandatory corrective Tasks.' },
];
const roles: EscalationRole[] = ['OPERATOR', 'MANAGER'];
const emptyDraft: Draft = { isEnabled: true, priorityCode: 'HIGH', responseTargetSec: '120', resolutionTargetSec: '1200', offerTimeoutSec: '60', warningPercent: '80' };
const issueLabels: Record<string, string> = {
  POLICY_MISSING: 'Not configured', POLICY_AMBIGUOUS: 'More than one policy — needs cleanup', POLICY_DISABLED: 'Disabled',
  PRIORITY_INVALID: 'Invalid priority', TIMING_INVALID: 'Invalid timing',
};
const toDraft = (policy: SlaPolicySummary | null): Draft => policy ? {
  isEnabled: policy.isEnabled, priorityCode: policy.priorityCode, responseTargetSec: String(policy.responseTargetSec),
  resolutionTargetSec: String(policy.resolutionTargetSec), offerTimeoutSec: String(policy.offerTimeoutSec), warningPercent: String(policy.warningPercent),
} : emptyDraft;
const duration = (seconds: number) => seconds % 3600 === 0 ? `${seconds / 3600} h` : seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
function problem(reason: unknown) {
  if (reason instanceof ApiError) {
    if (reason.code === 'SLA_POLICY_VERSION_CONFLICT') return 'This policy changed elsewhere. It was reloaded; review it and save again.';
    if (reason.status === 403) return 'Only an Administrator can manage SLA policies.';
    return reason.message;
  }
  return reason instanceof Error ? reason.message : 'The request could not be completed.';
}

async function loadRows(signal?: AbortSignal): Promise<Record<Scope, Row[]>> {
  const [events, tasks, incidentTypes, incidentPolicies] = await Promise.all([
    listOperationalEventSlaPolicies(signal), listTaskTypeSlaPolicies(signal), listIncidentTypes(signal), listSlaPolicies(signal)]);
  return {
    EVENT: events.map(row => ({ id: row.eventTypeId, code: row.code, name: row.name, detail: row.measurementType, policy: row.policy, issues: row.issues })),
    TASK: tasks.map(row => ({ id: row.taskTypeId, code: row.code, name: row.name, detail: row.sourceCategory, policy: row.policy, issues: row.issues })),
    INCIDENT: incidentTypes.filter(type => type.sourceType !== 'AI_DETECTED').map(type => {
      const matches = incidentPolicies.filter(policy => policy.incidentTypeId === type.incidentTypeId);
      const policy = matches.length === 1 ? matches[0] : null;
      return {
        id: type.incidentTypeId, code: type.code, name: type.name, detail: type.sourceType,
        policy: policy && {
          policyId: policy.policyId, isEnabled: policy.isEnabled, version: policy.version, priorityCode: policy.priorityCode,
          responseTargetSec: policy.responseTargetSec, resolutionTargetSec: policy.resolutionTargetSec, offerTimeoutSec: policy.offerTimeoutSec,
          warningPercent: policy.warningPercent, createdAt: policy.createdAt, updatedAt: policy.updatedAt,
        },
        issues: matches.length === 0 ? ['POLICY_MISSING'] : matches.length > 1 ? ['POLICY_AMBIGUOUS'] : policy?.isEnabled ? [] : ['POLICY_DISABLED'],
      };
    }),
  };
}

function save(scope: Scope, id: string, body: SlaTimingSave) {
  if (scope === 'EVENT') return saveOperationalEventSlaPolicy(id, body);
  if (scope === 'TASK') return saveTaskTypeSlaPolicy(id, body);
  return saveSlaPolicy(id, body);
}

export default function SlaPolicies() {
  const [scope, setScope] = useState<Scope>('EVENT');
  const [rows, setRows] = useState<Record<Scope, Row[]>>();
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const next = await loadRows(signal);
    if (!signal?.aborted) setRows(next);
    return next;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadRows(controller.signal).then(next => { if (!controller.signal.aborted) setRows(next); })
      .catch(cause => { if (!controller.signal.aborted) setError(problem(cause)); });
    return () => controller.abort();
  }, []);
  const visible = rows?.[scope] ?? [];
  const chosen = visible.find(row => row.id === selected);

  function choose(row: Row) { setSelected(row.id); setDraft(toDraft(row.policy)); setError(''); setNotice(''); }
  function switchScope(next: Scope) { setScope(next); setSelected(undefined); setError(''); setNotice(''); }

  async function submit() {
    if (!chosen) return;
    const values = [draft.responseTargetSec, draft.resolutionTargetSec, draft.offerTimeoutSec, draft.warningPercent].map(Number);
    if (!values.every(value => Number.isInteger(value) && value > 0)) return setError('SLA values must be positive whole seconds or percent.');
    const [responseTargetSec, resolutionTargetSec, offerTimeoutSec, warningPercent] = values;
    if (resolutionTargetSec < responseTargetSec) return setError('Resolution target cannot be shorter than the response target.');
    if (offerTimeoutSec > resolutionTargetSec) return setError('Offer timeout cannot be longer than the resolution target.');
    if (warningPercent >= 100) return setError('Warning percent must be between 1 and 99.');
    setBusy(true); setError(''); setNotice('');
    try {
      await save(scope, chosen.id, { expectedVersion: chosen.policy?.version ?? null, isEnabled: draft.isEnabled, priorityCode: draft.priorityCode,
        responseTargetSec, resolutionTargetSec, offerTimeoutSec, warningPercent });
      const next = await reload();
      setDraft(toDraft(next[scope].find(row => row.id === chosen.id)?.policy ?? null));
      setNotice(chosen.policy ? 'SLA policy saved as a new version. Existing Tasks and Incidents keep their snapshot.' : 'SLA policy created.');
    } catch (cause) {
      setError(problem(cause));
      if (cause instanceof ApiError && cause.code === 'SLA_POLICY_VERSION_CONFLICT') void reload().catch(() => undefined);
    } finally { setBusy(false); }
  }

  return <AdminLayout title="SLA policies" subtitle="Response and resolution targets, offer timeout and escalation (LOW · MEDIUM · HIGH · CRITICAL)">
    <div className={s.page}>
      <div className={s.tabs} role="tablist">{scopes.map(item => <button key={item.id} type="button" role="tab" aria-selected={scope === item.id}
        className={scope === item.id ? s.active : undefined} onClick={() => switchScope(item.id)}>{item.label}</button>)}</div>
      <p className={s.muted}>{scopes.find(item => item.id === scope)?.help}</p>
      {error && <p className={s.error} role="alert">{error}</p>}
      {notice && <p className={s.success} role="status">{notice}</p>}
      <div className={s.layout}>
        <Card className={s.list}>
          <CardHeader title={scopes.find(item => item.id === scope)?.label ?? ''} subtitle="Select a row to edit its SLA" />
          {!rows && !error && <p className={s.muted} role="status">Loading SLA policies…</p>}
          {rows && visible.length === 0 && <p className={s.muted}>Nothing to configure in this catalogue.</p>}
          {visible.length > 0 && <table className={s.table}>
            <thead><tr><th>Type</th><th>Priority</th><th>Respond</th><th>Resolve</th><th>Status</th></tr></thead>
            <tbody>{visible.map(row => <tr key={row.id} className={row.id === selected ? s.selected : undefined} onClick={() => choose(row)}>
              <td><button type="button" className={s.link} onClick={() => choose(row)}>{row.name}</button><small className={s.muted}>{row.code} · {row.detail}</small></td>
              <td>{row.policy ? <Chip tone={row.policy.priorityCode === 'CRITICAL' ? 'danger' : row.policy.priorityCode === 'HIGH' ? 'warning' : 'neutral'}>{row.policy.priorityCode}</Chip> : '—'}</td>
              <td>{row.policy ? duration(row.policy.responseTargetSec) : '—'}</td><td>{row.policy ? duration(row.policy.resolutionTargetSec) : '—'}</td>
              <td>{row.issues.length === 0 ? <Chip tone="success">Active v{row.policy?.version}</Chip> : row.issues.map(issue => <Chip key={issue} tone={issue === 'POLICY_DISABLED' ? 'neutral' : 'warning'}>{issueLabels[issue] ?? issue}</Chip>)}</td>
            </tr>)}</tbody>
          </table>}
        </Card>
        <Card className={s.drawer}>{chosen ? <>
          <CardHeader title={chosen.name} subtitle={`${chosen.code} · ${chosen.policy ? `policy v${chosen.policy.version}` : 'no policy yet'}`} />
          <fieldset className={s.form} disabled={busy}>
            <label>Priority<select value={draft.priorityCode} onChange={event => setDraft(d => ({ ...d, priorityCode: event.target.value as SlaPriority }))}>
              {slaPriorities.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className={s.check}><input type="checkbox" checked={draft.isEnabled} onChange={event => setDraft(d => ({ ...d, isEnabled: event.target.checked }))} />Policy enabled</label>
            {([['responseTargetSec', 'Response target (seconds)'], ['resolutionTargetSec', 'Resolution target (seconds)'], ['offerTimeoutSec', 'Offer timeout per dispatch ring (seconds)'], ['warningPercent', 'Warning at (% of the SLA window)']] as const)
              .map(([key, label]) => <label key={key}>{label}<input type="number" min="1" value={draft[key]} onChange={event => setDraft(d => ({ ...d, [key]: event.target.value }))} /></label>)}
            <Button disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : chosen.policy ? `Save as v${chosen.policy.version + 1}` : 'Create SLA policy'}</Button>
          </fieldset>
          {chosen.policy ? <EscalationEditor key={`${chosen.policy.policyId}:${chosen.policy.version}`} policyId={chosen.policy.policyId}
            onSaved={async () => { await reload(); setNotice('Escalation saved.'); }} />
            : <p className={s.muted}>Create the policy first to configure who is notified at the warning milestone and at breach.</p>}
        </> : <p className={s.muted}>Select a type to create or edit its SLA policy.</p>}</Card>
      </div>
    </div>
  </AdminLayout>;
}

/** Who is notified when a Task/Incident on this policy reaches the warning milestone and when it breaches (BR-38–BR-41). */
function EscalationEditor({ policyId, onSaved }: { policyId: string; onSaved: () => Promise<void> }) {
  const [escalation, setEscalation] = useState<SlaEscalation>();
  const [warning, setWarning] = useState<EscalationRole[]>([]);
  const [breach, setBreach] = useState<EscalationRole[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getSlaEscalation(policyId, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setEscalation(value); setWarning(value.warningRoles); setBreach(value.breachRoles); setError('');
    }).catch(cause => { if (!controller.signal.aborted) setError(problem(cause)); });
    return () => controller.abort();
  }, [policyId]);
  const toggle = (list: EscalationRole[], role: EscalationRole) => list.includes(role) ? list.filter(item => item !== role) : [...list, role];
  async function submit() {
    if (!escalation) return;
    if (warning.length === 0 || breach.length === 0) return setError('Choose at least one role for the warning and for the breach.');
    setBusy(true); setError('');
    try {
      await saveSlaEscalation(policyId, { expectedVersion: escalation.version, warningRoles: warning, breachRoles: breach });
      await onSaved();
    } catch (cause) { setError(problem(cause)); setBusy(false); }
  }
  return <section className={s.escalation} aria-label="Escalation">
    <h3>Escalation</h3>
    {!escalation && !error && <p className={s.muted} role="status">Loading escalation…</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {escalation && <fieldset className={s.form} disabled={busy}>
      {escalation.usesDefault && <p className={s.muted}>Using the default: warning → Operator, breach → Operator + Manager.</p>}
      {([['Warning milestone', warning, setWarning], ['SLA breach', breach, setBreach]] as const).map(([label, list, set]) => <div key={label} className={s.roles}>
        <span>{label}</span>
        {roles.map(role => <label key={role} className={s.check}><input type="checkbox" aria-label={`${label} ${role}`} checked={list.includes(role)} onChange={() => set(toggle(list, role))} />{role === 'OPERATOR' ? 'Operator' : 'Manager'}</label>)}
      </div>)}
      <Button variant="secondary" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save escalation'}</Button>
    </fieldset>}
  </section>;
}

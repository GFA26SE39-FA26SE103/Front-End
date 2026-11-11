import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { dismissIncident, listIncidents, type IncidentRow, type IncidentState } from '../../api/incidents';
import { loadSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { OperatorLayout } from '../../components/OperatorLayout';
import { Button, Card, Chip } from '../../components/ui';
import { useTaskPolling } from './useTaskPolling';
import s from './OperatorTasks.module.css';

/** L3: Incidents with mandatory-Task progress, mitigation and closure; Operator may dismiss with an audited reason (BR-19, BR-20). */
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const reasonLabel: Record<string, string> = { ALL_MANDATORY_TASKS_VERIFIED: 'Closed automatically: every mandatory task was verified' };
const statusTone = (row: IncidentRow) => row.status === 'CLOSED' ? 'success' : row.status === 'DISMISSED' || row.status === 'CANCELLED' ? 'neutral' : 'warning';

export default function OperatorIncidents() {
  const [state, setState] = useState<IncidentState>('open');
  const [target, setTarget] = useState<IncidentRow>();
  const [notice, setNotice] = useState('');
  const load = useCallback((signal: AbortSignal) => listIncidents(state, signal), [state]);
  const { data: incidents, error, checkedAt, refresh } = useTaskPolling(load, !!target);
  const canDismiss = loadSession()?.user.role === 'OPERATOR';
  return <OperatorLayout title="Incidents" subtitle="Confirmed incidents, corrective tasks, mitigation and closure">
    <div className={s.page}>
      <div className={s.heading}><div><h2>Incidents</h2><p className={s.muted}>An incident closes automatically when every mandatory task is verified. Mitigation is recorded separately.</p></div>
        <Button variant="secondary" onClick={refresh}>Refresh incidents</Button></div>
      {notice && <p className={s.success} role="status">{notice}</p>}
      <Card>
        <div className={s.tools}><div className={s.filters}><label>Show<select value={state} onChange={event => setState(event.target.value as IncidentState)}>
          <option value="open">Open incidents</option><option value="ended">Closed or dismissed</option><option value="all">All incidents</option></select></label></div>
          <span className={s.muted}>{checkedAt ? `Updated ${date(checkedAt.toISOString())} · Vietnam time` : 'Waiting for backend'}</span></div>
        {error && <p className={s.error} role="alert">{error}</p>}
        {!incidents && !error && <p className={s.message} role="status">Loading incidents…</p>}
        {incidents?.length === 0 && <p className={s.message}>No incidents match this filter.</p>}
        {!!incidents?.length && <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Incident</th><th>Zone</th><th>Status</th><th>Mandatory tasks</th><th>Mitigated</th><th>Closed</th><th /></tr></thead>
          <tbody>{incidents.map(row => <tr key={row.incidentId}>
            <td><strong>{row.title}</strong><p className={s.muted}>{row.incidentTypeName ?? row.incidentTypeCode ?? 'Incident'} · {row.sourceType.replaceAll('_', ' ').toLowerCase()}{row.slaPriorityCode ? ` · ${row.slaPriorityCode}` : ''}</p>
              {row.tasks.length > 0 && <ul className={s.muted}>{row.tasks.map(task => <li key={task.taskId}><Link className={s.taskLink} to={`/operator/tasks/${encodeURIComponent(task.taskId)}`}>{task.title}</Link>
                {' '}· {task.status.replaceAll('_', ' ').toLowerCase()}{task.isMandatory ? ' · mandatory' : ''}{task.assigneeName ? ` · ${task.assigneeName}` : ''}</li>)}</ul>}</td>
            <td>{row.zoneName}</td>
            <td><Chip tone={statusTone(row)}>{row.status}</Chip>{row.statusReason && <p className={s.muted}>{reasonLabel[row.statusReason] ?? row.statusReason}</p>}</td>
            <td>{row.mandatoryTasks === 0 ? '—' : `${row.verifiedMandatoryTasks}/${row.mandatoryTasks} verified`}</td>
            <td>{row.mitigatedAt ? date(row.mitigatedAt) : <span className={s.muted}>Not yet</span>}</td>
            <td>{date(row.closedAt)}{row.isOpen && row.resolutionDeadlineAt && <p className={s.muted}>Resolve by {date(row.resolutionDeadlineAt)}</p>}</td>
            <td>{row.isOpen && canDismiss && <Button variant="secondary" onClick={() => setTarget(row)}>Dismiss</Button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </Card>
      {target && <DismissDialog incident={target} onClose={() => setTarget(undefined)} onDone={() => {
        setNotice(`Incident "${target.title}" dismissed. The reason is recorded in the audit log.`); setTarget(undefined); refresh();
      }} />}
    </div>
  </OperatorLayout>;
}

function DismissDialog({ incident, onClose, onDone }: { incident: IncidentRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!reason.trim()) return setError('A reason is required to dismiss an incident.');
    setBusy(true); setError('');
    try { await dismissIncident(incident.incidentId, reason.trim()); onDone(); }
    catch (cause) { setError(problem(cause)); setBusy(false); }
  }
  return <Dialog title="Dismiss incident" busy={busy} onClose={onClose}>
    <div className={s.form}>
      <p className={s.muted}>{incident.title} · {incident.zoneName}. Dismissed incidents are excluded from incident KPIs; their tasks stay in Staff performance.</p>
      <label>Reason (required)<textarea rows={3} maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="dangerGhost" disabled={busy} onClick={() => void submit()}>{busy ? 'Dismissing…' : 'Dismiss incident'}</Button></div>
    </div>
  </Dialog>;
}

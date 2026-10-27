import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { assignTask, getTask, listAssignableStaff, listTasks, taskStatuses, type AssignableStaff, type OperationalTask, type TaskStatus } from '../../api/tasks';
import { loadSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { OperatorLayout } from '../../components/OperatorLayout';
import { Button, Card, CardHeader, Chip } from '../../components/ui';
import { useTaskPolling } from './useTaskPolling';
import s from './OperatorTasks.module.css';

const labels: Record<TaskStatus, string> = { OFFERED: 'Offered', ACCEPTED: 'Accepted', IN_PROGRESS: 'In progress', SUBMITTED: 'Pending verification', VERIFIED: 'Verified', CANCELLED: 'Cancelled' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const source = (origin: string) => ({ OPERATIONAL_EVENT: 'Operational event', INCIDENT: 'Incident', STAFF_REPORT: 'Staff report', MANUAL: 'Manual' }[origin] ?? origin);
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const workload = (count: number) => count === 0 ? 'No active tasks' : `${count} active ${count === 1 ? 'task' : 'tasks'}`;
function Status({ task }: { task: OperationalTask }) {
  return <Chip tone={task.status === 'VERIFIED' ? 'success' : task.status === 'IN_PROGRESS' ? 'primary' : task.status === 'SUBMITTED' ? 'purple' : 'neutral'}>{labels[task.status] ?? task.status}</Chip>;
}
function Priority({ value }: { value: string }) { return <Chip tone={value === 'CRITICAL' ? 'danger' : value === 'WARNING' ? 'warning' : 'neutral'}>{value}</Chip>; }

export default function OperatorTasks() {
  const [status, setStatus] = useState('');
  const [needsAssignment, setNeedsAssignment] = useState(false);
  const load = useCallback((signal: AbortSignal) => listTasks({ status, needsAssignment }, signal), [status, needsAssignment]);
  const { data: tasks, error, checkedAt, refresh } = useTaskPolling(load);
  return <OperatorLayout title="Task board" subtitle="Coordinate staff responses and assignments">
    <div className={s.page}>
      <div className={s.heading}><div><h2>Operational tasks</h2><p className={s.muted}>Follow offers, staff responses and work in progress.</p></div><Button variant="secondary" onClick={refresh}>Refresh tasks</Button></div>
      <div className={s.stats}>
        {[['Shown', tasks?.length], ['Needs assignment', tasks?.filter(t => t.needsAssignment).length], ['In progress', tasks?.filter(t => t.status === 'IN_PROGRESS').length], ['Pending verification', tasks?.filter(t => t.status === 'SUBMITTED').length]].map(([label, count]) => <div className={s.stat} key={label}><span className={s.muted}>{label}</span><strong>{count ?? '—'}</strong></div>)}
      </div>
      <Card>
        <div className={s.tools}><div className={s.filters}>
          <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Active tasks</option>{taskStatuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
          <label><input type="checkbox" checked={needsAssignment} onChange={event => setNeedsAssignment(event.target.checked)} />Needs assignment only</label>
        </div><span className={s.muted}>{checkedAt ? `Updated ${date(checkedAt.toISOString())} · Vietnam time` : 'Waiting for backend'}</span></div>
        {error && <p className={s.error} role="alert">{error}{tasks ? ' Showing the last successful result. Refresh before taking action.' : ''}</p>}
        {!tasks && !error && <p className={s.message} role="status">Loading tasks…</p>}
        {tasks?.length === 0 && <p className={s.message}>No tasks match these filters.</p>}
        {tasks && tasks.length > 0 && <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Task / source</th><th>Zone</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Planned start</th></tr></thead>
          <tbody>{tasks.map(task => <tr key={task.taskId}>
            <td><Link className={s.taskLink} to={`/operator/tasks/${encodeURIComponent(task.taskId)}`}>{task.title}</Link><p className={s.muted}>{source(task.origin)} · {task.sourceCode}</p>{task.eventClearedAt && <p className={s.muted}>Source event cleared</p>}</td>
            <td>{task.zoneName}<p className={s.muted}>{task.cameraCode ?? '—'}</p></td>
            <td><Priority value={task.priority} /></td><td><div className={s.badges}><Status task={task} />{task.needsAssignment && <Chip tone="warning">Needs assignment</Chip>}</div></td>
            <td>{task.assigneeName ?? 'Unassigned'}</td><td>{date(task.plannedStartAt)}</td>
          </tr>)}</tbody>
        </table></div>}
        <p className={s.muted}>Counts reflect this filtered view. Up to 200 recent matching tasks are returned. Updates pause while this tab is hidden.</p>
      </Card>
    </div>
  </OperatorLayout>;
}

export function OperatorTaskDetail() {
  const { taskId = '' } = useParams();
  return <TaskDetail key={taskId} taskId={taskId} />;
}

function TaskDetail({ taskId }: { taskId: string }) {
  const [assigning, setAssigning] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback((signal: AbortSignal) => getTask(taskId, signal), [taskId]);
  const { data: task, error, refresh } = useTaskPolling(load, assigning);
  const canAssign = loadSession()?.user.role === 'OPERATOR';
  return <OperatorLayout title="Task detail" subtitle="Assignment, source and staff progress">
    <div className={s.page}>
      <Link className={s.back} to="/operator/tasks">← Task board</Link>
      {notice && <p className={s.success} role="status">{notice}</p>}
      {error && <p className={s.error} role="alert">{error}{task ? ' Details may be stale; assignment is disabled until refreshed.' : ''}</p>}
      {!task && !error && <p className={s.message} role="status">Loading task…</p>}
      <div className={s.heading}><div><h2>{task?.title ?? 'Task unavailable'}</h2><p className={s.muted}>Task ID: {taskId}</p></div><Button variant="secondary" onClick={refresh}>Refresh task</Button></div>
      {task && <>
        <div className={s.badges}><Priority value={task.priority} /><Status task={task} />{task.needsAssignment && <Chip tone="warning">Needs assignment</Chip>}</div>
        {task.eventClearedAt && <p className={s.info}>The source event cleared at {date(task.eventClearedAt)}. Work already accepted remains with its assignee until the task workflow is completed.</p>}
        <div className={s.detail}><div className={s.stack}>
          <Card><CardHeader title="Work instructions" /><p className={s.instructions}>{task.instructions || 'No additional instructions.'}</p><dl className={s.kv}>
            <dt>Origin</dt><dd>{source(task.origin)}</dd><dt>Source</dt><dd>{task.sourceCode}</dd><dt>Zone</dt><dd>{task.zoneName}</dd><dt>Camera</dt><dd>{task.cameraCode ?? '—'}</dd>
            {task.raisedFrom && <><dt>Priority changed</dt><dd>{task.raisedFrom} → {task.priority}</dd></>}
          </dl></Card>
          <Card><CardHeader title="Progress" subtitle="All times shown in Vietnam time" /><ol className={s.timeline}>
            <li>Created · {date(task.createdAt)}</li><li>Assigned · {date(task.assignedAt)}</li><li>Accepted · {date(task.acceptedAt)}</li>
            {task.plannedStartAt && <li>Planned start · {date(task.plannedStartAt)}</li>}<li>Started · {date(task.startedAt)}</li><li>Submitted · {date(task.submittedAt)}</li>
          </ol></Card>
        </div><div className={s.stack}><Card><CardHeader title="Assignment" />
          <dl className={s.kv}><dt>Staff</dt><dd>{task.assigneeName ?? 'Unassigned'}</dd><dt>Method</dt><dd>{task.assigneeUserId ? task.assignmentType === 'MANUAL' ? 'Operator assigned' : 'Staff accepted offer' : 'Awaiting acceptance'}</dd><dt>Updated</dt><dd>{date(task.updatedAt)}</dd></dl>
          {canAssign && ['OFFERED', 'ACCEPTED'].includes(task.status) ? <Button disabled={!!error} onClick={() => setAssigning(true)}>{task.assigneeUserId ? 'Reassign task' : 'Assign task'}</Button>
            : <p className={s.muted}>{!canAssign ? 'Assignment actions require an Operator account.' : 'Assignment is available for offered or accepted tasks before work starts.'}</p>}
        </Card></div></div>
        {assigning && <AssignDialog key={task.taskId} task={task} onClose={() => setAssigning(false)} onConflict={refresh} onSaved={saved => {
          setAssigning(false); setNotice(`Task assigned to ${saved.assigneeName ?? 'Staff'}.`); refresh();
        }} />}
      </>}
    </div>
  </OperatorLayout>;
}

function AssignDialog({ task, onClose, onSaved, onConflict }: { task: OperationalTask; onClose: () => void; onSaved: (task: OperationalTask) => void; onConflict: () => void }) {
  const [staff, setStaff] = useState<AssignableStaff[]>();
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void listAssignableStaff(task.taskId, controller.signal).then(rows => {
      if (!controller.signal.aborted) { setStaff(rows.filter(row => row.userId !== task.assigneeUserId)); setError(''); }
    }).catch(cause => { if (!controller.signal.aborted) setError(problem(cause)); });
    return () => controller.abort();
  }, [task.taskId, task.assigneeUserId, retry]);
  const chosen = staff?.find(row => row.userId === userId);
  const reasonRequired = !!task.assigneeUserId || chosen?.assignedToZone === false;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return setError('Choose a Staff member.');
    if (reasonRequired && !reason.trim()) return setError('A reason is required for reassignment or assignment outside this Zone.');
    setBusy(true); setError('');
    try {
      onSaved(await assignTask(task.taskId, { staffUserId: userId, reason: reason.trim() || null, expectedUpdatedAt: task.updatedAt }));
    } catch (cause) {
      setError(problem(cause)); setBusy(false);
      if (cause instanceof ApiError && cause.code === 'TASK_CHANGED') {
        setConflict(true); onConflict();
      }
    }
  }
  return <Dialog title={task.assigneeUserId ? 'Reassign task' : 'Assign task'} busy={busy} onClose={onClose}>
    <form className={s.form} onSubmit={event => void save(event)}>
      <p className={s.muted}>Checked-in, on-shift Staff below the workload limit. Assignment enters Accepted; Staff starts the work.</p>
      <label>Staff member<select value={userId} disabled={busy || !staff || conflict} onChange={event => setUserId(event.target.value)}><option value="">{staff ? 'Choose Staff…' : 'Loading Staff…'}</option>
        {staff?.map(row => <option key={row.userId} value={row.userId}>{row.fullName} · {row.assignedToZone ? 'Assigned to this zone' : 'Assigned to another zone'} · {workload(row.activeTasks)}</option>)}</select></label>
      {staff?.length === 0 && <p className={s.info}>No eligible Staff available. Check shift, check-in and workload, then refresh candidates.</p>}
      {chosen && <p className={s.muted}>Shift ends {date(chosen.shiftEndsAt)}.{!chosen.assignedToZone && ' This Staff member is assigned outside the task Zone; record the reason.'}</p>}
      <label>Reason {reasonRequired ? '(required)' : '(optional)'}<textarea rows={3} maxLength={2000} value={reason} disabled={busy || conflict} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className={s.error} role="alert">{error}</p>}
      {conflict && <p className={s.info}>Close this dialog to review the latest Task before assigning again.</p>}
      <div className={s.actions}><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        {!conflict && <Button variant="secondary" disabled={busy} onClick={() => { setStaff(undefined); setUserId(''); setRetry(n => n + 1); }}>Refresh candidates</Button>}
        <Button type="submit" disabled={busy || !chosen || conflict}>{busy ? 'Assigning…' : 'Confirm assignment'}</Button></div>
    </form>
  </Dialog>;
}

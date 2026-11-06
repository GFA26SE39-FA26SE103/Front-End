import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getOperationalEvent, listEventZones, listOperationalEvents, type EventQuery, type EventZone, type OperationalEvent } from '../../api/operationalEvents';
import { ManagerLayout } from '../../components/ManagerLayout';
import { OperatorLayout } from '../../components/OperatorLayout';
import { Button, Card, Chip } from '../../components/ui';
import { useTaskPolling } from './useTaskPolling';
import s from './OperationalEvents.module.css';

type Workspace = 'operator' | 'manager';
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }) : '—';
function Layout({ workspace, detail, children }: { workspace: Workspace; detail?: boolean; children: ReactNode }) {
  const title = detail ? 'Event detail' : 'Operational events';
  const subtitle = 'Detected conditions, recovery and linked tasks';
  return workspace === 'manager' ? <ManagerLayout title={title} subtitle={subtitle}>{children}</ManagerLayout> : <OperatorLayout title={title} subtitle={subtitle}>{children}</OperatorLayout>;
}
function Badges({ event }: { event: OperationalEvent }) {
  return <span className={s.badges}><Chip tone={event.priority === 'CRITICAL' ? 'danger' : event.priority === 'WARNING' ? 'warning' : 'neutral'}>{event.priority}</Chip><Chip tone={event.status === 'ACTIVE' ? 'primary' : 'neutral'}>{event.status === 'CLEARED' ? 'Cleared' : event.status === 'ACTIVE' ? 'Active' : event.status}</Chip></span>;
}

function Filters({ query, zones, onApply }: { query: EventQuery; zones: EventZone[]; onApply: (query: EventQuery) => void }) {
  const [draft, setDraft] = useState({ status: query.status || 'ALL', priority: query.priority || 'ALL', zoneId: query.zoneId || '', from: query.from || '', to: query.to || '' });
  const [error, setError] = useState('');
  function apply(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setError('From must be on or before To.'); return; }
    setError('');
    onApply({ ...draft, page: 1, pageSize: query.pageSize });
  }
  return <form onSubmit={apply} aria-label="Event filters">
    <div className={s.filters}>
      <label>Status<select aria-label="Event status" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="CLEARED">Cleared</option></select></label>
      <label>Priority<select aria-label="Event priority" value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}><option value="ALL">All priorities</option><option value="WARNING">Warning</option><option value="CRITICAL">Critical</option></select></label>
      <label className={s.zoneFilter}>Zone<select aria-label="Event zone" value={draft.zoneId} onChange={event => setDraft({ ...draft, zoneId: event.target.value })}><option value="">All zones</option>{draft.zoneId && !zones.some(zone => zone.zoneId === draft.zoneId) && <option value={draft.zoneId}>Selected zone</option>}{zones.map(zone => <option key={zone.zoneId} value={zone.zoneId}>{zone.name}{zone.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}</select></label>
      <label>From<input aria-label="Detected from" type="date" min="2000-01-01" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>To<input aria-label="Detected to" type="date" min="2000-01-01" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
      <Button type="submit">Apply filters</Button><Button variant="secondary" onClick={() => { setDraft({ status: 'ALL', priority: 'ALL', zoneId: '', from: '', to: '' }); setError(''); onApply({ page: 1, pageSize: query.pageSize }); }}>Clear filters</Button>
    </div>
    {error && <p className={s.error} role="alert">{error}</p>}
  </form>;
}

export default function OperationalEvents({ workspace = 'operator' }: { workspace?: Workspace }) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const query = useMemo<EventQuery>(() => {
    const values = new URLSearchParams(search);
    return { status: values.get('status') || 'ALL', priority: values.get('priority') || 'ALL', zoneId: values.get('zoneId') || undefined,
      from: values.get('from') || undefined, to: values.get('to') || undefined, page: Number(values.get('page') || 1), pageSize: 20 };
  }, [search]);
  const load = useCallback((signal: AbortSignal) => listOperationalEvents(query, signal), [query]);
  const { data, error, refresh, checkedAt } = useTaskPolling(load);
  const visible = error ? undefined : data;
  const [zones, setZones] = useState<EventZone[]>([]);
  const [zoneError, setZoneError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const base = `/${workspace}/events`;
  useEffect(() => {
    const controller = new AbortController();
    void listEventZones(controller.signal).then(values => { if (!controller.signal.aborted) { setZones(values); setZoneError(''); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setZoneError(reason instanceof Error ? reason.message : 'Could not load zones.'); });
    return () => controller.abort();
  }, [attempt]);
  function apply(values: EventQuery) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '' && value !== 'ALL') next.set(key, String(value));
    setParams(next);
  }
  const pageCount = visible ? Math.max(1, Math.ceil(visible.totalCount / visible.pageSize)) : 1;
  return <Layout workspace={workspace}><div className={`${s.page} ${workspace === 'manager' ? s.managerPage : ''}`}>
    <div className={s.heading}><div><h2>Event history</h2><p>Each row is one detected episode. Events and tasks have independent lifecycles.</p></div><Button variant="secondary" onClick={refresh}>Refresh events</Button></div>
    <Card>
      <Filters key={search} query={query} zones={zones} onApply={apply} />
      <p className={s.note}>Dates filter detection time in {visible?.timeZone || 'the store timezone'}. Blank dates include all recorded history.</p>
      {zoneError && !error && <div className={s.catalogError} role="alert">Zone choices unavailable. {zoneError}<Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry zones</Button></div>}
    </Card>
    {error && <Card><p className={s.error} role="alert">{error} Figures are hidden until a successful refresh.</p><Button variant="secondary" onClick={refresh}>Retry events</Button></Card>}
    {!data && !error && <p role="status" className={s.note}>Loading events…</p>}
    {visible && <Card>
      <div className={s.heading}><h3>{visible.totalCount.toLocaleString()} matching events</h3><span className={s.note}>Updated {date(checkedAt?.toISOString() || null)} · Vietnam time</span></div>
      {visible.items.length === 0 ? <p className={s.empty}>No events match these filters. Clear filters to include all statuses and history.</p> : <div className={s.tableWrap}><table className={s.table}>
        <caption className={s.srOnly}>Operational event history</caption><thead><tr><th scope="col">Event</th><th scope="col">Zone / camera</th><th scope="col">Priority / status</th><th scope="col">Detected</th><th scope="col">Cleared</th><th scope="col">Linked tasks</th></tr></thead>
        <tbody>{visible.items.map(event => <tr key={event.eventId}><th scope="row"><Link to={`${base}/${encodeURIComponent(event.eventId)}${search ? `?${search}` : ''}`}>{event.eventTypeName}</Link><p className={s.note}>{event.sourceCode}</p></th><td>{event.zoneName}<p className={s.note}>{event.cameraCode}</p></td><td><Badges event={event} /></td><td>{date(event.detectedAt)}</td><td>{date(event.clearedAt)}</td><td>{event.taskCount}</td></tr>)}</tbody>
      </table></div>}
      <div className={s.pagination}><span className={s.note}>Page {visible.page}{visible.page <= pageCount ? ` of ${pageCount}` : ' · no rows'} · {visible.items.length} shown</span><div><Button variant="secondary" disabled={visible.page <= 1} onClick={() => apply({ ...query, page: visible.page - 1 })}>Previous</Button><Button variant="secondary" disabled={visible.page >= pageCount} onClick={() => apply({ ...query, page: visible.page + 1 })}>Next</Button></div></div>
    </Card>}
  </div></Layout>;
}

export function OperationalEventDetail({ workspace = 'operator' }: { workspace?: Workspace }) {
  const { eventId = '' } = useParams();
  const [params] = useSearchParams();
  const load = useCallback((signal: AbortSignal) => getOperationalEvent(eventId, signal), [eventId]);
  const { data, error, refresh } = useTaskPolling(load);
  const visible = error ? undefined : data;
  const event = visible?.event;
  return <Layout workspace={workspace} detail><div className={`${s.page} ${workspace === 'manager' ? s.managerPage : ''}`}>
    <div className={s.heading}><Link to={`/${workspace}/events${params.size ? `?${params}` : ''}`}>← Event history</Link><Button variant="secondary" onClick={refresh}>Refresh event</Button></div>
    {error && <Card><p className={s.error} role="alert">{error}</p><Button variant="secondary" onClick={refresh}>Retry event</Button></Card>}
    {!data && !error && <p role="status">Loading event…</p>}
    {visible && event && <>
      <Card><div className={s.heading}><div><h2>{event.eventTypeName}</h2><p>{event.sourceCode}</p></div><Badges event={event} /></div>
        <dl className={s.facts}><div><dt>Zone</dt><dd>{event.zoneName}</dd></div><div><dt>Camera</dt><dd>{workspace === 'operator' ? <Link to={`/operator/cameras/${encodeURIComponent(event.cameraId)}`}>{event.cameraName} · {event.cameraCode}</Link> : `${event.cameraName} · ${event.cameraCode}`}</dd></div><div><dt>Latest recorded metric</dt><dd>{event.metricValue.toLocaleString()} <span className={s.note}>({event.measurementType})</span></dd></div><div><dt>Event type</dt><dd>{event.eventTypeCode}</dd></div></dl>
        <p className={s.note}>Event priority is an alert level, independent of Task SLA priority. Clearing an event does not verify its linked tasks.</p>
      </Card>
      <Card><h3>Timeline · Vietnam time</h3><dl className={s.facts}><div><dt>Detected</dt><dd>{date(event.detectedAt)}</dd></div><div><dt>Last observed</dt><dd>{date(event.lastObservedAt)}</dd></div><div><dt>Cleared</dt><dd>{date(event.clearedAt)}</dd></div><div><dt>Last updated</dt><dd>{date(event.updatedAt)}</dd></div></dl></Card>
      <Card><h3>Linked tasks · {event.taskCount}</h3>{visible.tasks.length === 0 ? <p className={s.empty}>No linked tasks. An event does not always create a task.</p> : <div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Assignee</th><th scope="col">Created</th></tr></thead><tbody>{visible.tasks.map(task => <tr key={task.taskId}><th scope="row">{workspace === 'operator' ? <Link to={`/operator/tasks/${encodeURIComponent(task.taskId)}`}>{task.title}</Link> : task.title}</th><td>{task.status}</td><td>{task.assigneeName || 'Unassigned'}</td><td>{date(task.createdAt)}</td></tr>)}</tbody></table></div>}{visible.hasMoreTasks && <p className={s.note}>Showing the 100 most recent linked tasks.</p>}</Card>
    </>}
  </div></Layout>;
}

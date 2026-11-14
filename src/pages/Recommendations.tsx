import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getOperationalEvent, type OperationalEvent } from '../api/operationalEvents';
import { decideRecommendation, generateRecommendation, getRecommendation, listRecommendations,
  type Recommendation, type RecommendationDecision, type RecommendationStatus, type RecommendationWorkspace } from '../api/recommendations';
import { ManagerLayout } from '../components/ManagerLayout';
import { OperatorLayout } from '../components/OperatorLayout';
import { Button, Card, Chip } from '../components/ui';
import s from './Recommendations.module.css';

const statusLabels: Record<RecommendationStatus, string> = {
  AVAILABLE: 'Available', DEFERRED: 'Deferred', ACCEPTED: 'Accepted', DISMISSED: 'Dismissed', EXPIRED: 'Expired',
};
const noRecommendation: Record<string, string> = {
  INSUFFICIENT_VALID_EVIDENCE: 'No recommendation was generated. The event needs a recent, valid observation from an active rule.',
  EVIDENCE_CHANGED: 'The event changed during analysis. Review the latest observation before trying again.',
  NO_SUPPORTED_RECOMMENDATION: 'The model found no supported recommendation for this observation.',
};
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'medium',
}) : '—';
const message = (error: unknown) => error instanceof Error ? error.message : 'The request failed. Try again.';
const path = (workspace: RecommendationWorkspace) => `/${workspace}/recommendations`;

function Layout({ workspace, detail, children }: { workspace: RecommendationWorkspace; detail?: boolean; children: ReactNode }) {
  const Shell = workspace === 'manager' ? ManagerLayout : OperatorLayout;
  return <Shell title={detail ? 'Recommendation details' : 'Recommendations'} subtitle={workspace === 'manager'
    ? 'Review AI suggestions for operational events' : 'Review recommendations accepted by a Manager'}>
    <div className={`${s.page} ${workspace === 'operator' ? s.operatorPage : ''}`}>{children}</div>
  </Shell>;
}

function Status({ status }: { status: RecommendationStatus }) {
  return <Chip tone={status === 'ACCEPTED' ? 'success' : status === 'AVAILABLE' ? 'primary' : status === 'DEFERRED' ? 'warning' : 'neutral'}>
    {statusLabels[status] ?? status}
  </Chip>;
}

function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ load: typeof load; revision: number; value?: T; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({ load, revision, value });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ load, revision, error: message(error) });
    });
    return () => controller.abort();
  }, [load, revision]);
  const current = result?.load === load && result.revision === revision ? result : undefined;
  return { value: current?.value, error: current?.error, refresh: () => setRevision(value => value + 1),
    replace: (value: T) => setResult(previous => previous?.load === load && previous.revision === revision
      ? { load, revision, value } : previous) };
}

export function Recommendations({ workspace }: { workspace: RecommendationWorkspace }) {
  const [status, setStatus] = useState<RecommendationStatus | ''>('');
  const [managerPage, setManagerPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const trigger = useRef<HTMLButtonElement>(null);
  const operator = workspace === 'operator';
  const requestedPage = Number(params.get('page') ?? '1');
  const page = operator ? (Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10000 ? requestedPage : 1) : managerPage;
  const selected = operator ? params.get('review') : null;
  function select(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('review', id);
    else next.delete('review');
    setParams(next, { replace: true, preventScrollReset: true });
    if (!id) trigger.current?.focus({ preventScroll: true });
  }
  function setPage(nextPage: number) {
    if (!operator) { setManagerPage(nextPage); return; }
    const next = new URLSearchParams(params);
    next.set('page', String(nextPage));
    next.delete('review');
    setParams(next, { preventScrollReset: true });
  }
  const load = useCallback((signal: AbortSignal) => listRecommendations(workspace, page, status, signal), [workspace, page, status]);
  const { value, error, refresh } = useResource(load);
  return <Layout workspace={workspace}>
    <div className={selected ? s.splitReview : undefined}><Card>
      <div className={s.toolbar}>
        <div><h2>{workspace === 'manager' ? 'Recommendation history' : 'Accepted recommendations'}</h2>
          <p className={s.muted}>{workspace === 'manager' ? 'Open an active event to request a recommendation.' : 'Open a recommendation to review its evidence and the source event.'}</p></div>
        <div className={s.actions}>
          {workspace === 'manager' && <Link to="/manager/events?status=ACTIVE">View active events</Link>}
          <Button variant="secondary" onClick={refresh}>Refresh</Button>
        </div>
      </div>
      {workspace === 'manager' && <label className={s.field}>Status
        <select value={status} onChange={event => { setStatus(event.target.value as RecommendationStatus | ''); setPage(1); }}>
          <option value="">All statuses</option>
          {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>}
      {error && <p className={s.error} role="alert">{error}</p>}
      {!value && !error && <p className={s.muted} role="status">Loading recommendations…</p>}
      {value && <>
        {value.items.length === 0 ? <p className={s.muted}>No recommendations on this page.</p> : <div className={s.tableWrap}>
          <table className={s.table} aria-label="Recommendations">
            <thead><tr><th scope="col">Recommendation</th><th scope="col">Status</th><th scope="col">Generated · Vietnam time</th></tr></thead>
            <tbody>{value.items.map(item => <tr key={item.recommendationId} className={selected === item.recommendationId ? s.selectedRow : undefined}>
              <th scope="row">{operator
                ? <button type="button" className={s.rowLink} aria-expanded={selected === item.recommendationId}
                    aria-controls={selected === item.recommendationId ? 'operator-recommendation-panel' : undefined}
                    onClick={event => { trigger.current = event.currentTarget; select(item.recommendationId); }}>{item.title}</button>
                : <Link to={`${path(workspace)}/${encodeURIComponent(item.recommendationId)}`}>{item.title}</Link>}</th>
              <td><Status status={item.status} /></td><td>{date(item.generatedAt)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div className={s.toolbar}><span className={s.muted}>Page {value.page}</span><div className={s.actions}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="secondary" disabled={!value.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
        </div></div>
      </>}
    </Card>
    {selected && <OperatorRecommendationPanel key={selected} id={selected} onClose={() => select(null)} />}</div>
  </Layout>;
}

function OperatorRecommendationPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const load = useCallback((signal: AbortSignal) => getRecommendation('operator', id, signal), [id]);
  const { value, error, refresh } = useResource(load);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  return <aside id="operator-recommendation-panel" aria-labelledby="operator-recommendation-heading" className={`${s.page} ${s.eventPanel}`}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className={s.toolbar}><h2 id="operator-recommendation-heading">Recommendation details</h2>
      <button type="button" ref={close} className={s.closePanel} onClick={onClose}>Close</button></div>
    {error && <><p className={s.error} role="alert">{error}</p><Button variant="secondary" onClick={refresh}>Retry</Button></>}
    {!value && !error && <p role="status">Loading recommendation…</p>}
    {value && <RecommendationReview workspace="operator" value={value} />}
  </aside>;
}

export function RecommendationDetail({ workspace }: { workspace: RecommendationWorkspace }) {
  const { id = '' } = useParams();
  return <Detail key={`${workspace}/${id}`} workspace={workspace} id={id} />;
}

function Detail({ workspace, id }: { workspace: RecommendationWorkspace; id: string }) {
  const [params] = useSearchParams();
  const fromNotifications = workspace === 'operator' && params.get('from') === 'notifications';
  const load = useCallback((signal: AbortSignal) => getRecommendation(workspace, id, signal), [workspace, id]);
  const { value, error, refresh, replace } = useResource(load);
  return <Layout workspace={workspace} detail>
    <div className={s.toolbar}><Link to={fromNotifications ? '/operator/notifications' : path(workspace)}>{fromNotifications ? '← Back to Notifications' : '← Recommendations'}</Link><Button variant="secondary" onClick={refresh}>Refresh</Button></div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {!value && !error && <p role="status">Loading recommendation…</p>}
    {value && <RecommendationReview workspace={workspace} value={value} onSaved={replace} />}
  </Layout>;
}

function RecommendationReview({ workspace, value, onSaved }: { workspace: RecommendationWorkspace; value: Recommendation; onSaved?: (item: Recommendation) => void }) {
  return <>
      <Card>
        <p className={s.eyebrow}>Recommended action</p>
        <div className={s.toolbar}><h2>{value.title}</h2><Status status={value.status} /></div>
        <p className={s.summary}>{value.description}</p>
        {value.guidance && <div className={s.guidance}>
          <section aria-labelledby="recommendation-why"><h3 id="recommendation-why">Why this action</h3><p>{value.guidance.rationale}</p></section>
          <section aria-labelledby="recommendation-steps"><h3 id="recommendation-steps">What the Operator should do now</h3>
            <ol>{value.guidance.immediateSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
          </section>
          <div className={s.reviewPlan}>
            <section aria-labelledby="recommendation-recheck"><h3 id="recommendation-recheck">Recheck</h3>
              <p>Review the condition again in {value.guidance.recheckAfterMinutes} minutes.</p></section>
            <section aria-labelledby="recommendation-escalate"><h3 id="recommendation-escalate">Escalate when</h3>
              <p>{value.guidance.escalationCondition}</p></section>
          </div>
        </div>}
        <dl className={s.facts}>
          <div><dt>Generated · Vietnam time</dt><dd>{date(value.generatedAt)}</dd></div>
          <div><dt>Review deadline</dt><dd>{date(value.expiresAt)}</dd></div>
          {value.reviewedAt && <div><dt>Last reviewed</dt><dd>{date(value.reviewedAt)}</dd></div>}
          {workspace === 'manager' && value.eventId && <div><dt>Source</dt><dd><Link to={`/manager/events/${encodeURIComponent(value.eventId)}`}>Open operational event</Link></dd></div>}
        </dl>
      </Card>
      {value.evidence && <Card><details className={s.evidence}>
        <summary>Supporting evidence</summary>
        <p className={s.muted}>Observation and policy values used when this recommendation was generated.</p>
        <dl className={s.facts}>
          <div><dt>Observation</dt><dd>{value.evidence.signal.metric.toLocaleString()} {value.evidence.signal.unit}</dd></div>
          <div><dt>Observed · Vietnam time</dt><dd>{date(value.evidence.observedAt)}</dd></div>
          <div><dt>Alert level</dt><dd>{value.evidence.signal.alertLevel}</dd></div>
          <div><dt>SLA priority</dt><dd>{value.evidence.signal.slaPriority ?? 'Unavailable'}</dd></div>
          <div><dt>Warning threshold</dt><dd>{value.evidence.signal.warningThreshold}</dd></div>
          <div><dt>Critical threshold</dt><dd>{value.evidence.signal.criticalThreshold}</dd></div>
          <div><dt>Sustain duration</dt><dd>{value.evidence.signal.sustainSeconds} s</dd></div>
          <div><dt>Model confidence (self-assessed)</dt><dd>{value.evidence.confidence}</dd></div>
          {value.evidence.slaPolicyVersion != null && <div><dt>SLA policy version</dt><dd>{value.evidence.slaPolicyVersion}</dd></div>}
        </dl>
      </details></Card>}
      {workspace === 'manager' && onSaved && (value.status === 'AVAILABLE' || value.status === 'DEFERRED') && <DecisionForm item={value} onSaved={onSaved} />}
      {workspace === 'manager' && value.status === 'ACCEPTED' && <p className={s.notice} role="status">Accepted and available for Operator review.</p>}
      {workspace === 'operator' && (value.eventId ? <CurrentEvent key={value.eventId} eventId={value.eventId} />
        : <Card><h3>Current event</h3><p className={s.muted}>No source event is linked to this recommendation.</p></Card>)}
  </>;
}

function CurrentEvent({ eventId }: { eventId: string }) {
  const location = useLocation();
  const returnState = { recommendationReturn: location.pathname + location.search };
  const load = useCallback((signal: AbortSignal) => getOperationalEvent(eventId, signal), [eventId]);
  const { value, error, refresh } = useResource(load);
  return <Card>
    <div className={s.toolbar}><h3>Current event</h3><Button variant="secondary" onClick={refresh}>Refresh event</Button></div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {!value && !error && <p role="status">Loading current event…</p>}
    {value && <>
      <p>{value.event.eventTypeName} · {value.event.zoneName} · {value.event.sourceCode}</p>
      <dl className={s.facts}>
        <div><dt>Event status</dt><dd>{value.event.status}</dd></div>
        <div><dt>Alert level</dt><dd>{value.event.priority}</dd></div>
        <div><dt>Latest recorded metric</dt><dd>{value.event.metricValue.toLocaleString()} ({value.event.measurementType})</dd></div>
        <div><dt>Last observed · Vietnam time</dt><dd>{date(value.event.lastObservedAt)}</dd></div>
      </dl>
      <h3 className={s.linkedTasks}>Linked tasks</h3>
      {value.tasks.length === 0 ? <p className={s.muted}>No tasks are linked to this event.</p> : <ul className={s.taskList}>
        {value.tasks.map(task => <li key={task.taskId}><Link to={`/operator/tasks/${encodeURIComponent(task.taskId)}`} state={returnState}>{task.title}</Link> · {task.status}</li>)}
      </ul>}
    </>}
    <Link className={s.sourceLink} to={`/operator/events/${encodeURIComponent(eventId)}`} state={returnState}>Open operational event</Link>
  </Card>;
}

function DecisionForm({ item, onSaved }: { item: Recommendation; onSaved: (item: Recommendation) => void }) {
  const [decision, setDecision] = useState<RecommendationDecision>('ACCEPTED');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsReason = decision !== 'ACCEPTED';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (needsReason && !reason.trim())) return;
    setBusy(true); setError('');
    try {
      const saved = await decideRecommendation(item.recommendationId, decision, reason);
      setDecision('ACCEPTED'); setReason(''); onSaved(saved);
    } catch (error: unknown) {
      setError(error instanceof ApiError && error.code === 'RECOMMENDATION_EVIDENCE_UNAVAILABLE'
        ? 'The source evidence changed or expired. Open the source event and request a new recommendation.' : message(error));
    } finally { setBusy(false); }
  }
  return <Card><h3>Manager decision</h3>
    <p className={s.muted}>Accepting sends the recommendation to Operator review. Task creation requires a separate action.</p>
    <form className={s.form} onSubmit={event => void submit(event)}>
      <label className={s.field}>Decision<select value={decision} disabled={busy} onChange={event => setDecision(event.target.value as RecommendationDecision)}>
        <option value="ACCEPTED">Accept</option>{item.status === 'AVAILABLE' && <option value="DEFERRED">Defer</option>}<option value="DISMISSED">Dismiss</option>
      </select></label>
      <label className={s.field}>Reason {needsReason ? '(required)' : '(optional)'}
        <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} required={needsReason} disabled={busy} rows={3} />
      </label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <Button type="submit" disabled={busy || (needsReason && !reason.trim())}>{busy ? 'Saving…' : 'Save decision'}</Button>
    </form>
  </Card>;
}

async function findPendingRecommendation(eventId: string, zoneId: string, signal: AbortSignal) {
  const candidates = await Promise.all((['AVAILABLE', 'DEFERRED'] as const).map(async status => {
    for (let page = 1; ; page++) {
      const result = await listRecommendations('manager', page, status, signal, zoneId);
      const match = result.items.find(item => item.eventId === eventId && item.status === status);
      if (match || !result.hasMore) return match;
    }
  }));
  const match = candidates.filter(item => item !== undefined).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0];
  return match ? getRecommendation('manager', match.recommendationId, signal) : null;
}

export function EventRecommendationPanel({ event, onClose }: { event: OperationalEvent; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const { eventId, zoneId } = event;
  const load = useCallback((signal: AbortSignal) => findPendingRecommendation(eventId, zoneId, signal), [eventId, zoneId]);
  const { value, error, refresh, replace } = useResource(load);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);

  return <aside id="event-recommendation-panel" aria-labelledby="event-recommendation-heading" className={`${s.page} ${s.eventPanel}`}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className={s.toolbar}>
      <h2 id="event-recommendation-heading">AI recommendation</h2>
      <button type="button" ref={close} className={s.closePanel} onClick={onClose}>Close</button>
    </div>
    <p className={s.muted}>{event.eventTypeName} · {event.zoneName} · {event.sourceCode}</p>
    <p>Latest observation: {event.metricValue.toLocaleString()} · {date(event.lastObservedAt)}</p>
    {error && <><p className={s.error} role="alert">{error}</p><Button variant="secondary" onClick={refresh}>Retry</Button></>}
    {value === undefined && !error && <p role="status">Checking for an existing recommendation…</p>}
    {value && <RecommendationReview workspace="manager" value={value} onSaved={replace} />}
    {(value === null || value?.status === 'EXPIRED' || value?.status === 'DISMISSED') && event.status === 'ACTIVE' &&
      <GenerateFromEvent eventId={eventId} onGenerated={replace} />}
  </aside>;
}

export function GenerateFromEvent({ eventId, onGenerated }: { eventId: string; onGenerated?: (item: Recommendation) => void }) {
  const navigate = useNavigate();
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => () => request.current?.abort(), []);
  async function generate() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setNotice(''); setError('');
    try {
      const result = await generateRecommendation(eventId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.recommendation) {
        if (onGenerated) onGenerated(result.recommendation);
        else navigate(`${path('manager')}/${encodeURIComponent(result.recommendation.recommendationId)}`);
      } else setNotice(noRecommendation[result.reason ?? ''] ?? 'No recommendation was generated.');
    } catch (error: unknown) { if (!controller.signal.aborted) setError(message(error)); }
    finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <Card><div className={s.toolbar}><div><h3>AI recommendation</h3><p className={s.muted}>Analyze this event’s latest valid observation.</p></div>
    <Button onClick={() => void generate()} disabled={busy}>{busy ? 'Generating…' : 'Generate recommendation'}</Button>
  </div>{notice && <p className={s.notice} role="status">{notice}</p>}{error && <p className={s.error} role="alert">{error}</p>}</Card>;
}

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
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
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => listRecommendations(workspace, page, status, signal), [workspace, page, status]);
  const { value, error, refresh } = useResource(load);
  return <Layout workspace={workspace}>
    <Card>
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
            <tbody>{value.items.map(item => <tr key={item.recommendationId}>
              <th scope="row"><Link to={`${path(workspace)}/${encodeURIComponent(item.recommendationId)}`}>{item.title}</Link></th>
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
  </Layout>;
}

export function RecommendationDetail({ workspace }: { workspace: RecommendationWorkspace }) {
  const { id = '' } = useParams();
  return <Detail key={`${workspace}/${id}`} workspace={workspace} id={id} />;
}

function Detail({ workspace, id }: { workspace: RecommendationWorkspace; id: string }) {
  const load = useCallback((signal: AbortSignal) => getRecommendation(workspace, id, signal), [workspace, id]);
  const { value, error, refresh, replace } = useResource(load);
  return <Layout workspace={workspace} detail>
    <div className={s.toolbar}><Link to={path(workspace)}>← Recommendations</Link><Button variant="secondary" onClick={refresh}>Refresh</Button></div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {!value && !error && <p role="status">Loading recommendation…</p>}
    {value && <>
      <Card>
        <div className={s.toolbar}><h2>{value.title}</h2><Status status={value.status} /></div>
        <p>{value.description}</p>
        <dl className={s.facts}>
          <div><dt>Generated · Vietnam time</dt><dd>{date(value.generatedAt)}</dd></div>
          <div><dt>Review deadline</dt><dd>{date(value.expiresAt)}</dd></div>
          {value.reviewedAt && <div><dt>Last reviewed</dt><dd>{date(value.reviewedAt)}</dd></div>}
          {value.eventId && <div><dt>Source</dt><dd><Link to={`/${workspace}/events/${encodeURIComponent(value.eventId)}`}>Open operational event</Link></dd></div>}
        </dl>
      </Card>
      {value.evidence && <Card><h3>Evidence at generation</h3>
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
      </Card>}
      {workspace === 'manager' && (value.status === 'AVAILABLE' || value.status === 'DEFERRED') && <DecisionForm item={value} onSaved={replace} />}
      {workspace === 'manager' && value.status === 'ACCEPTED' && <p className={s.notice} role="status">Accepted and available for Operator review.</p>}
      {workspace === 'operator' && <Card><h3>Operator review</h3><p>Check the current event before taking action.</p><Link to="/operator/tasks">Open task board</Link></Card>}
    </>}
  </Layout>;
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

export function GenerateFromEvent({ eventId }: { eventId: string }) {
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
      if (result.recommendation) navigate(`${path('manager')}/${encodeURIComponent(result.recommendation.recommendationId)}`);
      else setNotice(noRecommendation[result.reason ?? ''] ?? 'No recommendation was generated.');
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

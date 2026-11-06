import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  getAnalyticsOverview, getAnalyticsTrends, getAnalyticsZones,
  type AnalyticsDuration, type AnalyticsOverview, type AnalyticsQuery, type AnalyticsSla,
  type AnalyticsTrends, type AnalyticsZones,
} from '../../api/analytics';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Button, Card } from '../../components/ui';
import s from './Analytics.module.css';

type Result = { key: string; data?: { overview: AnalyticsOverview; trends: AnalyticsTrends; zones: AnalyticsZones }; error?: string };
type Draft = { from: string; to: string; zoneId: string };
type Metric = 'events' | 'incidents' | 'tasks';
const metrics: Record<Metric, string> = { events: 'Events detected', incidents: 'Incidents (excluding dismissed)', tasks: 'Tasks created' };
const statusLabels: Record<string, string> = { OFFERED: 'Offered', ACCEPTED: 'Accepted', IN_PROGRESS: 'In progress', SUBMITTED: 'Awaiting verification', VERIFIED: 'Verified', CANCELLED: 'Cancelled' };
const number = (value: number) => value.toLocaleString('en-GB');
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const dateLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
function duration(value: AnalyticsDuration) {
  if (value.averageSeconds === null) return '—';
  const seconds = value.averageSeconds;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} hr`;
}
function errorMessage(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 404) return 'Analytics is unavailable. The selected zone may have been removed, or the analytics API is not deployed yet.';
  if (reason instanceof ApiError) return reason.message;
  return 'Could not load analytics. Check your connection and try again.';
}
function dayCount(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
}

function SlaCard({ title, value }: { title: string; value: AnalyticsSla }) {
  return <section className={s.slaBlock} aria-label={title}>
    <div className={s.sectionHeading}><h3>{title}</h3><strong>{percent(value.metPercent)}</strong></div>
    <p className={s.muted}>{number(value.met)} met of {number(value.evaluated)} evaluated</p>
    <dl className={s.slaCounts}>
      <div><dt>Met</dt><dd className={s.good}>{number(value.met)}</dd></div>
      <div><dt>Breached</dt><dd className={s.danger}>{number(value.breached)}</dd></div>
      <div><dt>Pending</dt><dd>{number(value.pending)}</dd></div>
      <div><dt>Unavailable</dt><dd>{number(value.unavailable)}</dd></div>
    </dl>
  </section>;
}

export default function Analytics() {
  const [query, setQuery] = useState<AnalyticsQuery>({});
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Draft>({ from: '', to: '', zoneId: '' });
  const [zoneOptions, setZoneOptions] = useState<{ zoneId: string; zoneName: string }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [validation, setValidation] = useState('');
  const [metric, setMetric] = useState<Metric>('events');
  const key = JSON.stringify([query, revision]);
  const loading = result?.key !== key;
  const data = loading ? undefined : result?.data;
  const error = loading ? undefined : result?.error;

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getAnalyticsOverview(query, controller.signal), getAnalyticsTrends(query, controller.signal), getAnalyticsZones(query, controller.signal),
    ]).then(([overview, trends, zones]) => {
      if (controller.signal.aborted) return;
      setResult({ key, data: { overview, trends, zones } });
      if (!query.zoneId) setZoneOptions(zones.zones.map(({ zoneId, zoneName }) => ({ zoneId, zoneName })));
      setDraft(current => ({ ...current, from: current.from || overview.period.from, to: current.to || overview.period.to }));
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setResult({ key, error: errorMessage(reason) });
        controller.abort();
      }
    });
    return () => controller.abort();
  }, [key, query]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const days = dayCount(draft.from, draft.to);
    if (!Number.isFinite(days) || days < 1 || days > 93 || draft.from < '2000-01-01') {
      setValidation('Choose a date range of 1–93 days, beginning in year 2000 or later.');
      return;
    }
    setValidation('');
    setQuery({ from: draft.from, to: draft.to, ...(draft.zoneId ? { zoneId: draft.zoneId } : {}) });
    setRevision(value => value + 1);
  }

  const summary = data?.overview.summary;
  const period = data?.overview.period;
  const days = data?.trends.days ?? [];
  const maximum = Math.max(1, ...days.map(day => day.summary[metric].total));
  const hasTrend = days.some(day => day.summary[metric].total > 0);
  const entries = summary ? Object.entries(summary.tasks.byStatus) : [];
  const selectedZone = zoneOptions.find(zone => zone.zoneId === query.zoneId)?.zoneName ?? 'All zones';
  const empty = summary && summary.events.total === 0 && summary.incidents.recorded === 0 && summary.tasks.total === 0;
  const eventFilters = period ? new URLSearchParams({ from: period.from, to: period.to, ...(period.zoneId ? { zoneId: period.zoneId } : {}) }) : null;

  return <ManagerLayout title="Operational analytics" subtitle="Review recorded events, tasks and service performance.">
    <div className={s.page}>
      <Card>
        <form onSubmit={apply} className={s.filters} aria-label="Analytics filters">
          <label>From<input type="date" required min="2000-01-01" value={draft.from} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} /></label>
          <label>To<input type="date" required min="2000-01-01" value={draft.to} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} /></label>
          <label className={s.zoneFilter}>Zone<select value={draft.zoneId} onChange={event => setDraft(current => ({ ...current, zoneId: event.target.value }))}>
            <option value="">All zones</option>{zoneOptions.map(zone => <option key={zone.zoneId} value={zone.zoneId}>{zone.zoneName}</option>)}
          </select></label>
          <Button disabled={loading} type="submit">Apply filters</Button>
          <Button variant="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>
        </form>
        {validation && <p className={s.error} role="alert">{validation}</p>}
      </Card>

      {loading && <Card><p className={s.loading} role="status">Loading analytics…</p></Card>}
      {error && <Card><div className={s.errorPanel} role="alert"><div><h2>Analytics unavailable</h2><p>{error}</p><p>Figures are hidden until the data can be refreshed.</p></div><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Retry analytics</Button></div></Card>}

      {data && summary && period && <>
        <div className={s.context}>
          <p><strong>{period.from} — {period.to}</strong><span> · {selectedZone}</span></p>
          <span>Updated {new Date(period.generatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</span>
        </div>
        {empty && <p className={s.emptyNotice} role="status">No records in this period. Try a different date range or zone. Missing averages and SLA rates appear as —.</p>}
        <div className={s.kpis}>
          <Card className={s.kpi}><p>Events detected</p><strong><Link className={s.eventLink} to={`/manager/events?${eventFilters}`} aria-label={`View ${summary.events.total} events in this period`}>{number(summary.events.total)}</Link></strong><span>{number(summary.events.active)} currently active · {number(summary.events.latestCritical)} latest critical</span></Card>
          <Card className={s.kpi}><p>Incidents</p><strong>{number(summary.incidents.total)}</strong><span>{number(summary.incidents.open)} open · {number(summary.incidents.dismissed)} dismissed excluded</span></Card>
          <Card className={s.kpi}><p>Tasks created</p><strong>{number(summary.tasks.total)}</strong><span>{number(summary.tasks.byStatus.VERIFIED ?? 0)} verified · {number(summary.tasks.byStatus.SUBMITTED ?? 0)} awaiting verification</span></Card>
          <Card className={`${s.kpi} ${s.highlight}`}><p>Response SLA met</p><strong>{percent(summary.tasks.responseSla.metPercent)}</strong><span>{number(summary.tasks.responseSla.evaluated)} evaluated · {number(summary.tasks.responseSla.unavailable)} unavailable</span></Card>
        </div>

        <div className={s.visualRow}>
          <Card className={s.trendCard}>
            <div className={s.sectionHeading}><div><h2>Daily activity</h2><p className={s.muted}>Records first detected or created on each day</p></div><select aria-label="Trend metric" value={metric} onChange={event => setMetric(event.target.value as Metric)}>{Object.entries(metrics).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {hasTrend ? <div className={s.chartScroll}><div className={s.chart} role="img" aria-label={`${metrics[metric]} by day. Highest daily count: ${maximum}. Full values are in the daily data table.`} style={{ minWidth: Math.max(360, days.length * 14) }}>
              {days.map((day, index) => <div key={day.date} className={s.chartColumn} title={`${day.date}: ${day.summary[metric].total}`}>
                <div className={s.barTrack}><div className={s.bar} style={{ height: `${100 * day.summary[metric].total / maximum}%` }} />{days.length <= 14 && <span>{number(day.summary[metric].total)}</span>}</div>
                <span className={s.tick}>{index % Math.ceil(days.length / 7) === 0 || index === days.length - 1 ? dateLabel(day.date) : ''}</span>
              </div>)}
            </div></div> : <p className={s.chartEmpty}>No {metric === 'events' ? 'events detected' : metric === 'incidents' ? 'incidents' : 'tasks created'} in this period.</p>}
            <details className={s.dailyData}><summary>View daily data</summary><div className={s.tableScroll}><table><caption>Daily records — {period.timeZone}</caption><thead><tr><th scope="col">Date</th><th scope="col">Events</th><th scope="col">Incidents</th><th scope="col">Tasks</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{number(day.summary.events.total)}</td><td>{number(day.summary.incidents.total)}</td><td>{number(day.summary.tasks.total)}</td></tr>)}</tbody></table></div></details>
          </Card>
          <Card><h2>Task progress</h2><p className={s.muted}>Current status of tasks created in this period</p><div className={s.statuses}>{entries.map(([status, count]) => <div key={status}><div className={s.statusLabel}><span>{statusLabels[status] ?? status}</span><strong>{number(count)}</strong></div><div className={s.statusTrack}><div className={status === 'VERIFIED' ? s.verifiedBar : s.statusBar} style={{ width: `${summary.tasks.total ? count / summary.tasks.total * 100 : 0}%` }} /></div></div>)}</div></Card>
        </div>

        <Card><div className={s.sectionHeading}><div><h2>Service levels</h2><p className={s.muted}>Measured against each task’s saved deadline</p></div><span className={s.muted}>Cancelled tasks excluded</span></div>
          <div className={s.slaGrid}><SlaCard title="Response SLA" value={summary.tasks.responseSla} /><SlaCard title="Resolution SLA" value={summary.tasks.resolutionSla} /></div>
          <details className={s.method}><summary>How to read these figures</summary><p>Rates include met and breached tasks. Pending and unavailable tasks are excluded. Incomplete work becomes breached once its deadline passes; — means no evaluated tasks.</p><p>Dates use {period.timeZone}. Figures cover records detected or created in the selected period and their latest status, including later progress. They do not reconstruct past daily status or prove camera availability.</p></details>
        </Card>

        <Card><h2>Average handling times</h2><div className={s.durations}>{([
          ['Task response', summary.tasks.responseTime], ['Task completion', summary.tasks.completionTime],
          ['Event clearance', summary.events.clearTime], ['Incident resolution', summary.incidents.resolutionTime],
        ] as [string, AnalyticsDuration][]).map(([label, value]) => <div key={label}><p>{label}</p><strong>{duration(value)}</strong><span>{number(value.samples)} {value.samples === 1 ? 'sample' : 'samples'}</span></div>)}</div></Card>

        <Card><div className={s.sectionHeading}><div><h2>Zone breakdown</h2><p className={s.muted}>Same date range and zone filter as the overview</p></div><span className={s.muted}>{data.zones.zones.length} {data.zones.zones.length === 1 ? 'zone' : 'zones'}</span></div>
          <div className={s.tableScroll}><table><caption className={s.srOnly}>Zone analytics</caption><thead><tr><th scope="col">Zone</th><th scope="col">Events</th><th scope="col">Active events</th><th scope="col">Incidents</th><th scope="col">Tasks</th><th scope="col">Verified</th><th scope="col">Response SLA</th></tr></thead><tbody>{data.zones.zones.map(zone => <tr key={zone.zoneId}><th scope="row">{zone.zoneName}</th><td>{number(zone.summary.events.total)}</td><td>{number(zone.summary.events.active)}</td><td>{number(zone.summary.incidents.total)}</td><td>{number(zone.summary.tasks.total)}</td><td>{number(zone.summary.tasks.byStatus.VERIFIED ?? 0)}</td><td>{percent(zone.summary.tasks.responseSla.metPercent)}</td></tr>)}{data.zones.zones.length === 0 && <tr><td colSpan={7}>No zones are configured.</td></tr>}</tbody></table></div>
        </Card>
      </>}
    </div>
  </ManagerLayout>;
}

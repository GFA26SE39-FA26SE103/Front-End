import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { getAuditLogFacets, listAuditLogs, type AuditLogEntry, type AuditLogFacets, type AuditLogFilter, type AuditLogPage } from '../api/auditLogs';
import { AdminLayout } from '../components/AdminLayout';
import { Badge, Button, Overline, SearchBox, Select, StatCard } from '../components/ui';
import s from './Monitoring.module.css';

/** FE-12 §3.13.3: Admin inspection of the append-only audit log recorded by the backend. Nothing here edits or deletes entries. */
const PAGE_SIZE = 50;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
type Range = 'today' | '7d' | '30d' | 'all';
const ranges: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: 'all', label: 'All time' },
];
const actionLabels: Record<string, string> = {
  DISMISS_INCIDENT: 'Incident dismissed', CLOSE_INCIDENT: 'Incident closed', MITIGATE_INCIDENT: 'Incident mitigated',
  UPDATE_NOTIFICATION_SETTINGS: 'Notification settings changed', EXPORT_ANALYTICS_REPORT: 'Analytics report exported',
  RECOMMENDATION_DECISION: 'Recommendation decided',
};
const reasonLabels: Record<string, string> = { ALL_MANDATORY_TASKS_VERIFIED: 'Every mandatory task was verified', 'TT-12_MANUAL_VERIFIED': 'Mitigation task TT-12 verified' };
const resultTone = (result: string | null): 'success' | 'danger' | 'warning' | 'neutral' => result === 'SUCCESS' ? 'success' : result === 'FAILED' || result === 'DENIED' ? 'danger' : result ? 'warning' : 'neutral';
const actionLabel = (action: string) => actionLabels[action] ?? action.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
const stamp = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'medium' });
const time = (value: string) => new Date(value).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE });
const shortId = (id: string | null) => id ? id.slice(0, 8).toUpperCase() : '—';
function rangeDates(range: Range, now = new Date()): Pick<AuditLogFilter, 'from' | 'to'> {
  if (range === 'all') return {};
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
  return { from: day(new Date(now.getTime() - days * 86_400_000)), to: day(now) };
}
function problem(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 403) return 'Only an Administrator can inspect audit logs.';
  return reason instanceof Error ? reason.message : 'Audit logs could not be loaded.';
}
function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try { const value: unknown = JSON.parse(json); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : { value }; }
  catch { return { value: json }; }
}
const show = (value: unknown) => value === undefined ? '—' : value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value);
/** Field-level before/after view of the recorded JSON snapshots. */
function changes(entry: Pick<AuditLogEntry, 'oldValuesJson' | 'newValuesJson'>) {
  const before = parse(entry.oldValuesJson) ?? {}, after = parse(entry.newValuesJson) ?? {};
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).map(field => ({ field, from: show(before[field]), to: show(after[field]) }));
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
const csv = (value: string) => `"${value.replace(/"/g, '""')}"`;

export default function AuditLog() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [userId, setUserId] = useState('all');
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [result, setResult] = useState('all');
  const [range, setRange] = useState<Range>('7d');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AuditLogPage>();
  const [facets, setFacets] = useState<AuditLogFacets>();
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>();

  const filter = useMemo<AuditLogFilter>(() => ({
    ...rangeDates(range), userId: userId === 'all' ? undefined : userId, action: action === 'all' ? undefined : action,
    entityType: entityType === 'all' ? undefined : entityType, result: result === 'all' ? undefined : result,
    search: appliedSearch.trim() || undefined, page, pageSize: PAGE_SIZE,
  }), [range, userId, action, entityType, result, appliedSearch, page]);

  useEffect(() => {
    const controller = new AbortController();
    void getAuditLogFacets(controller.signal).then(value => { if (!controller.signal.aborted) setFacets(value); }).catch(() => undefined);
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    void listAuditLogs(filter, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setData(value); setError('');
    }).catch(cause => { if (!controller.signal.aborted) setError(problem(cause)); });
    return () => controller.abort();
  }, [filter, reload]);

  const items = useMemo(() => error ? [] : data?.items ?? [], [data, error]);
  const selected = items.find(item => item.auditLogId === selectedId) ?? items[0];
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const failed = items.filter(item => item.resultStatus && item.resultStatus !== 'SUCCESS').length;
  const choose = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(1); };

  function exportCsv() {
    const header = 'time,action,entity_type,entity_id,actor,role,result,reason';
    const rows = items.map(e => [e.createdAt, e.action, e.entityType, e.entityId ?? '', e.userName ?? 'System', e.userRole ?? '', e.resultStatus ?? '', e.reason ?? ''].map(csv).join(','));
    download(`audit-logs-page-${data?.page ?? 1}.csv`, [header, ...rows].join('\n'), 'text/csv');
  }
  function clear() {
    setSearch(''); setAppliedSearch(''); setUserId('all'); setAction('all'); setEntityType('all'); setResult('all'); setRange('7d'); setPage(1);
  }

  return (
    <AdminLayout title="Audit logs" subtitle="Who changed what, when and why — recorded by the backend, read-only here"
      actions={<Button onClick={exportCsv} disabled={items.length === 0} style={{ height: 36 }}>Export page CSV</Button>}>
      <div className={s.page}>
        <div className={s.stats}>
          <StatCard label="EVENTS IN RANGE" value={data && !error ? data.totalCount.toLocaleString('en-GB') : '—'} note={ranges.find(r => r.value === range)?.label ?? ''} tone="primary" />
          <StatCard label="NOT SUCCESSFUL" value={data && !error ? String(failed) : '—'} note="On this page" tone="danger" />
          <StatCard label="ACTION TYPES" value={facets ? String(facets.actions.length) : '—'} note="Recorded so far" tone="warning" />
          <StatCard label="ACTORS" value={facets ? String(facets.actors.length) : '—'} note="Users with recorded actions" tone="success" />
        </div>

        <form className={s.filters} onSubmit={event => { event.preventDefault(); setAppliedSearch(search); setPage(1); }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search action, entity, reason or user · Enter" width={300} height={34} />
          <div style={{ width: 170 }}><Select ariaLabel="Actor" value={userId} onChange={choose(setUserId)} chevron="chevron-down-small" chevronSize={13} height={34}
            options={[{ value: 'all', label: 'All actors' }, ...(facets?.actors ?? []).map(a => ({ value: a.userId, label: `${a.fullName}${a.role ? ` · ${a.role}` : ''}` }))]} /></div>
          <div style={{ width: 200 }}><Select ariaLabel="Action" value={action} onChange={choose(setAction)} chevron="chevron-down-small" chevronSize={13} height={34}
            options={[{ value: 'all', label: 'All actions' }, ...(facets?.actions ?? []).map(a => ({ value: a, label: actionLabel(a) }))]} /></div>
          <div style={{ width: 160 }}><Select ariaLabel="Entity type" value={entityType} onChange={choose(setEntityType)} chevron="chevron-down-small" chevronSize={13} height={34}
            options={[{ value: 'all', label: 'All entities' }, ...(facets?.entityTypes ?? []).map(t => ({ value: t, label: t }))]} /></div>
          <div style={{ width: 130 }}><Select ariaLabel="Result" value={result} onChange={choose(setResult)} chevron="chevron-down-small" chevronSize={13} height={34}
            options={[{ value: 'all', label: 'All results' }, ...(facets?.results ?? []).map(r => ({ value: r, label: r }))]} /></div>
          <div style={{ width: 140 }}><Select ariaLabel="Period" value={range} onChange={choose(setRange)} chevron="chevron-down-small" chevronSize={13} height={34} options={ranges} /></div>
          <Button variant="secondary" onClick={clear} style={{ height: 36, color: 'var(--color-text-muted)', width: 110 }}>Clear filters</Button>
        </form>

        {error && <p className={s.empty} role="alert">{error} <Button variant="secondary" onClick={() => setReload(n => n + 1)}>Retry</Button></p>}
        <div className={s.split}>
          <div className={s.box} style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            <div className={s.headRow}><Overline>AUDIT EVENTS</Overline>
              <span>{data && !error ? `Page ${data.page} of ${pages} · ${data.totalCount.toLocaleString('en-GB')} events · ${TIME_ZONE}` : 'Loading…'}</span></div>
            <div className={s.divider} />
            <div className={s.list} role="table" aria-label="Audit events">
              {items.map(e => (
                <button key={e.auditLogId} role="row" className={`${s.auditRow} ${e.auditLogId === selected?.auditLogId ? s.auditSelected : ''}`} onClick={() => setSelectedId(e.auditLogId)}>
                  <span className={s.time}>{time(e.createdAt)}</span>
                  <span><p className={s.evTitle}>{actionLabel(e.action)}</p><p className={s.evSub}>{e.entityType} · {shortId(e.entityId)}</p></span>
                  <span className={s.actor}>{e.userName ?? 'System'}</span>
                  <Badge tone={resultTone(e.resultStatus)} width={84}>{e.resultStatus ?? '—'}</Badge>
                  <span className={s.source}>{e.userRole ?? 'SYSTEM'}</span>
                </button>
              ))}
              {data && !error && items.length === 0 && <p className={s.empty}>No audit events match these filters.</p>}
            </div>
            {data && !error && pages > 1 && <div className={s.headRow}>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>}
          </div>
          {selected && <Details e={selected} />}
        </div>
      </div>
    </AdminLayout>
  );
}

function Details({ e }: { e: AuditLogEntry }) {
  const rows = changes(e);
  return (
    <div className={`${s.box} ${s.details}`} aria-label="Event details">
      <div className={s.headRow}><Overline>EVENT DETAILS</Overline><Badge tone={resultTone(e.resultStatus)} width={76}>{e.resultStatus ?? '—'}</Badge></div>
      <p style={{ fontSize: 18, fontWeight: 600 }}>{actionLabel(e.action)}</p>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{e.action}</p>
      <div className={s.divider} />
      {[
        ['TIMESTAMP', stamp(e.createdAt)],
        ['ACTOR', e.userName ? `${e.userName}${e.userRole ? ` · ${e.userRole}` : ''}${e.userEmail ? ` · ${e.userEmail}` : ''}` : 'System'],
        ['ENTITY', `${e.entityType}${e.entityId ? ` · ${e.entityId}` : ''}`],
        ['REASON', e.reason ? reasonLabels[e.reason] ?? e.reason : '—'],
        ['IP ADDRESS', e.ipAddress ?? '—'],
        ['AUDIT ID', e.auditLogId],
      ].map(([k, v]) => <div key={k} className={s.kv}><p>{k}</p><p>{v}</p></div>)}
      {rows.length > 0 && (
        <div className={s.change}>
          <p style={{ fontSize: 8, fontWeight: 600, color: 'var(--color-text-dim)' }}>RECORDED CHANGE</p>
          {rows.map(row => <div key={row.field} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', minWidth: 90 }}>{row.field}</span>
            <Badge tone="warning">{row.from}</Badge>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>→</span>
            <Badge tone="success">{row.to}</Badge>
          </div>)}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button className={s.outlineBtn} onClick={() => download(`audit-${e.auditLogId}.json`, JSON.stringify(e, null, 2), 'application/json')}>Export event JSON</button>
    </div>
  );
}

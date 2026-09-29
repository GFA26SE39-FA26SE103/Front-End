import { useMemo, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { Badge, Button, Overline, SearchBox, Select, StatCard } from '../components/ui';
import { auditEvents, type AuditEvent } from '../data/mockOps';
import s from './Monitoring.module.css';

const resultTone = { SUCCESS: 'success', WARNING: 'warning', FAILED: 'danger' } as const;
const changeTone = (v: string) => (/CLOSED|OPERATOR|60/.test(v) ? 'success' : 'warning');

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLog() {
  const [query, setQuery] = useState('');
  const [headerQuery, setHeaderQuery] = useState('');
  const [actor, setActor] = useState('all');
  const [type, setType] = useState('all');
  const [range, setRange] = useState('24h');
  const [selectedId, setSelectedId] = useState(auditEvents[0].id);

  const actors = useMemo(() => Array.from(new Set(auditEvents.map((e) => e.actor))), []);
  const visible = useMemo(() => {
    const q = `${query} ${headerQuery}`.trim().toLowerCase();
    return auditEvents.filter(
      (e) =>
        (actor === 'all' || e.actor === actor) &&
        (type === 'all' || e.type === type) &&
        (!q || [e.title, e.target, e.actor, e.source].some((f) => f.toLowerCase().includes(q))),
    );
  }, [query, headerQuery, actor, type]);

  const selected = auditEvents.find((e) => e.id === selectedId);

  function exportCsv() {
    const header = 'time,event,target,actor,result,source';
    const rows = visible.map((e) => [e.time, e.title, e.target, e.actor, e.result, e.source].map((v) => `"${v.replace(/"/g, '""')}"`).join(','));
    download('audit-logs.csv', [header, ...rows].join('\n'), 'text/csv');
  }

  function clear() {
    setQuery('');
    setHeaderQuery('');
    setActor('all');
    setType('all');
    setRange('24h');
  }

  return (
    <AdminLayout
      title="Audit logs"
      subtitle="System activity, security events and configuration changes"
      actions={
        <>
          <SearchBox value={headerQuery} onChange={setHeaderQuery} placeholder="Search audit logs" width={210} height={34} iconName="header-search" iconSize={14} />
          <Button onClick={exportCsv} style={{ height: 36 }}>Export CSV</Button>
        </>
      }
    >
      <div className={s.page}>
        <div className={s.stats}>
          <StatCard label="EVENTS TODAY" value="1,284" note="+8.2% vs yesterday" tone="primary" />
          <StatCard label="CRITICAL ACTIONS" value="12" note="4 manual overrides" tone="warning" />
          <StatCard label="FAILED ATTEMPTS" value="7" note="3 require review" tone="danger" />
          <StatCard label="RETENTION" value="90 days" note="Immutable event history" tone="success" />
        </div>

        <div className={s.filters}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search actor, action or target" width={324} height={34} />
          <div style={{ width: 170 }}><Select value={actor} onChange={setActor} chevron="chevron-down-small" chevronSize={13} height={34} options={[{ value: 'all', label: 'All actors' }, ...actors.map((a) => ({ value: a, label: a }))]} /></div>
          <div style={{ width: 190 }}><Select value={type} onChange={setType} chevron="chevron-down-small" chevronSize={13} height={34} options={[{ value: 'all', label: 'All event types' }, ...['Incident', 'Task', 'Configuration', 'Security'].map((t) => ({ value: t, label: t }))]} /></div>
          <div style={{ width: 160 }}><Select value={range} onChange={setRange} chevron="chevron-down-small" chevronSize={13} height={34} options={[{ value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }]} /></div>
          <Button variant="secondary" onClick={clear} style={{ height: 36, color: 'var(--color-text-muted)', width: 118 }}>Clear filters</Button>
        </div>

        <div className={s.split}>
          <div className={s.box} style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            <div className={s.headRow}><Overline>AUDIT EVENTS</Overline><span>Showing {visible.length} of 1,284 events</span></div>
            <div className={s.divider} />
            <div className={s.list} role="table">
              {visible.map((e) => (
                <button key={e.id} role="row" className={`${s.auditRow} ${e.id === selectedId ? s.auditSelected : ''}`} onClick={() => setSelectedId(e.id)}>
                  <span className={s.time}>{e.time}</span>
                  <span><p className={s.evTitle}>{e.title}</p><p className={s.evSub}>{e.target}</p></span>
                  <span className={s.actor}>{e.actor}</span>
                  <Badge tone={resultTone[e.result]} width={84}>{e.result}</Badge>
                  <span className={s.source}>{e.source}</span>
                </button>
              ))}
              {visible.length === 0 && <p className={s.empty}>No events match these filters.</p>}
            </div>
          </div>

          {selected && <Details e={selected} />}
        </div>
      </div>
    </AdminLayout>
  );
}

function Details({ e }: { e: AuditEvent }) {
  return (
    <div className={`${s.box} ${s.details}`}>
      <div className={s.headRow}><Overline>EVENT DETAILS</Overline><Badge tone={resultTone[e.result]} width={76}>{e.result}</Badge></div>
      <p style={{ fontSize: 18, fontWeight: 600 }}>{e.title}</p>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{e.summary}</p>
      <div className={s.divider} />
      {[
        ['TIMESTAMP', `${e.date} · ${e.time}`],
        ['ACTOR', `${e.actor} · ${e.actorId}`],
        ['TARGET', e.target.split(' · ')[0]],
        ['SOURCE', `${e.source}${e.ip !== '—' ? ` · ${e.ip}` : ''}`],
        ['SESSION', `SES-${e.id.replace('EV-', '73A1F')}`],
        ['CORRELATION ID', `COR-${e.target.split(' ')[0].replace(/[^A-Z0-9]/gi, '')}-0${e.id.slice(-1)}`],
      ].map(([k, v]) => (
        <div key={k} className={s.kv}><p>{k}</p><p>{v}</p></div>
      ))}
      {e.change && (
        <div className={s.change}>
          <p style={{ fontSize: 8, fontWeight: 600, color: 'var(--color-text-dim)' }}>RECORDED CHANGE</p>
          <p style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{e.change.field}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge tone="warning">{e.change.from}</Badge>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>→</span>
            <Badge tone={changeTone(e.change.to)}>{e.change.to}</Badge>
          </div>
          <p style={{ fontSize: 9, fontWeight: 500 }}>{e.change.note}</p>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button className={s.outlineBtn} onClick={() => download(`${e.id}.json`, JSON.stringify(e, null, 2), 'application/json')}>Export event JSON</button>
    </div>
  );
}

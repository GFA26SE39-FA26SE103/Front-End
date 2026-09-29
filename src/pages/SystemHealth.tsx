import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { Badge, Button, Overline, StatCard } from '../components/ui';
import { cameras } from '../data/mock';
import { perfCharts, pipeline, services } from '../data/mockOps';
import s from './Monitoring.module.css';

const now = () => new Date().toLocaleTimeString('en-GB');
const statusTone = { HEALTHY: 'success', DEGRADED: 'warning', DOWN: 'danger' } as const;

export default function SystemHealth() {
  const [updated, setUpdated] = useState(now);
  const [refreshing, setRefreshing] = useState(false);
  const [runbook, setRunbook] = useState(false);
  const [responseNote, setResponseNote] = useState(false);

  const online = cameras.filter((c) => c.status === 'Online').length;
  const degraded = cameras.filter((c) => c.status === 'Degraded');
  const offline = cameras.filter((c) => c.status === 'Offline');
  const issues = services.filter((x) => x.status !== 'HEALTHY').length;

  function refresh() {
    setRefreshing(true);
    // TODO: GET /system/health
    window.setTimeout(() => { setUpdated(now()); setRefreshing(false); }, 600);
  }

  return (
    <AdminLayout
      title="System health"
      subtitle="Real-time infrastructure, processing and delivery health"
      actions={
        <>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)' }}>Updated {updated}</span>
          <Button onClick={refresh} disabled={refreshing} style={{ height: 36, width: 86 }}>{refreshing ? '…' : 'Refresh'}</Button>
        </>
      }
    >
      <div className={s.page}>
        <div className={s.stats}>
          <StatCard label="OVERALL STATUS" value={issues ? 'Degraded' : 'Healthy'} note={`${issues} active issues`} tone={issues ? 'warning' : 'success'} />
          <StatCard label="CAMERAS" value={`${online} / ${cameras.length}`} note={`${degraded.length} degraded · ${offline.length} offline`} tone={online === cameras.length ? 'success' : 'warning'} />
          <StatCard label="AI PROCESSING" value="97.8%" note="142 ms median latency" tone="success" />
          <StatCard label="MOBILE SYNC" value="99.2%" note="12 items queued" tone="success" />
        </div>

        {issues > 0 && (
          <div className={s.banner} role="status">
            <i />
            <div style={{ flex: 1 }}>
              <p className={s.bannerTitle}>Service degradation detected</p>
              <p className={s.bannerText}>{degraded.map((c) => c.code).join(', ') || 'Camera'} latency and notification delivery failures may delay incident dispatch.</p>
            </div>
            <button className={s.warnBtn} onClick={() => setRunbook((v) => !v)} aria-expanded={runbook}>{runbook ? 'Hide runbook' : 'View runbook'}</button>
          </div>
        )}
        {runbook && (
          <ol className={s.runbook}>
            <li>Open Cameras and run “Test stream” on the degraded camera.</li>
            <li>If latency stays above the threshold in AI Config, restart the camera or its switch port.</li>
            <li>For notification failures, check the push provider status; staff still see tasks in the app.</li>
            <li>Record what was done in the camera maintenance log.</li>
          </ol>
        )}

        <div className={s.split}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={s.box} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className={s.headRow}><Overline>SERVICE STATUS</Overline><span>{services.length} monitored services</span></div>
              <div className={s.divider} />
              {services.map((x) => (
                <div key={x.name} className={s.service}>
                  <i className={s.dot} style={{ background: `var(--color-${statusTone[x.status]})` }} />
                  <div>
                    <p className={s.svcName}>{x.name}</p>
                    <p className={s.svcDetail}>{x.name === 'Camera ingestion' ? `${cameras.length} configured cameras` : x.detail}</p>
                  </div>
                  <p className={s.metric}>{x.name === 'Camera ingestion' ? `${online} online · ${cameras.length - online} affected` : x.metric}</p>
                  <Badge tone={statusTone[x.status]} width={112}>{x.status}</Badge>
                </div>
              ))}
            </div>
            <div className={s.box} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Overline>PERFORMANCE · LAST 60 MINUTES</Overline>
              <div className={s.charts}>
                {perfCharts.map((c) => (
                  <div key={c.label} className={s.chart}>
                    <p style={{ fontSize: 8, fontWeight: 600, color: 'var(--color-text-dim)' }}>{c.label}</p>
                    <p className={s.chartValue}>{c.value}<span>{c.unit}</span></p>
                    <div className={s.bars} role="img" aria-label={`${c.label} over the last 60 minutes`}>
                      {c.bars.map((h, i) => <i key={i} style={{ height: h, background: `color-mix(in srgb, var(--color-${c.tone}) 78%, transparent)` }} />)}
                    </div>
                    <p style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Last 60 minutes</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ width: 386, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={s.box} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
              <div className={s.headRow}><Overline>ACTIVE ALERTS</Overline><Badge tone="danger" width={66}>2 OPEN</Badge></div>
              <div className={s.alertCard} style={{ background: 'var(--color-danger-tint)' }}>
                <p className={s.alertHead}>{degraded[0]?.code ?? 'CAM-03'} ingestion latency<Badge tone="danger" width={72}>HIGH</Badge></p>
                <p style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Video latency is 2.8s above threshold.</p>
                <p style={{ fontSize: 8, fontWeight: 500, color: 'var(--color-danger)' }}>Open for 6 min</p>
              </div>
              <div className={s.alertCard} style={{ background: 'var(--color-warning-tint)' }}>
                <p className={s.alertHead}>Notification delivery degraded<Badge tone="warning" width={72}>MEDIUM</Badge></p>
                <p style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Push delivery failures reached 4.2%.</p>
                <p style={{ fontSize: 8, fontWeight: 500, color: 'var(--color-warning)' }}>Open for 11 min</p>
              </div>
              <button className={s.outlineBtn} onClick={() => setResponseNote(true)}>Open incident response</button>
              {responseNote && <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Incident response runs in the Operator console (main flow 2), which is not built yet.</p>}
            </div>
            <div className={s.box} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '14px 16px', flex: 1 }}>
              <Overline>INCIDENT PIPELINE</Overline>
              <p style={{ fontSize: 13, fontWeight: 600 }}>End-to-end health</p>
              {pipeline.map((p) => (
                <div key={p.step} className={s.pipeStep}>
                  <i style={{ background: `var(--color-${p.ok ? 'success' : 'warning'})` }} />
                  <span>{p.step}</span>
                  <span style={{ color: `var(--color-${p.ok ? 'success' : 'warning'})` }}>{p.ok ? 'Healthy' : 'Degraded'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

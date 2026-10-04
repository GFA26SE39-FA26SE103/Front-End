import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { Button, Chip, type Tone } from '../components/ui';
import { getSetupOverview, type SetupZone, type SetupOverview } from '../api/setup';
import s from './SetupHealth.module.css';

const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'No frame received yet';
const layoutLink = (floorId: string, cameraId?: string) => '/admin/store-layout?floorId=' + encodeURIComponent(floorId) + (cameraId ? '&cameraId=' + encodeURIComponent(cameraId) : '');
const aiLink = (zoneId: string) => '/admin/ai-config?zoneId=' + encodeURIComponent(zoneId);
const tone = (status: string): Tone => status === 'ACTIVE' || status === 'ONLINE' || status === 'READY' || status === 'AVAILABLE' ? 'success' : status === 'DRAFT' || status === 'DEGRADED' || status === 'UNKNOWN' ? 'warning' : status === 'OFFLINE' || status === 'NOT_READY' || status === 'UNAVAILABLE' ? 'danger' : 'neutral';
const stepLinks: Record<string, string> = { 'floor-zones': '/admin/store-layout', 'camera-source': '/admin/cameras', 'test-enable': '/admin/cameras', 'mapping-roi': '/admin/store-layout', rules: '/admin/ai-config', activation: '/admin/ai-config' };

export default function SetupHealth() {
  const [data, setData] = useState<SetupOverview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [floorId, setFloorId] = useState('');
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setRefreshing(true);
      try {
        const saved = await getSetupOverview(signal);
        if (disposed || signal.aborted) return;
        setData(saved); setError('');
        setFloorId(current => saved.floors.some(f => f.floorId === current) ? current : '');
      } catch (e) {
        if (!disposed && !signal.aborted) setError(e instanceof Error ? e.message : 'Could not load setup status.');
      } finally { if (!disposed && !signal.aborted) setRefreshing(false); }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); };
  }, [refreshKey]);
  const normalized = query.trim().toLowerCase();
  const match = (value: string) => value.toLowerCase().includes(normalized);
  const floors = data?.floors.filter(f => !floorId || f.floorId === floorId) ?? [];
  const zones = floors.flatMap(f => f.zones.filter(z => (!attentionOnly || !z.setupReady) && (!normalized || match(z.code + ' ' + z.name + ' ' + (z.configuration?.name ?? '') + ' ' + f.name))).map(zone => ({ floor: f, zone })));
  return <AdminLayout title="MF-01 setup overview" subtitle="Configuration progress for floors, zones, sources and monitoring rules"
    actions={<><span className={s.updated}>{data ? 'Fetched ' + time(data.generatedAt) : 'Loading setup status'}</span><Button variant="secondary" disabled={refreshing} onClick={() => setRefreshKey(k => k + 1)}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button></>}>
    <div className={s.page}>
      {error && <div className={s.alert} role="alert">{error}{data && <p>Showing the last successful snapshot. Status may have changed.</p>}<Button variant="secondary" disabled={refreshing} onClick={() => setRefreshKey(k => k + 1)}>Retry loading setup</Button></div>}
      {!data && refreshing && <p role="status">Loading floors, zones and configurations…</p>}
      {data && <>
        {!data.hasDefaultStore && <div className={s.alert} role="alert">The default store seed is missing. Ask the backend team to restore the default store before setting up floors.</div>}
        <div className={s.stats}>
          <Stat label="Floor & zone structure" value={data.totals.floorCount + ' floors · ' + data.totals.zoneCount + ' zones'} note="Saved layout in the default store" />
          <Stat label="Configuration activation" value={data.totals.activeConfigurationCount + ' / ' + data.totals.zoneCount} note={data.totals.readyToActivateCount + ' ready for review · ' + data.totals.configuredZoneCount + ' configured'} />
          <Stat label="Camera setup" value={(data.steps.find(step => step.code === 'test-enable')?.completed ?? 0) + ' / ' + data.totals.cameraCount} note="Valid, tested and enabled camera sources" />
          <Stat label="System health" value="View health" note="Runtime camera status and alerts are on System Health" />
        </div>
        <section className={s.panel}>
          <div className={s.head}><div><h2>Setup progress</h2><p>Counts reflect saved data. Configure each zone independently.</p></div><Link className={s.linkButton} to="/admin/users">Manage accounts</Link></div>
          <div className={s.steps}>{data.steps.map(step => {
            const complete = step.total > 0 && step.completed === step.total;
            return <Link key={step.code} to={stepLinks[step.code] ?? '/admin/ai-config'} className={s.step}>
              <div className={s.head}><strong>{step.name}</strong><Chip tone={complete ? 'success' : step.completed ? 'warning' : 'neutral'}>{step.completed} / {step.total}</Chip></div>
              <p>{step.description}</p><span className={s.open}>Open setup →</span>
            </Link>;
          })}</div>
          <p className={s.scope}>ACTIVE means the MF-01 configuration is activated. Continuous AI rule evaluation and incident dispatch belong to MF-02.</p>
        </section>
        <div className={s.filters}>
          <label>Floor<select aria-label="Filter dashboard by floor" value={floorId} onChange={e => setFloorId(e.target.value)}><option value="">All floors</option>{data.floors.map(f => <option key={f.floorId} value={f.floorId}>Floor {f.floorNumber} · {f.name}</option>)}</select></label>
          <label className={s.search}>Search<input aria-label="Search zones" value={query} onChange={e => setQuery(e.target.value)} placeholder="Zone or configuration" /></label>
          <label className={s.check}><input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)} />Needs attention only</label>
        </div>
        <section className={s.panel}>
          <div className={s.head}><div><h2>Zone configurations</h2><p>View saved rules, missing requirements and configuration status.</p></div><Link className={s.linkButton} to="/admin/ai-config">Open AI Config</Link></div>
          {!data.floors.length ? <p className={s.empty}>No floors yet. <Link to="/admin/store-layout">Open Store layout</Link> to begin floor and zone setup.</p> : !zones.length ? <p className={s.empty}>No zones match these filters.{!data.totals.zoneCount && <> <Link to="/admin/store-layout">Add zones in Store layout</Link>.</>}</p> :
            <div className={s.tableWrap}><table aria-label="Zone configurations"><thead><tr><th>Floor / Zone</th><th>Configuration</th><th>Activation</th><th>Readiness</th><th>Actions</th></tr></thead><tbody>
              {zones.map(({ floor, zone }) => <tr key={zone.zoneId}>
                <td><span className={s.muted}>Floor {floor.floorNumber} · {floor.name}</span><strong>{zone.name}</strong><span className={s.muted}>{zone.code} · Zone {zone.status}</span></td>
                <td><strong>{zone.configuration?.name ?? 'Not configured'}</strong><span className={s.muted}>{zone.configuration ? zone.configuration.ruleCount + ' rules · ' + zone.configuration.enabledRuleCount + ' enabled' : 'No saved incident rules'}</span></td>
                <td><Chip tone={tone(zone.configuration?.status ?? '')}>{zone.configuration?.status ?? 'NOT CONFIGURED'}</Chip></td>
                <td><strong className={zone.setupReady ? s.ready : s.needs}>{zone.setupReady ? (zone.canActivate ? 'Ready for review' : 'Setup valid') : 'Needs setup'}</strong><Requirements zone={zone} /></td>
                <td><div className={s.rowActions}><Link className={s.linkButton} to={aiLink(zone.zoneId)}>{zone.canActivate ? 'Review configuration' : zone.configuration ? 'View configuration' : 'Configure zone'}</Link><Link to={layoutLink(floor.floorId, zone.cameras[0]?.cameraId)}>Layout & ROI</Link></div></td>
              </tr>)}
            </tbody></table></div>}
          {floors.filter(f => !f.hasMap || !f.zones.length).map(f => <p className={s.layoutIssue} key={f.floorId}>Floor {f.floorNumber} · {f.name}: {!f.hasMap ? 'floor map missing' : 'map saved'}{!f.zones.length ? ' · no zones' : ''}. <Link to={layoutLink(f.floorId)}>Complete layout</Link></p>)}
        </section>
      </>}
    </div>
  </AdminLayout>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <section className={s.stat} aria-label={label}><p>{label}</p><strong>{value}</strong><span>{note}</span></section>;
}
function Requirements({ zone }: { zone: SetupZone }) {
  const cameraIssues = zone.setupReady ? [] : zone.cameras.flatMap(c => c.issues.map(i => ({ code: c.cameraId + i.code, message: c.code + ': ' + i.message })));
  const issues = [...zone.issues, ...cameraIssues];
  return <>{issues.length > 0 && <details className={s.requirements}><summary>{issues.length} missing {issues.length === 1 ? 'requirement' : 'requirements'}</summary><ul>{issues.map((i, n) => <li key={i.code + n}>{i.message}</li>)}</ul></details>}
    {!!zone.warnings.length && <details className={s.requirements}><summary>Setup notes</summary><ul>{zone.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}</>;
}


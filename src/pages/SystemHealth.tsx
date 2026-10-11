import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkCameraHealth, getSetupOverview, type SetupCamera, type SetupOverview } from '../api/setup';
import { AdminLayout } from '../components/AdminLayout';
import { Button, Chip, type Tone } from '../components/ui';
import s from './SetupHealth.module.css';

const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'No frame received yet';
const cameraLink = (cameraId: string) => '/admin/cameras?cameraId=' + encodeURIComponent(cameraId);
const tone = (status: string): Tone => status === 'ONLINE' || status === 'READY' || status === 'AVAILABLE'
  ? 'success' : status === 'UNKNOWN' ? 'warning' : status === 'OFFLINE' || status === 'NOT_READY' || status === 'UNAVAILABLE' ? 'danger' : 'neutral';
const healthIssueLabels: Record<string, string> = {
  STREAM_UNAVAILABLE: 'Camera stream unavailable', CAMERA_VIEW_BLOCKED: 'Camera view blocked', CAMERA_VIEW_BLURRED: 'Camera view blurred',
  CAMERA_VIEW_FROZEN: 'Camera view frozen', CAMERA_FRAME_INVALID: 'Camera frame invalid',
};
const healthIssueLabel = (eventType: string) => healthIssueLabels[eventType] ?? eventType.replaceAll('_', ' ').toLowerCase();

export default function SystemHealth() {
  const [data, setData] = useState<SetupOverview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState<string | null>(null);
  const actionController = useRef<AbortController | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    const refresh = async () => {
      controller?.abort(); controller = new AbortController(); const signal = controller.signal; setRefreshing(true);
      try {
        const saved = await getSetupOverview(signal);
        if (disposed || signal.aborted) return;
        setData(saved); setError('');
      } catch (e) {
        if (!disposed && !signal.aborted) setError(e instanceof Error ? e.message : 'Could not load system health.');
      } finally { if (!disposed && !signal.aborted) setRefreshing(false); }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); };
  }, [refreshKey]);
  useEffect(() => () => actionController.current?.abort(), []);

  async function check(camera: SetupCamera) {
    const controller = new AbortController(); actionController.current = controller;
    setChecking(camera.cameraId); setActionError(''); setNotice('');
    try {
      await checkCameraHealth(camera.cameraId, controller.signal);
      if (controller.signal.aborted) return;
      setNotice('Health check completed for ' + camera.code + '.'); setRefreshKey(key => key + 1);
    } catch (e) {
      if (!controller.signal.aborted) setActionError(e instanceof Error ? e.message : 'Health check failed.');
    } finally { if (!controller.signal.aborted) setChecking(null); }
  }

  const cameras = data?.cameras ?? [];
  const enabled = cameras.filter(camera => camera.status === 'ACTIVE' && camera.isEnabled && camera.connectionValid);
  const ready = enabled.filter(camera => camera.monitoringReadiness === 'READY').length;
  const overall = !cameras.length ? 'Not configured' : data && data.totals.unresolvedHealthEventCount === 0 && enabled.length > 0 && ready === enabled.length ? 'Healthy' : 'Needs attention';

  return <AdminLayout title="System health" subtitle="Live camera connectivity, visual usability and monitoring readiness"
    actions={<><span className={s.updated}>{data ? 'Fetched ' + time(data.generatedAt) : 'Loading system health'}</span><Button variant="secondary" disabled={refreshing || checking !== null} onClick={() => setRefreshKey(key => key + 1)}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button></>}>
    <div className={s.page}>
      {error && <div className={s.alert} role="alert">{error}{data && <p>Showing the last successful snapshot. Status may have changed.</p>}<Button variant="secondary" disabled={refreshing} onClick={() => setRefreshKey(key => key + 1)}>Retry loading health</Button></div>}
      {!data && refreshing && <p role="status">Loading camera and processing health…</p>}
      {data && <>
        <div className={s.stats}>
          <Stat label="Overall status" value={overall} note={data.totals.unresolvedHealthEventCount + ' unresolved camera alerts'} />
          <Stat label="Camera connectivity" value={data.totals.onlineCameraCount + ' / ' + enabled.length + ' online'} note={data.totals.cameraCount + ' registered · valid enabled live or recorded sources'} />
          <Stat label="Monitoring readiness" value={ready + ' / ' + enabled.length + ' ready'} note="Connectivity, visual health and processing must all be available" />
          <Stat label="Active health alerts" value={String(data.totals.unresolvedHealthEventCount)} note="Open or investigating camera-health events" />
        </div>

        <section className={s.panel}>
          <div className={s.head}><div><h2>Camera health</h2><p>Checks receive a real frame from the configured source. Monitoring activation remains separate from runtime health.</p></div><Link className={s.linkButton} to="/admin/cameras">Manage cameras</Link></div>
          {actionError && <p className={s.alert} role="alert">{actionError}</p>}
          {notice && <p className={s.ready} role="status">{notice}</p>}
          {!cameras.length ? <p className={s.empty}>No cameras registered yet. <Link to="/admin/cameras">Add and configure a camera</Link>.</p> :
            <div className={s.tableWrap}><table aria-label="Camera health"><thead><tr><th>Camera</th><th>Source</th><th>Connection</th><th>Monitoring</th><th>Last frame received</th><th>Needs attention</th><th>Actions</th></tr></thead><tbody>
              {cameras.map(camera => <tr key={camera.cameraId}>
                <td><strong>{camera.code}</strong><span>{camera.name}</span><span className={s.muted}>{camera.floorName} · {camera.status}</span></td>
                <td><span>{camera.sourceType ? camera.sourceType + ' / ' + camera.protocol : 'Not configured'}</span><Chip tone={camera.connectionValid ? 'primary' : 'danger'}>{camera.connectionValid ? (camera.isEnabled ? 'Enabled' : 'Disabled') : 'Unsupported'}</Chip><span className={s.muted}>Test: {camera.lastTestResult ?? 'Not tested'}</span></td>
                <td><Chip tone={camera.isEnabled && camera.connectionValid && camera.status === 'ACTIVE' ? tone(camera.healthStatus) : 'neutral'}>{camera.healthStatus}</Chip>{(!camera.isEnabled || !camera.connectionValid || camera.status !== 'ACTIVE') && <span className={s.muted}>Health checks paused</span>}</td>
                <td><Chip tone={camera.isEnabled && camera.connectionValid && camera.status === 'ACTIVE' ? tone(camera.monitoringReadiness) : 'neutral'}>{camera.monitoringReadiness}</Chip><span className={s.muted}>Processing: {camera.processingAvailability}</span></td>
                <td>{time(camera.lastSeenAt)}</td>
                <td>{camera.issues.length ? <ul className={s.issues}>{camera.issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul> : <span className={s.muted}>No current issues</span>}</td>
                <td><div className={s.rowActions}><Link className={s.linkButton} to={cameraLink(camera.cameraId)}>Manage {camera.code}</Link><Button variant="secondary" disabled={!camera.isEnabled || !camera.connectionValid || camera.status !== 'ACTIVE' || checking !== null} onClick={() => void check(camera)}>{checking === camera.cameraId ? 'Checking…' : 'Check health'}</Button></div></td>
              </tr>)}
            </tbody></table></div>}
          {!!data.healthEvents.length && <div className={s.events}><h3>Unresolved camera health alerts</h3>{data.healthEvents.map(event => <div key={event.healthEventId}><strong>{event.cameraCode}</strong><Chip tone={event.status === 'OPEN' ? 'danger' : 'warning'}>{event.status}</Chip><span>{healthIssueLabel(event.eventType)} · {time(event.detectedAt)}</span><Link to={cameraLink(event.cameraId)}>Investigate camera →</Link></div>)}</div>}
          <p className={s.scope}>Missing frames are unavailable measurements, never a numeric zero. Camera failures do not deactivate monitoring configurations or transfer measurements to another camera.</p>
        </section>
      </>}
    </div>
  </AdminLayout>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <section className={s.stat} aria-label={label}><p>{label}</p><strong>{value}</strong><span>{note}</span></section>;
}

import { Chip, Overline } from '../../components/ui';
import type { CameraMonitoringState } from './useCameraMonitoring';
import s from './OperatorCameraLive.module.css';

const reasons: Record<string, string> = {
  MONITORING_STOP_PENDING: 'Monitoring owner is stopping. Wait for STOPPED before reactivating to replay.',
  NO_ACTIVE_CONFIGURATION: 'No active monitoring configuration.', SUSTAIN_PENDING: 'Waiting for sustain above threshold.',
  BELOW_THRESHOLD: 'Below threshold.', QUEUE_DWELL_PENDING: 'Waiting for 5s continuous dwell in queue ROI, before sustain.',
  COOLDOWN: 'Cooldown after incident closure.', RULE_RUNTIME_UNSUPPORTED: 'This rule measurement is not supported yet.',
  MEASUREMENT_SOURCE_AMBIGUOUS: 'Zone has multiple active cameras. Select one active measurement mapping in Store layout.',
  MONITORING_SCHEMA_NOT_READY: 'Apply the monitoring-runtime database script, then restart the backend.',
};
const reasonLabel = (code: string) => reasons[code] ?? code.replaceAll('_', ' ');
const count = (value: number | null) => value === null ? '—' : value;
const seconds = (value: number) => (value / 1000).toFixed(1).replace(/\.0$/, '');
export function CameraMonitoringPanel({ state }: { state: CameraMonitoringState }) {
  const { runtime, feed, runtimeError, feedError, loading } = state;
  return <section className={s.monitoring} aria-label="Monitoring and incidents">
    <Overline>AI MONITORING</Overline>
    {loading && <p role="status">Loading monitoring…</p>}
    {runtimeError && <p role="alert">{runtimeError}{runtime ? ' · Last runtime data is stale.' : ''}</p>}
    {runtime && <>
      <div className={s.zoneRow}><Chip tone={runtime.state === 'ERROR' ? 'danger' : runtime.state === 'RUNNING' ? 'success' : 'neutral'}>{runtime.state}</Chip>{runtime.videoSourceType === 'RECORDED' && <Chip tone="warning">DEMO · recorded</Chip>}</div>
      <p>{reasonLabel(runtime.errorCode ?? runtime.reason)}</p>
      {runtime.isStale && <p role="status">Last observed measurements are stale, not current.</p>}
      {runtime.state === 'COMPLETED' && <p>Video completed. Deactivate → Activate configuration to replay monitoring.</p>}
      {runtime.annotationContext && <p className={s.muted}>Boxes: {runtime.annotationContext}. Counts use each zone's own confidence; not every box belongs to every ROI.</p>}
      {runtime.sourceElapsedMs !== null && <p className={s.muted}>Source time: {seconds(runtime.sourceElapsedMs)}s · Last observation: {runtime.observedAt ? new Date(runtime.observedAt).toLocaleString() : '—'}</p>}
      {runtime.zones.map(zone => <article key={zone.zoneId} className={s.incident}>
        <div className={s.zoneRow}><strong>{zone.zoneName}</strong><Chip tone={zone.configurationStatus === 'ACTIVE' ? 'success' : 'neutral'}>{zone.configurationStatus}</Chip></div>
        <p className={s.muted}>Confidence: {zone.confidence} · Version: {zone.configVersion ? new Date(zone.configVersion).toLocaleString() : '—'}</p>
        {zone.issueCode && <p>{reasonLabel(zone.issueCode)}</p>}
        <p>People in ROI: {count(zone.peopleCount)} · Queue (≥5s): {count(zone.queueCount)}</p>
        {zone.rules.map(rule => <div key={rule.ruleId} className={s.runtimeRule}>
          <strong>{rule.incidentName}</strong>
          <p>{rule.mode === 'PEOPLE_COUNT' ? 'People count in ROI (temporary)' : rule.mode === 'QUEUE_LENGTH' ? 'Queue length (5s continuous dwell)' : rule.mode} · Metric: {count(rule.metricValue)} {rule.unit === 'PEOPLE' ? 'people' : rule.unit}</p>
          <p>Warning ≥ {rule.warningThreshold} · Critical ≥ {rule.criticalThreshold}</p>
          <p>Warning sustain: {seconds(rule.warningProgressMs)}/{rule.sustainSec}s · Critical: {seconds(rule.criticalProgressMs)}/{rule.sustainSec}s</p>
          <p>{reasonLabel(rule.reason)}{rule.cooldownRemainingSec > 0 ? ` · ${Math.ceil(rule.cooldownRemainingSec)}s cooldown remaining` : ''}</p>
          {rule.incidentSeverity && <p>Open incident: {rule.incidentSeverity}</p>}
        </div>)}
      </article>)}
    </>}
    <Overline>RELATED INCIDENTS</Overline>
    {feedError && <p role="alert">{feedError}</p>}
    {feedError && feed && <p>Last incident feed is stale.</p>}
    {feed && !feedError && !feed.items.length && <p>No open incidents for this camera or its mapped zones.</p>}
    {feed?.items.map(incident => <article key={incident.incidentId} className={s.incident}>
      <div className={s.zoneRow}><Chip tone={incident.severity === 'CRITICAL' ? 'danger' : 'warning'}>{incident.severity}</Chip><Chip tone="neutral">{incident.status}</Chip>{incident.isDemo && <Chip tone="warning">DEMO</Chip>}</div>
      <strong>{incident.incidentName} · {incident.zoneName}</strong>
      <p>{incident.title}</p>
      {incident.status === 'DETECTED' && <p>AI created · not dispatched</p>}
      <p>Trigger camera: {incident.triggerCameraName ?? '—'} · Latest metric: {count(incident.metricValue)} {incident.thresholdUnit === 'PEOPLE' ? 'people' : incident.thresholdUnit}</p>
      <p className={s.muted}>{new Date(incident.updatedAt).toLocaleString()}</p>
    </article>)}
    {feed?.hasMore && <p className={s.muted}>Showing the 20 newest open incidents. More results are available through the paginated feed.</p>}
  </section>;
}

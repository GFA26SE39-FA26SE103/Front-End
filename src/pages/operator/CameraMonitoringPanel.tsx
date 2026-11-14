import { useState } from 'react';
import { dismissIncident } from '../../api/incidents';
import { Dialog } from '../../components/Dialog';
import { Button, Chip, Overline, type Tone } from '../../components/ui';
import type { IncidentFeedItem } from '../../api/monitoringRuntime';
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
const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
const slaTone = (priority: string | null): Tone => priority === 'CRITICAL' ? 'danger' : priority === 'HIGH' ? 'warning' : priority === 'MEDIUM' ? 'primary' : 'neutral';
const ended = (status: string) => ['CLOSED', 'DISMISSED', 'CANCELLED'].includes(status);
export function CameraMonitoringPanel({ state, canDismiss = false }: { state: CameraMonitoringState; canDismiss?: boolean }) {
  const { runtime, feed, runtimeError, feedError, loading } = state;
  const [target, setTarget] = useState<IncidentFeedItem | null>(null);
  const [reason, setReason] = useState('');
  const [dismissError, setDismissError] = useState('');
  const [dismissing, setDismissing] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissMessage, setDismissMessage] = useState('');
  const incidents = feed?.items.filter(incident => !dismissedIds.has(incident.incidentId));
  const closeDialog = () => { setTarget(null); setReason(''); setDismissError(''); };
  const submitDismiss = async () => {
    if (!target) return;
    const value = reason.trim();
    if (!value) return setDismissError('Enter a reason before dismissing this incident.');
    setDismissing(true); setDismissError(''); setDismissMessage('');
    try {
      await dismissIncident(target.incidentId, value);
      setDismissedIds(current => new Set(current).add(target.incidentId));
      setDismissMessage('Incident dismissed.');
      closeDialog();
    } catch (cause) {
      setDismissError(cause instanceof Error ? cause.message : 'Could not dismiss this incident.');
    } finally {
      setDismissing(false);
    }
  };
  return <><section className={s.monitoring} aria-label="Monitoring and incidents">
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
          <div className={s.zoneRow}><strong>{rule.incidentName}</strong>{rule.operationalEventPriority && <Chip tone={rule.operationalEventPriority === 'CRITICAL' ? 'danger' : 'warning'}>EVENT {rule.operationalEventPriority}</Chip>}</div>
          <p>{rule.mode === 'PEOPLE_COUNT' ? 'People count in ROI (temporary)' : rule.mode === 'QUEUE_LENGTH' ? 'Queue length (5s continuous dwell)' : rule.mode} · Metric: {count(rule.metricValue)} {rule.unit === 'PEOPLE' ? 'people' : rule.unit}</p>
          <p>Warning ≥ {rule.warningThreshold}{rule.warningExitThreshold != null && rule.warningExitThreshold !== rule.warningThreshold ? ` (held until < ${rule.warningExitThreshold})` : ''} · Critical ≥ {rule.criticalThreshold}{rule.criticalExitThreshold != null && rule.criticalExitThreshold !== rule.criticalThreshold ? ` (held until < ${rule.criticalExitThreshold})` : ''}</p>
          {rule.metricValue !== null && <p>Current level: <Chip tone={rule.currentLevel === 'CRITICAL' ? 'danger' : rule.currentLevel === 'WARNING' ? 'warning' : 'neutral'}>{rule.currentLevel ?? 'Below thresholds'}</Chip></p>}
          <p>Warning sustain: {seconds(rule.warningProgressMs)}/{rule.sustainSec}s · Critical: {seconds(rule.criticalProgressMs)}/{rule.sustainSec}s</p>
          <p>{reasonLabel(rule.reason)}{rule.cooldownRemainingSec > 0 ? ` · ${Math.ceil(rule.cooldownRemainingSec)}s cooldown remaining` : ''}</p>
          {rule.incidentId && <p>Open incident</p>}
        </div>)}
      </article>)}
    </>}
    <Overline>RELATED INCIDENTS</Overline>
    {feedError && <p role="alert">{feedError}</p>}
    {feedError && feed && <p>Last incident feed is stale.</p>}
    {dismissMessage && <p role="status" className={s.dismissSuccess}>{dismissMessage}</p>}
    {feed && !feedError && !incidents?.length && <p>No open incidents for this camera or its mapped zones.</p>}
    {incidents?.map(incident => <article key={incident.incidentId} className={s.incident}>
      <div className={s.zoneRow}><Chip tone={slaTone(incident.slaPriorityCode)}>{incident.slaPriorityCode ? `SLA ${incident.slaPriorityCode}` : 'SLA unavailable'}</Chip><Chip tone="neutral">{incident.status}</Chip>{incident.isDemo && <Chip tone="warning">DEMO</Chip>}</div>
      <strong>{incident.incidentName} · {incident.zoneName}</strong>
      <p>{incident.title}</p>
      {incident.status === 'DETECTED' && <p>AI created · not dispatched</p>}
      {incident.slaPolicyVersion !== null && <p>Policy snapshot v{incident.slaPolicyVersion}</p>}
      {incident.responseDeadlineAt || incident.resolutionDeadlineAt ? <p>
        {incident.responseDeadlineAt && <>Respond by {date(incident.responseDeadlineAt)}</>}
        {incident.responseDeadlineAt && incident.resolutionDeadlineAt && ' · '}
        {incident.resolutionDeadlineAt && <>Resolve by {date(incident.resolutionDeadlineAt)}</>}
      </p> : <p>No SLA deadline snapshot is available for this incident.</p>}
      {incident.mitigatedAt && <p>Mitigated at {date(incident.mitigatedAt)}</p>}
      <p>Trigger camera: {incident.triggerCameraName ?? '—'} · Latest metric: {count(incident.metricValue)} {incident.thresholdUnit === 'PEOPLE' ? 'people' : incident.thresholdUnit}</p>
      <p className={s.muted}>{new Date(incident.updatedAt).toLocaleString()}</p>
      {canDismiss && !ended(incident.status) && <Button variant="dangerGhost" aria-label={`Dismiss ${incident.incidentName} incident`} onClick={() => { setTarget(incident); setReason(''); setDismissError(''); }}>Dismiss incident</Button>}
    </article>)}
    {feed?.hasMore && <p className={s.muted}>Showing the 20 newest incidents. More results are available through the paginated feed.</p>}
  </section>
  {target && <Dialog title="Dismiss incident?" busy={dismissing} onClose={closeDialog}>
    <p className={s.dismissHelp}><strong>{target.incidentName}</strong> in {target.zoneName} will end as DISMISSED. The reason is required and will be audited.</p>
    <label className={s.dismissField}>Dismiss reason<textarea aria-label="Dismiss reason" maxLength={2000} value={reason} disabled={dismissing} onChange={event => setReason(event.target.value)} /></label>
    {dismissError && <p className={s.dismissError} role="alert">{dismissError}</p>}
    <div className={s.dismissActions}><Button variant="secondary" data-autofocus disabled={dismissing} onClick={closeDialog}>Cancel</Button><Button variant="dangerGhost" disabled={dismissing} onClick={() => void submitDismiss()}>{dismissing ? 'Dismissing…' : 'Dismiss incident'}</Button></div>
  </Dialog>}
  </>;
}

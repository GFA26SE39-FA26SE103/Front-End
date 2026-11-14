import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { dismissIncident } from '../../api/incidents';
import { mockNativeDialogs } from '../../test/dialog';
import { CameraMonitoringPanel } from './CameraMonitoringPanel';
import type { CameraMonitoringState } from './useCameraMonitoring';
mockNativeDialogs();
vi.mock('../../api/incidents', () => ({ dismissIncident: vi.fn() }));
const state: CameraMonitoringState = { loading: false, runtimeError: '', feedError: '', runtime: { cameraId: 'cam', state: 'RUNNING', reason: 'MEASUREMENTS_ACTIVE', errorCode: null, videoSourceType: 'RECORDED', sessionId: 'session', sourceElapsedMs: 6000, observedAt: '2026-10-03T00:00:00Z', isStale: false, annotationContext: 'confidence:0.5', zones: [{ zoneId: 'z', zoneName: 'Frozen', configId: 'c', configVersion: '2026-10-03T00:00:00Z', configurationStatus: 'ACTIVE', confidence: .7, peopleCount: 3, queueCount: 0, issueCode: null, rules: [{ ruleId: 'r', incidentCode: 'LONG_QUEUE', incidentName: 'Long Queue', mode: 'QUEUE_LENGTH', unit: 'PEOPLE', warningThreshold: 1, criticalThreshold: 2, sustainSec: 1, cooldownSec: 300, metricValue: 0, warningProgressMs: 0, criticalProgressMs: 0, cooldownRemainingSec: 0, reason: 'QUEUE_DWELL_PENDING', incidentId: null, operationalEventPriority: 'WARNING' }] }] }, feed: { items: [], hasMore: false, nextCreatedAt: null, nextIncidentId: null } };
describe('live monitoring and incidents', () => {
  it('does not imply the source is released while deactivation is pending', () => {
    render(<CameraMonitoringPanel state={{ ...state, runtime: { ...state.runtime!, state: 'STOPPING', reason: 'MONITORING_STOP_PENDING', zones: [] } }} />);
    expect(screen.getByText('STOPPING')).toBeInTheDocument();
    expect(screen.getByText(/Wait for STOPPED before reactivating/)).toBeInTheDocument();
  });
  it('shows real ROI counts, confidence, independent progress and queue dwell reason', () => {
    render(<CameraMonitoringPanel state={state} />);
    expect(screen.getByText(/People in ROI: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for 5s continuous dwell/)).toBeInTheDocument();
    expect(screen.getByText(/Warning ≥ 1/)).toHaveTextContent('Critical ≥ 2');
    expect(screen.getByText(/confidence:0.5/)).toBeInTheDocument();
    expect(screen.getByText('EVENT WARNING')).toBeInTheDocument();
    expect(screen.getByText('No open incidents for this camera or its mapped zones.')).toBeInTheDocument();
  });
  it('shows the dead band and the level currently held by the rule', () => {
    const zone = state.runtime!.zones[0];
    const rule = { ...zone.rules[0], warningThreshold: 10, criticalThreshold: 20, warningExitThreshold: 8, criticalExitThreshold: 18, metricValue: 19, currentLevel: 'CRITICAL' as const };
    render(<CameraMonitoringPanel state={{ ...state, runtime: { ...state.runtime!, zones: [{ ...zone, rules: [rule] }] } }} />);
    expect(screen.getByText('Warning ≥ 10 (held until < 8) · Critical ≥ 20 (held until < 18)')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  it('shows stale errors instead of an empty or healthy feed', () => {
    render(<CameraMonitoringPanel state={{ ...state, runtimeError: 'Runtime unavailable', feedError: 'Feed unavailable', feed: null }} />);
    expect(screen.getByText(/Last runtime data is stale/)).toBeInTheDocument();
    expect(screen.getByText('Feed unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No open incidents for this camera or its mapped zones.')).not.toBeInTheDocument();
  });
  it('labels DETECTED demo incidents as not dispatched and retains the trigger-camera label', () => {
    render(<CameraMonitoringPanel state={{ ...state, feed: { ...state.feed!, items: [{ incidentId: 'i', zoneId: 'z', zoneName: 'Frozen', incidentCode: 'OVERCROWDING_CONGESTION', incidentName: 'Overcrowding', triggerCameraId: 'old', triggerCameraName: 'Previous camera', status: 'DETECTED', title: 'Crowd incident', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:01Z', closedAt: null, slaPolicyId: 'policy-1', slaPriorityCode: 'HIGH', slaPolicyVersion: 3, responseDeadlineAt: '2026-11-05T10:30:00Z', resolutionDeadlineAt: '2026-11-05T11:00:00Z', mitigatedAt: null, metricValue: 3, measurementMode: 'PEOPLE_COUNT', thresholdUnit: 'PEOPLE', videoSourceType: 'RECORDED', isDemo: true }] } }} />);
    expect(screen.getByText(/AI created · not dispatched/)).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Previous camera/)).toBeInTheDocument();
    expect(screen.getByText('SLA HIGH')).toBeInTheDocument();
    expect(screen.getByText('Policy snapshot v3')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Respond by 5 Nov 2026, 17:30 · Resolve by 5 Nov 2026, 18:00')).toBeInTheDocument();
    expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument();
  });
  it('shows an explicit unavailable state instead of inventing SLA data', () => {
    render(<CameraMonitoringPanel state={{ ...state, feed: { ...state.feed!, items: [{ incidentId: 'i', zoneId: 'z', zoneName: 'Frozen', incidentCode: 'LONG_QUEUE', incidentName: 'Long queue', triggerCameraId: null, triggerCameraName: null, status: 'OPEN', title: 'Queue incident', createdAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-05T10:01:00Z', closedAt: null, slaPolicyId: null, slaPriorityCode: null, slaPolicyVersion: null, responseDeadlineAt: null, resolutionDeadlineAt: null, mitigatedAt: null, metricValue: 4, measurementMode: 'QUEUE_LENGTH', thresholdUnit: 'PEOPLE', videoSourceType: 'LIVE', isDemo: false }] } }} />);
    expect(screen.getByText('SLA unavailable')).toBeInTheDocument();
    expect(screen.getByText('No SLA deadline snapshot is available for this incident.')).toBeInTheDocument();
    expect(screen.queryByText(/Respond by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resolve by/)).not.toBeInTheDocument();
  });
  it('ignores a legacy incident severity field on an open runtime incident', () => {
    const legacy = { ...state, runtime: { ...state.runtime!, zones: [{ ...state.runtime!.zones[0], rules: [{ ...state.runtime!.zones[0].rules[0], incidentId: 'incident-1', incidentSeverity: 'CRITICAL' }] }] } } as unknown as CameraMonitoringState;
    render(<CameraMonitoringPanel state={legacy} />);
    expect(screen.getByText('Open incident')).toBeInTheDocument();
    expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument();
  });
  it('distinguishes Draft and completed, cooldown and sustain pending', () => {
    render(<CameraMonitoringPanel state={{ ...state, runtime: { ...state.runtime!, state: 'COMPLETED', zones: [{ ...state.runtime!.zones[0], configurationStatus: 'DRAFT', peopleCount: null, queueCount: null, rules: [{ ...state.runtime!.zones[0].rules[0], reason: 'SUSTAIN_PENDING', metricValue: null, cooldownRemainingSec: 20, warningProgressMs: 500 }] }] } }} />);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText(/Deactivate → Activate/)).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText(/20s cooldown remaining/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for sustain/)).toBeInTheDocument();
  });
  it('requires a reason before the operator dismisses an open incident', async () => {
    vi.mocked(dismissIncident).mockResolvedValue({ incidentId: 'i', status: 'DISMISSED', reason: 'False alarm', closedAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' });
    const incident = { incidentId: 'i', zoneId: 'z', zoneName: 'Frozen', incidentCode: 'LONG_QUEUE', incidentName: 'Long queue', triggerCameraId: null, triggerCameraName: null, status: 'OPEN', title: 'Queue incident', createdAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-05T10:01:00Z', closedAt: null, slaPolicyId: null, slaPriorityCode: null, slaPolicyVersion: null, responseDeadlineAt: null, resolutionDeadlineAt: null, mitigatedAt: null, metricValue: 4, measurementMode: 'QUEUE_LENGTH', thresholdUnit: 'PEOPLE', videoSourceType: 'LIVE', isDemo: false };
    const user = userEvent.setup();
    render(<CameraMonitoringPanel state={{ ...state, feed: { items: [incident], hasMore: false, nextCreatedAt: null, nextIncidentId: null } }} canDismiss />);

    await user.click(screen.getByRole('button', { name: 'Dismiss Long queue incident' }));
    const dialog = screen.getByRole('dialog', { name: 'Dismiss incident?' });
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss incident' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a reason');
    await user.type(within(dialog).getByLabelText('Dismiss reason'), '  False alarm  ');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss incident' }));

    expect(dismissIncident).toHaveBeenCalledWith('i', 'False alarm');
    expect(await screen.findByRole('status')).toHaveTextContent('Incident dismissed.');
    expect(screen.queryByText('Queue incident')).not.toBeInTheDocument();
  });
});

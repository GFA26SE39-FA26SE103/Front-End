import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CameraMonitoringPanel } from './CameraMonitoringPanel';
import type { CameraMonitoringState } from './useCameraMonitoring';
const state: CameraMonitoringState = { loading: false, runtimeError: '', feedError: '', runtime: { cameraId: 'cam', state: 'RUNNING', reason: 'MEASUREMENTS_ACTIVE', errorCode: null, videoSourceType: 'RECORDED', sessionId: 'session', sourceElapsedMs: 6000, observedAt: '2026-10-03T00:00:00Z', isStale: false, annotationContext: 'confidence:0.5', zones: [{ zoneId: 'z', zoneName: 'Frozen', configId: 'c', configVersion: '2026-10-03T00:00:00Z', configurationStatus: 'ACTIVE', confidence: .7, peopleCount: 3, queueCount: 0, issueCode: null, rules: [{ ruleId: 'r', incidentCode: 'LONG_QUEUE', incidentName: 'Long Queue', mode: 'QUEUE_LENGTH', unit: 'PEOPLE', warningThreshold: 1, criticalThreshold: 2, sustainSec: 1, cooldownSec: 300, metricValue: 0, warningProgressMs: 0, criticalProgressMs: 0, cooldownRemainingSec: 0, reason: 'QUEUE_DWELL_PENDING', incidentId: null, incidentSeverity: null }] }] }, feed: { items: [], hasMore: false, nextCreatedAt: null, nextIncidentId: null } };
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
    expect(screen.getByText('No open incidents for this camera or its mapped zones.')).toBeInTheDocument();
  });
  it('shows stale errors instead of an empty or healthy feed', () => {
    render(<CameraMonitoringPanel state={{ ...state, runtimeError: 'Runtime unavailable', feedError: 'Feed unavailable', feed: null }} />);
    expect(screen.getByText(/Last runtime data is stale/)).toBeInTheDocument();
    expect(screen.getByText('Feed unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No open incidents for this camera or its mapped zones.')).not.toBeInTheDocument();
  });
  it('labels DETECTED demo incidents as not dispatched and retains the trigger-camera label', () => {
    render(<CameraMonitoringPanel state={{ ...state, feed: { ...state.feed!, items: [{ incidentId: 'i', zoneId: 'z', zoneName: 'Frozen', incidentCode: 'OVERCROWDING_CONGESTION', incidentName: 'Overcrowding', triggerCameraId: 'old', triggerCameraName: 'Previous camera', severity: 'CRITICAL', status: 'DETECTED', title: 'Crowd incident', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:01Z', closedAt: null, metricValue: 3, measurementMode: 'PEOPLE_COUNT', thresholdUnit: 'PEOPLE', videoSourceType: 'RECORDED', isDemo: true }] } }} />);
    expect(screen.getByText(/AI created · not dispatched/)).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Previous camera/)).toBeInTheDocument();
  });
  it('distinguishes Draft and completed, cooldown and sustain pending', () => {
    render(<CameraMonitoringPanel state={{ ...state, runtime: { ...state.runtime!, state: 'COMPLETED', zones: [{ ...state.runtime!.zones[0], configurationStatus: 'DRAFT', peopleCount: null, queueCount: null, rules: [{ ...state.runtime!.zones[0].rules[0], reason: 'SUSTAIN_PENDING', metricValue: null, cooldownRemainingSec: 20, warningProgressMs: 500 }] }] } }} />);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText(/Deactivate → Activate/)).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText(/20s cooldown remaining/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for sustain/)).toBeInTheDocument();
  });
});

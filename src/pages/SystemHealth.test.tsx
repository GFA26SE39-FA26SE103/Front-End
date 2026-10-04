import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import type { SetupOverview } from '../api/setup';
import SystemHealth from './SystemHealth';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const overview = (): SetupOverview => ({
  generatedAt: '2026-10-04T10:00:00Z', hasDefaultStore: true,
  totals: { floorCount: 1, zoneCount: 1, cameraCount: 1, configuredZoneCount: 1, activeConfigurationCount: 1, readyToActivateCount: 0, onlineCameraCount: 0, enabledCameraCount: 1, unresolvedHealthEventCount: 1 },
  steps: [], floors: [],
  cameras: [{ cameraId: 'camera-1', floorId: 'floor-1', floorName: 'Ground floor', code: 'CAM-01', name: 'Checkout camera', status: 'ACTIVE', healthStatus: 'OFFLINE', monitoringReadiness: 'NOT_READY', processingAvailability: 'UNKNOWN', activeHealthIssues: ['STREAM_UNAVAILABLE'], lastSeenAt: null, hasConnection: true, connectionValid: true, isEnabled: true, sourceType: 'LIVE', protocol: 'RTSP', lastTestResult: 'SUCCESS', lastTestedAt: '2026-10-04T09:00:00Z', issues: [{ code: 'CAMERA_HEALTH_OFFLINE', message: 'Investigate camera connectivity.' }] }],
  healthEvents: [{ healthEventId: 'event-1', cameraId: 'camera-1', cameraCode: 'CAM-01', eventType: 'STREAM_UNAVAILABLE', status: 'OPEN', detectedAt: '2026-10-04T09:30:00Z' }],
});

describe('System health', () => {
  let data: SetupOverview;
  let calls: { path: string; method: string }[];

  beforeEach(() => {
    data = overview(); calls = [];
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@test.example', fullName: 'Admin', roleId: 'role', role: 'ADMIN', status: 'ACTIVE' } }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname; const method = init?.method ?? 'GET'; calls.push({ path, method });
      if (path === '/api/setup/overview') return json(data);
      if (path === '/api/cameras/camera-1/health/check' && method === 'POST') {
        data.cameras[0].healthStatus = 'ONLINE'; data.cameras[0].monitoringReadiness = 'READY'; data.cameras[0].processingAvailability = 'AVAILABLE';
        data.cameras[0].activeHealthIssues = []; data.cameras[0].issues = []; data.cameras[0].lastSeenAt = '2026-10-04T10:01:00Z';
        data.totals.onlineCameraCount = 1; data.totals.unresolvedHealthEventCount = 0; data.healthEvents = [];
        return json({ cameraId: 'camera-1', connectionStatus: 'ONLINE', monitoringReadiness: 'READY', processingAvailability: 'AVAILABLE', activeHealthIssues: [] });
      }
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
  });

  it('renders live camera health from the API without mock infrastructure metrics', async () => {
    render(<MemoryRouter><SystemHealth /></MemoryRouter>);
    const table = await screen.findByRole('table', { name: 'Camera health' });
    expect(within(table).getByText('CAM-01')).toBeInTheDocument();
    expect(within(table).getByText('OFFLINE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unresolved camera health alerts' })).toBeInTheDocument();
    expect(screen.queryByText('AI PROCESSING')).not.toBeInTheDocument();
    expect(screen.queryByText('MOBILE SYNC')).not.toBeInTheDocument();
    expect(calls).toEqual([{ path: '/api/setup/overview', method: 'GET' }]);
  });

  it('checks a real configured camera and reloads server health', async () => {
    render(<MemoryRouter><SystemHealth /></MemoryRouter>);
    await screen.findByText('OFFLINE');
    fireEvent.click(screen.getByRole('button', { name: 'Check health' }));
    await screen.findByText('ONLINE');
    expect(calls).toEqual([
      { path: '/api/setup/overview', method: 'GET' },
      { path: '/api/cameras/camera-1/health/check', method: 'POST' },
      { path: '/api/setup/overview', method: 'GET' },
    ]);
    expect(screen.queryByRole('heading', { name: 'Unresolved camera health alerts' })).not.toBeInTheDocument();
  });
});

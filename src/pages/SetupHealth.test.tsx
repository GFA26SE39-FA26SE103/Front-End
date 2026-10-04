import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import type { SetupOverview } from '../api/setup';
import SetupHealth from './SetupHealth';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const dashboardFixture = (): SetupOverview => ({
  generatedAt: '2026-10-03T10:00:00Z', hasDefaultStore: true,
  totals: { floorCount: 2, zoneCount: 2, cameraCount: 1, configuredZoneCount: 1, activeConfigurationCount: 1, readyToActivateCount: 0, onlineCameraCount: 0, enabledCameraCount: 1, unresolvedHealthEventCount: 1 },
  steps: [
    { code: 'floor-zones', name: 'Floor plans & zones', completed: 1, total: 2, description: 'Floors with maps and zones.' },
    { code: 'camera-source', name: 'Camera sources', completed: 1, total: 1, description: 'Saved sources.' },
    { code: 'test-enable', name: 'Test & enable', completed: 1, total: 1, description: 'Preview completion is not recorded.' },
    { code: 'mapping-roi', name: 'Camera mapping & ROI', completed: 1, total: 2, description: 'Saved valid ROI.' },
    { code: 'rules', name: 'Incident rules', completed: 1, total: 2, description: 'Saved rules.' },
    { code: 'activation', name: 'Configuration activation', completed: 1, total: 2, description: 'Active configurations.' },
  ],
  floors: [
    { floorId: 'floor-1', floorNumber: 1, name: 'Ground floor', hasMap: true, zones: [{ zoneId: 'zone-1', code: 'QUEUE', name: 'Checkout queue', status: 'ACTIVE', configuration: { configId: 'config', name: 'Queue monitoring', status: 'ACTIVE', ruleCount: 1, enabledRuleCount: 1 }, setupReady: true, canActivate: false, cameras: [{ cameraId: 'camera-1', code: 'CAM-01', name: 'Queue camera', status: 'ACTIVE', mappingStatus: 'ACTIVE', roiPolygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], sourceType: 'LIVE', protocol: 'HTTP', isEnabled: true, lastTestResult: 'SUCCESS', lastTestedAt: '2026-10-03T09:00:00Z', ready: true, issues: [] }], issues: [], warnings: ['MF-02 processing is separate.'] }] },
    { floorId: 'floor-2', floorNumber: 2, name: 'Fresh food floor', hasMap: false, zones: [{ zoneId: 'zone-2', code: 'FOOD', name: 'Fresh food zone', status: 'ACTIVE', configuration: null, setupReady: false, canActivate: false, cameras: [], issues: [{ code: 'CONFIGURATION_MISSING', message: 'Add incident rules.' }], warnings: [] }] },
  ],
  cameras: [{ cameraId: 'camera-1', floorId: 'floor-1', floorName: 'Ground floor', code: 'CAM-01', name: 'Queue camera', status: 'ACTIVE', healthStatus: 'OFFLINE', monitoringReadiness: 'NOT_READY', processingAvailability: 'UNKNOWN', activeHealthIssues: ['STREAM_UNAVAILABLE'], lastSeenAt: null, hasConnection: true, connectionValid: true, isEnabled: true, sourceType: 'LIVE', protocol: 'HTTP', lastTestResult: 'SUCCESS', lastTestedAt: '2026-10-03T09:00:00Z', issues: [{ code: 'CAMERA_HEALTH_OFFLINE', message: 'Investigate camera connectivity.' }] }],
  healthEvents: [{ healthEventId: 'event', cameraId: 'camera-1', cameraCode: 'CAM-01', eventType: 'STREAM_UNAVAILABLE', status: 'OPEN', detectedAt: '2026-10-03T10:00:00Z' }],
});
let data: SetupOverview;
let failOverview: boolean;
let calls: { path: string; method: string; bearer: string | null }[];
const show = () => render(<MemoryRouter><SetupHealth /></MemoryRouter>);

describe('MF-01 setup dashboard', () => {
  beforeEach(() => {
    data = dashboardFixture(); calls = []; failOverview = false;
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@test.example', fullName: 'Admin', roleId: 'role', role: 'ADMIN', status: 'ACTIVE' } }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname; const method = init?.method ?? 'GET';
      calls.push({ path, method, bearer: new Headers(init?.headers).get('Authorization') });
      if (path === '/api/setup/overview') return failOverview ? json({ code: 'LOAD_FAILED', detail: 'Setup unavailable.' }, 503) : json(data);
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
  });

  it('loads a read-only setup summary without duplicating runtime camera health', async () => {
    show(); await screen.findByText('Checkout queue');
    expect(within(screen.getByRole('region', { name: 'Configuration activation' })).getByText('1 / 2')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Zone configurations' })).getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View configuration' })).toHaveAttribute('href', '/admin/ai-config?zoneId=zone-1');
    expect(screen.getAllByRole('link', { name: 'Layout & ROI' })[0]).toHaveAttribute('href', '/admin/store-layout?floorId=floor-1&cameraId=camera-1');
    expect(screen.queryByRole('table', { name: 'Camera connectivity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unresolved camera health alerts' })).not.toBeInTheDocument();
    expect(calls).toEqual([{ path: '/api/setup/overview', method: 'GET', bearer: 'Bearer admin-token' }]);
    expect(screen.queryByRole('button', { name: 'Activate monitoring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
  });

  it('filters zones by floor, search and missing setup', async () => {
    show(); await screen.findByText('Checkout queue');
    fireEvent.change(screen.getByLabelText('Filter dashboard by floor'), { target: { value: 'floor-2' } });
    expect(screen.queryByText('Checkout queue')).not.toBeInTheDocument(); expect(screen.getByText('Fresh food zone')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter dashboard by floor'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search zones'), { target: { value: 'Queue monitoring' } });
    expect(screen.getByText('Checkout queue')).toBeInTheDocument(); expect(screen.queryByText('Fresh food zone')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search zones'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Needs attention only'));
    expect(screen.queryByText('Checkout queue')).not.toBeInTheDocument(); expect(screen.getByText('Fresh food zone')).toBeInTheDocument();
    fireEvent.click(screen.getByText('1 missing requirement')); expect(screen.getByText('Add incident rules.')).toBeInTheDocument();
  });

  it('handles empty setup and missing default seed without claiming completion', async () => {
    data.hasDefaultStore = false; data.floors = []; data.cameras = []; data.healthEvents = [];
    Object.keys(data.totals).forEach(key => { data.totals[key as keyof typeof data.totals] = 0; });
    data.steps.forEach(step => { step.completed = 0; step.total = 0; });
    show(); await screen.findByText(/default store seed is missing/i);
    expect(screen.getByText(/No floors yet/)).toBeInTheDocument();
    expect(screen.queryByText('MONITORING ACTIVE')).not.toBeInTheDocument(); expect(calls.every(c => c.method === 'GET')).toBe(true);
  });

  it('shows retry on initial failure and warns when a refresh leaves an old snapshot', async () => {
    failOverview = true; show(); await screen.findByText('Setup unavailable.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    failOverview = false; fireEvent.click(screen.getByRole('button', { name: 'Retry loading setup' })); await screen.findByText('Checkout queue');
    failOverview = true; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Showing the last successful snapshot. Status may have changed.');
    expect(screen.getByText('Checkout queue')).toBeInTheDocument(); expect(calls.every(c => c.method === 'GET')).toBe(true);
  });

  it('refreshes visible snapshots periodically, pauses when hidden and cancels on unmount', async () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    try {
      let rendered: ReturnType<typeof show>;
      await act(async () => { rendered = show(); });
      expect(calls).toHaveLength(1);
      await act(async () => { vi.advanceTimersByTime(30000); }); expect(calls).toHaveLength(2);
      hidden.mockReturnValue(true);
      await act(async () => { vi.advanceTimersByTime(30000); }); expect(calls).toHaveLength(2);
      rendered!.unmount(); await act(async () => { vi.advanceTimersByTime(60000); }); expect(calls).toHaveLength(2);
      expect(calls.every(c => c.method === 'GET')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('routes ready draft configurations through review instead of performing activation', async () => {
    const zone = data.floors[0].zones[0]; zone.configuration!.status = 'DRAFT'; zone.canActivate = true;
    show(); await screen.findByText('Ready for review');
    expect(screen.getByRole('link', { name: 'Review configuration' })).toHaveAttribute('href', '/admin/ai-config?zoneId=zone-1');
    expect(calls.every(c => c.method === 'GET')).toBe(true);
  });
});

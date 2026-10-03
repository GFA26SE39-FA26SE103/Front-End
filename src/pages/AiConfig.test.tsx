import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiConfig from './AiConfig';
import { saveSession } from '../auth/session';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const zone = { zoneId: 'zone-1', floorId: 'floor-1', code: 'QUEUE', name: 'Actual queue zone', zoneType: 'QUEUE', mapPolygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], colorHex: '#123456', areaM2: 10, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z' };
const type = { incidentTypeId: 'type-1', code: 'LONG_QUEUE', name: 'Long Queue', description: null, sourceType: 'AI_DETECTED', measurementType: 'QUEUE_LENGTH', status: 'ACTIVE', supported: true, thresholdUnit: 'PEOPLE', defaultWarningThreshold: 3, defaultCriticalThreshold: 5, unsupportedReason: null };
let config: Record<string, unknown> | null;
let writes: { path: string; method: string; body: Record<string, unknown>; bearer: string | null }[];
let failSave: boolean;
let ready: boolean;
let failLoad: boolean;
let requests: string[];
const show = () => render(<MemoryRouter initialEntries={['/admin/ai-config?zoneId=zone-1']}><AiConfig /></MemoryRouter>);

describe('API-backed monitoring configuration', () => {
  beforeEach(() => {
    config = null; writes = []; requests = []; failSave = false; ready = true; failLoad = false;
    URL.createObjectURL = vi.fn(() => 'blob:zone-confidence');
    URL.revokeObjectURL = vi.fn();
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@example.test', fullName: 'Admin', roleId: 'role', role: 'ADMIN', status: 'ACTIVE' } }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      requests.push(String(input));
      const method = init?.method ?? 'GET';
      if (method !== 'GET') writes.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : {}, bearer: new Headers(init?.headers).get('Authorization') });
      if (path === '/api/supermarkets') return json([{ supermarketId: 'store-1', code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (path === '/api/supermarkets/store-1/floors') return json([{ floorId: 'floor-1', supermarketId: 'store-1', floorNumber: 1, name: 'Real floor', mapAssetUrl: null, mapWidth: null, mapHeight: null, status: 'ACTIVE' }]);
      if (path === '/api/floors/floor-1/zones') return json([zone]);
      if (path === '/api/incident-types') return json([type]);
      if (path.endsWith('/ai-preview/start') || path.endsWith('/ai-preview/status')) return json({ cameraId: 'camera-1', state: 'LIVE', frameSequence: 1 });
      if (path.endsWith('/ai-preview/stop')) return json({ cameraId: 'camera-1', state: 'STOPPED', frameSequence: 0 });
      if (path.endsWith('/ai-preview/frame')) return new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } });
      if (path.endsWith('/review')) return json({ configuration: config, zone, cameras: [{ cameraId: 'camera-1', code: 'CAM-01', name: 'Phone', status: 'ACTIVE', mappingStatus: 'ACTIVE', roiPolygon: zone.mapPolygon, sourceType: 'RECORDED', protocol: 'FILE', isEnabled: true, lastTestResult: 'SUCCESS', lastTestedAt: '2026-10-03T00:00:00Z', ready: true, issues: [] }], issues: ready ? [] : [{ code: 'ROI_INVALID', message: 'Fix camera ROI before activation.' }], warnings: [], canActivate: ready });
      if (path.endsWith('/activate')) { config = { ...config, status: 'ACTIVE' }; return json(config); }
      if (path.endsWith('/deactivate')) { config = { ...config, status: 'INACTIVE' }; return json(config); }
      if (path.endsWith('/monitoring')) {
        if (method === 'GET' && failLoad) return json({ code: 'DATABASE_UNAVAILABLE', detail: 'Configuration could not be loaded.' }, 503);
        if (method === 'PUT') {
          if (failSave) return json({ code: 'DATABASE_CONFLICT', detail: 'Save failed; retry.' }, 409);
          config = { ...JSON.parse(String(init?.body)), configId: 'config-1', zoneId: zone.zoneId, status: 'DRAFT', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T01:00:00Z', createdByUserId: 'admin' };
        }
        return config ? json(config) : json({ code: 'NOT_FOUND', detail: 'No configuration yet.' }, 404);
      }
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
  });

  it('selects a real zone, saves numeric rules with bearer, and reviews before activation', async () => {
    show();
    await screen.findByRole('option', { name: /Actual queue zone/ });
    await screen.findByRole('button', { name: 'Add rule' });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Detection confidence'), { target: { value: '0.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Draft saved to database.');
    const saved = writes.find((r) => r.method === 'PUT')!;
    expect(saved.path).toBe('/api/zones/zone-1/monitoring');
    expect(saved.bearer).toBe('Bearer admin-token');
    expect(saved.body.confidenceThreshold).toBe(.7);
    expect(saved.body.rules).toEqual([{ incidentTypeId: 'type-1', warningThreshold: 3, criticalThreshold: 5, thresholdUnit: 'PEOPLE', sustainSec: 30, cooldownSec: 300, enabled: true, parametersJson: null }]);
    fireEvent.click(screen.getByRole('button', { name: 'Review configuration' }));
    await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Activate configuration' }));
    await waitFor(() => expect(writes.some((r) => r.path.endsWith('/activate'))).toBe(true));
    expect(writes.find((r) => r.path.endsWith('/activate'))?.body).toEqual({ expectedUpdatedAt: '2026-10-03T01:00:00Z' });
  });

  it('preserves draft input and never claims a failed save succeeded', async () => {
    failSave = true; show();
    await screen.findByRole('button', { name: 'Add rule' });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Configuration name'), { target: { value: 'Keep my edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Save failed; retry.');
    expect(screen.getByLabelText('Configuration name')).toHaveValue('Keep my edit');
    expect(screen.queryByText('Draft saved to database.')).not.toBeInTheDocument();
  });

  it('shows readiness blockers and does not allow activation', async () => {
    ready = false; show();
    await screen.findByRole('button', { name: 'Add rule' });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Draft saved to database.');
    fireEvent.click(screen.getByRole('button', { name: 'Review configuration' }));
    await screen.findByText('Fix camera ROI before activation.');
    expect(screen.getByRole('button', { name: 'Activate configuration' })).toBeDisabled();
    expect(writes.some((r) => r.path.endsWith('/activate'))).toBe(false);
  });

  it('does not overwrite an unknown existing configuration after a load failure', async () => {
    failLoad = true; show();
    await screen.findByText('Configuration could not be loaded.');
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('requires deactivate before changing an active configuration', async () => {
    config = { configId: 'config-1', zoneId: 'zone-1', name: 'Active config', confidenceThreshold: .6, status: 'ACTIVE', updatedAt: '2026-10-03T01:00:00Z', rules: [{ incidentTypeId: 'type-1', warningThreshold: 3, criticalThreshold: 5, thresholdUnit: 'PEOPLE', sustainSec: 30, cooldownSec: 300, enabled: true, parametersJson: '{}' }] };
    show();
    await screen.findByDisplayValue('Active config');
    expect(screen.getByLabelText('Detection confidence')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate configuration' }));
    await screen.findByText('Monitoring deactivated. Edit and save a new Draft before reactivation.');
    expect(screen.getByLabelText('Detection confidence')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Draft saved to database.');
    const savedRules = writes.find(r => r.method === 'PUT')!.body.rules as Record<string, unknown>[];
    expect(savedRules[0].parametersJson).toBe('{}');
  });

  it('rejects invalid thresholds locally and invalidates review when edited', async () => {
    show(); await screen.findByRole('button', { name: 'Add rule' });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Long Queue: warning must be less than critical.');
    expect(writes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Draft saved to database.');
    fireEvent.click(screen.getByRole('button', { name: 'Review configuration' }));
    await screen.findByText('CAM-01');
    fireEvent.change(screen.getByLabelText('Detection confidence'), { target: { value: '0.8' } });
    expect(screen.queryByRole('button', { name: 'Activate configuration' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review configuration' })).toBeDisabled();
  });

  it('tests saved zone confidence in annotated preview without activating monitoring', async () => {
    show(); await screen.findByRole('button', { name: 'Add rule' });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Draft saved to database.');
    fireEvent.click(screen.getByRole('button', { name: 'Review configuration' }));
    await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Preview zone confidence: CAM-01' }));
    await screen.findByRole('img', { name: 'Tracked preview for camera' });
    expect(requests.some(url => url.endsWith('/ai-preview/start?zoneId=zone-1'))).toBe(true);
    expect(writes.some(r => r.path.endsWith('/activate'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Stop zone preview: CAM-01' }));
    await waitFor(() => expect(writes.some(r => r.path.endsWith('/ai-preview/stop'))).toBe(true));
  });
});

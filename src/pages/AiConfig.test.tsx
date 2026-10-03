import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiConfig from './AiConfig';
import { saveSession } from '../auth/session';
import { mockNativeDialogs } from '../test/dialog';
mockNativeDialogs();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const zone = { zoneId: 'zone-1', floorId: 'floor-1', code: 'QUEUE', name: 'Actual queue zone', zoneType: 'QUEUE', mapPolygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], colorHex: '#123456', areaM2: 10, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z' };
const type = { incidentTypeId: 'type-1', code: 'LONG_QUEUE', name: 'Long Queue', description: null, sourceType: 'AI_DETECTED', measurementType: 'QUEUE_LENGTH', status: 'ACTIVE', supported: true, thresholdUnit: 'PEOPLE', defaultWarningThreshold: 3, defaultCriticalThreshold: 5, unsupportedReason: null };
const savedConfig = (status = 'DRAFT') => ({ configId: 'config-1', zoneId: 'zone-1', name: 'Queue monitoring', confidenceThreshold: .6, status, updatedAt: '2026-10-03T01:00:00Z', rules: [{ incidentTypeId: 'type-1', warningThreshold: 3, criticalThreshold: 5, thresholdUnit: 'PEOPLE', sustainSec: 30, cooldownSec: 300, enabled: true, parametersJson: '{}' }] });
let config: Record<string, unknown> | null;
let writes: { path: string; method: string; body: Record<string, unknown>; bearer: string | null }[];
let failSave: boolean;
let failDelete: boolean;
let ready: boolean;
let failLoad: boolean;
let multipleFloors: boolean;
let requests: string[];
let crowdCatalog: boolean;
const crowdType = { ...type, incidentTypeId: 'crowd', code: 'OVERCROWDING_CONGESTION', name: 'Overcrowding / Congestion', measurementType: 'CROWD_DENSITY', supported: false, thresholdUnit: 'PEOPLE_PER_M2', defaultWarningThreshold: 2, defaultCriticalThreshold: 3, unsupportedReason: 'Density runtime is deferred.', measurementOptions: [{ mode: 'PEOPLE_COUNT', unit: 'PEOPLE', supported: true, reason: null }] };
function HistoryBack() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Browser back</button>; }
const show = (path = '/admin/ai-config?zoneId=zone-1') => render(<MemoryRouter initialEntries={[path]}><HistoryBack /><AiConfig /></MemoryRouter>);
async function create() { show(); fireEvent.click(await screen.findByRole('button', { name: 'Create configuration' })); await screen.findByRole('button', { name: 'Add rule' }); }
async function saveRule() { fireEvent.click(screen.getByRole('button', { name: 'Add rule' })); fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.'); }

describe('API-backed monitoring configuration', () => {
  beforeEach(() => {
    failDelete = false;
    config = null; writes = []; requests = []; failSave = false; ready = true; failLoad = false; multipleFloors = false; crowdCatalog = false;
    URL.createObjectURL = vi.fn(() => 'blob:zone-confidence'); URL.revokeObjectURL = vi.fn();
    saveSession({ accessToken: 'admin-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'admin', email: 'admin@example.test', fullName: 'Admin', roleId: 'role', role: 'ADMIN', status: 'ACTIVE' } }, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname; requests.push(String(input)); const method = init?.method ?? 'GET';
      if (method !== 'GET') writes.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : {}, bearer: new Headers(init?.headers).get('Authorization') });
      if (path === '/api/supermarkets') return json([{ supermarketId: 'store-1', code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (path === '/api/supermarkets/store-1/floors') {
        const floor = { floorId: 'floor-1', supermarketId: 'store-1', floorNumber: 1, name: 'Real floor', mapAssetUrl: null, mapWidth: null, mapHeight: null, status: 'ACTIVE' };
        return json(multipleFloors ? [floor, { ...floor, floorId: 'floor-2', floorNumber: 2, name: 'Upper floor' }] : [floor]);
      }
      if (path === '/api/floors/floor-1/zones') return json([zone]);
      if (path === '/api/floors/floor-2/zones') return json([{ ...zone, zoneId: 'zone-2', floorId: 'floor-2', name: 'Fresh food zone', code: 'FOOD' }]);
      if (path === '/api/incident-types') return json(crowdCatalog ? [crowdType] : [type]);
      if (path.endsWith('/ai-preview/start') || path.endsWith('/ai-preview/status')) return json({ cameraId: 'camera-1', state: 'LIVE', frameSequence: 1 });
      if (path.endsWith('/ai-preview/stop')) return json({ cameraId: 'camera-1', state: 'STOPPED', frameSequence: 0 });
      if (path.endsWith('/ai-preview/frame')) return new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } });
      if (path.endsWith('/review')) return json({ configuration: config, zone, cameras: [{ cameraId: 'camera-1', code: 'CAM-01', name: 'Phone', status: 'ACTIVE', mappingStatus: 'ACTIVE', roiPolygon: zone.mapPolygon, sourceType: 'RECORDED', protocol: 'FILE', isEnabled: true, lastTestResult: 'SUCCESS', lastTestedAt: '2026-10-03T00:00:00Z', ready: true, issues: [] }], issues: ready ? [] : [{ code: 'ROI_INVALID', message: 'Fix camera ROI before activation.' }], warnings: [], canActivate: ready });
      if (path.endsWith('/activate')) { config = { ...config, status: 'ACTIVE' }; return json(config); }
      if (path.endsWith('/deactivate')) { config = { ...config, status: 'INACTIVE' }; return json(config); }
      if (path.endsWith('/monitoring')) {
        if (method === 'DELETE') {
          if (failDelete) return json({ code: 'CONFIGURATION_CHANGED', detail: 'Configuration changed; reload before deleting.' }, 409);
          config = null; return new Response(null, { status: 204 });
        }
        if (method === 'GET' && failLoad) return json({ code: 'DATABASE_UNAVAILABLE', detail: 'Configuration could not be loaded.' }, 503);
        if (method === 'PUT') {
          if (failSave) return json({ code: 'DATABASE_CONFLICT', detail: 'Save failed; retry.' }, 409);
          config = { ...JSON.parse(String(init?.body)), configId: 'config-1', zoneId: zone.zoneId, status: 'DRAFT', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T01:00:00Z', createdByUserId: 'admin' };
        }
        return config && path.includes('/zone-1/') ? json(config) : json({ code: 'NOT_FOUND', detail: 'No configuration yet.' }, 404);
      }
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
  });

  it('opens an overview grouped by real floors with saved rules and no edit form', async () => {
    config = savedConfig('ACTIVE'); multipleFloors = true; show('/admin/ai-config');
    const lower = await screen.findByRole('region', { name: 'Floor 1: Real floor' });
    expect(within(lower).getByText('Queue monitoring')).toBeInTheDocument();
    expect(within(lower).getByText('Long Queue')).toBeInTheDocument();
    expect(within(lower).getByText('ACTIVE')).toBeInTheDocument();
    const upper = screen.getByRole('region', { name: 'Floor 2: Upper floor' });
    expect(within(upper).getByText('Not configured')).toBeInTheDocument();
    expect(screen.queryByLabelText('Configuration name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by floor'), { target: { value: 'floor-2' } });
    expect(screen.queryByRole('region', { name: 'Floor 1: Real floor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open AI configuration for Fresh food zone' })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('preserves legacy density until explicit count conversion with fresh thresholds', async () => {
    crowdCatalog = true;
    config = { ...savedConfig(), rules: [{ ...savedConfig().rules[0], incidentTypeId: 'crowd', incidentCode: crowdType.code, thresholdUnit: 'PEOPLE_PER_M2', warningThreshold: 2, criticalThreshold: 3, parametersJson: '{"custom":7}' }] };
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByLabelText('Overcrowding / Congestion unit')).toHaveValue('people/m²');
    expect(screen.getByLabelText('Overcrowding / Congestion enabled')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Overcrowding / Congestion enabled'));
    expect(screen.getByLabelText('Overcrowding / Congestion enabled')).toBeDisabled();
    expect(screen.getByLabelText('New people-count warning')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('New people-count warning'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('New people-count critical'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use people count (temporary)' }));
    expect(screen.getByLabelText('Overcrowding / Congestion unit')).toHaveValue('people');
    fireEvent.click(screen.getByLabelText('Overcrowding / Congestion enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved as Draft. Review it before activating.');
    const rule = (writes.find(w => w.method === 'PUT')!.body.rules as Record<string, unknown>[])[0];
    expect(rule).toMatchObject({ thresholdUnit: 'PEOPLE', warningThreshold: 1, criticalThreshold: 2, enabled: true });
    expect(JSON.parse(String(rule.parametersJson))).toEqual({ custom: 7, measurementMode: 'PEOPLE_COUNT' });
    expect(screen.getByRole('table')).toHaveTextContent('People count in ROI');
  });

  it('does not discard array parameters to convert a legacy rule', async () => {
    crowdCatalog = true;
    config = { ...savedConfig(), rules: [{ ...savedConfig().rules[0], incidentTypeId: 'crowd', incidentCode: crowdType.code, thresholdUnit: 'PEOPLE_PER_M2', parametersJson: '[1]' }] };
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('New people-count warning'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('New people-count critical'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use people count (temporary)' }));
    expect(screen.getByRole('alert')).toHaveTextContent('parameters');
    expect(writes).toHaveLength(0);
    expect(screen.getByLabelText('Overcrowding / Congestion unit')).toHaveValue('people/m²');
  });

  it('cancels deletion without writing, then deletes the displayed saved version and updates the overview', async () => {
    config = savedConfig(); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete configuration' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete AI configuration?' });
    expect(dialog).toHaveTextContent('Queue monitoring'); expect(dialog).toHaveTextContent('Actual queue zone');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(writes).toHaveLength(0); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete configuration' }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete configuration' }));
    await screen.findByText('Configuration deleted. This zone is now not configured.');
    expect(screen.getByRole('button', { name: 'Create configuration' })).toBeInTheDocument();
    expect(writes).toEqual([{ path: '/api/zones/zone-1/monitoring', method: 'DELETE', body: { configId: 'config-1', expectedUpdatedAt: '2026-10-03T01:00:00Z' }, bearer: 'Bearer admin-token' }]);
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
  });

  it('keeps the saved configuration when deletion fails and allows reload after cancellation', async () => {
    config = savedConfig(); failDelete = true; show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete configuration' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete configuration' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Configuration changed; reload before deleting.');
    expect(screen.queryByText('Configuration deleted. This zone is now not configured.')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Queue monitoring')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires deactivation before deleting and exposes activation as an explicit next step', async () => {
    config = savedConfig('ACTIVE'); show();
    expect(await screen.findByRole('button', { name: 'Delete configuration' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate configuration' }));
    await screen.findByRole('heading', { name: 'Configuration activation' });
    expect(screen.getByRole('button', { name: 'Review & activate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete configuration' })).toBeEnabled();
    expect(writes.filter(r => r.method === 'DELETE')).toHaveLength(0);
  });

  it('opens read-only detail, then Edit and Cancel discard input without an API write', async () => {
    config = savedConfig(); show('/admin/ai-config');
    fireEvent.click(await screen.findByRole('button', { name: 'Open AI configuration for Actual queue zone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Configuration name'), { target: { value: 'Unsaved change' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Configuration name')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Actual queue zone' })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByLabelText('Configuration name')).toHaveValue('Queue monitoring');
  });

  it('deep-links to saved detail without opening the editor', async () => {
    config = savedConfig(); show();
    await screen.findByRole('heading', { name: 'Actual queue zone' });
    expect(await screen.findByRole('table')).toHaveTextContent('Long Queue');
    expect(screen.queryByLabelText('Configuration name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save configuration' })).not.toBeInTheDocument();
  });

  it('requires adding an incident rule before saving and focuses the selector', async () => {
    await create(); fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one incident rule before saving');
    expect(screen.getByLabelText('Incident type')).toHaveFocus(); expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect(screen.queryByLabelText('Configuration name')).not.toBeInTheDocument();
  });

  it('rejects removing the last rule and Cancel preserves the saved rules', async () => {
    config = savedConfig(); show(); fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Long Queue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('table')).toHaveTextContent('Long Queue');
  });

  it('cancels creation and can return to the overview without saving', async () => {
    await create(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Create configuration' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    await screen.findByRole('button', { name: 'Open AI configuration for Actual queue zone' }); expect(writes).toHaveLength(0);
  });

  it('saves numeric rules with bearer and versioned review/activation', async () => {
    await create(); fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Detection confidence'), { target: { value: '0.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    const saved = writes.find(r => r.method === 'PUT')!;
    expect(saved.path).toBe('/api/zones/zone-1/monitoring'); expect(saved.bearer).toBe('Bearer admin-token'); expect(saved.body.confidenceThreshold).toBe(.7);
    expect(saved.body.rules).toEqual([{ incidentTypeId: 'type-1', warningThreshold: 3, criticalThreshold: 5, thresholdUnit: 'PEOPLE', sustainSec: 30, cooldownSec: 300, enabled: true, parametersJson: null }]);
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Activate configuration' }));
    await waitFor(() => expect(writes.some(r => r.path.endsWith('/activate'))).toBe(true));
    expect(writes.find(r => r.path.endsWith('/activate'))?.body).toEqual({ expectedUpdatedAt: '2026-10-03T01:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    expect(await screen.findByText('ACTIVE')).toBeInTheDocument();
  });

  it('preserves draft input and never claims a failed save succeeded', async () => {
    failSave = true; await create(); fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Configuration name'), { target: { value: 'Keep my edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Save failed; retry.');
    expect(screen.getByLabelText('Configuration name')).toHaveValue('Keep my edit');
    expect(screen.queryByText('Configuration saved as Draft. Review it before activating.')).not.toBeInTheDocument();
  });

  it('shows readiness blockers and does not allow activation', async () => {
    ready = false; await create(); await saveRule();
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('Fix camera ROI before activation.');
    expect(screen.getByRole('button', { name: 'Activate configuration' })).toBeDisabled(); expect(writes.some(r => r.path.endsWith('/activate'))).toBe(false);
  });

  it('does not overwrite an unknown existing configuration after a load failure', async () => {
    failLoad = true; show(); await screen.findByText('Configuration could not be loaded.');
    expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save configuration' })).not.toBeInTheDocument(); expect(writes).toHaveLength(0);
    failLoad = false; fireEvent.click(screen.getByRole('button', { name: 'Reload saved configuration' }));
    await screen.findByRole('button', { name: 'Create configuration' });
  });

  it('requires deactivate and explicit Edit before changing an active configuration', async () => {
    config = savedConfig('ACTIVE'); show();
    expect(await screen.findByRole('button', { name: 'Edit configuration' })).toBeDisabled();
    expect(screen.queryByLabelText('Detection confidence')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate configuration' }));
    await screen.findByText('Monitoring deactivated. Edit and save a new Draft before reactivation.');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByLabelText('Detection confidence')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    const saved = writes.find(r => r.method === 'PUT')!;
    expect(saved.body.expectedUpdatedAt).toBe('2026-10-03T01:00:00Z');
    expect((saved.body.rules as Record<string, unknown>[])[0].parametersJson).toBe('{}');
  });

  it('rejects invalid thresholds locally and clears review when Edit opens', async () => {
    await create(); fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Long Queue: warning must be less than critical.'); expect(writes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.queryByRole('button', { name: 'Activate configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review & activate' })).not.toBeInTheDocument();
  });

  it('keeps unsaved edits when leaving is cancelled and follows browser Back', async () => {
    config = savedConfig(); show('/admin/ai-config');
    fireEvent.click(await screen.findByRole('button', { name: 'Open AI configuration for Actual queue zone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Configuration name'), { target: { value: 'Pending draft' } });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    expect(screen.getByLabelText('Configuration name')).toHaveValue('Pending draft');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    await screen.findByRole('button', { name: 'Open AI configuration for Actual queue zone' });
  });

  it('does not silently choose another zone for a broken deep link', async () => {
    show('/admin/ai-config?zoneId=missing-zone'); await screen.findByText(/requested zone was not found/i);
    expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument(); expect(writes).toHaveLength(0);
  });

  it('tests saved zone confidence in annotated preview without activating', async () => {
    await create(); await saveRule(); fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Preview zone confidence: CAM-01' })); await screen.findByRole('img', { name: 'Tracked preview for camera' });
    expect(requests.some(url => url.endsWith('/ai-preview/start?zoneId=zone-1'))).toBe(true); expect(writes.some(r => r.path.endsWith('/activate'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Stop zone preview: CAM-01' })); await waitFor(() => expect(writes.some(r => r.path.endsWith('/ai-preview/stop'))).toBe(true));
  });
});

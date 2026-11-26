import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiConfig from './AiConfig';
import { saveSession } from '../auth/session';
import { mockNativeDialogs } from '../test/dialog';
mockNativeDialogs();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const zone = { zoneId: 'zone-1', floorId: 'floor-1', code: 'QUEUE', name: 'Actual queue zone', zoneType: 'QUEUE', mapPolygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], colorHex: '#123456', minStaff: 0, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z' };
const type = { eventTypeId: 'type-1', code: 'LONG_QUEUE', name: 'Long Queue', description: null, measurementType: 'QUEUE_LENGTH', status: 'ACTIVE', supported: true, thresholdUnit: 'PEOPLE', defaultWarningThreshold: 3, defaultCriticalThreshold: 5, unsupportedReason: null };
const savedConfig = (status = 'DRAFT') => ({ configId: 'config-1', zoneId: 'zone-1', name: 'Queue monitoring', confidenceThreshold: .6, status, updatedAt: '2026-10-03T01:00:00Z', rules: [{ ruleId: 'rule-1', eventTypeId: 'type-1', warningThreshold: 3, warningExitThreshold: 2, criticalThreshold: 5, criticalExitThreshold: 4, thresholdUnit: 'PEOPLE', sustainSec: 30, cooldownSec: 300, enabled: true, parametersJson: '{}' }] });
let config: Record<string, unknown> | null;
let writes: { path: string; method: string; body: Record<string, unknown>; bearer: string | null }[];
let failSave: boolean;
let failDelete: boolean;
let ready: boolean;
let failLoad: boolean;
let multipleFloors: boolean;
let requests: string[];
let crowdCatalog: boolean;
let densityCatalog: boolean;
let checkoutCatalog: boolean;
let checkoutZone: boolean;
let checkoutSupported: boolean;
let reviewedAreaM2: number | null;
let criticalTaskType: string | null;
const crowdType = { ...type, eventTypeId: 'crowd', code: 'CONGESTION', name: 'Overcrowding / Congestion', measurementType: 'PEOPLE_COUNT', supported: true, thresholdUnit: 'PEOPLE', defaultWarningThreshold: 3, defaultCriticalThreshold: 5, unsupportedReason: null, measurementOptions: [{ mode: 'PEOPLE_COUNT', unit: 'PEOPLE', supported: true, reason: null }] };
function HistoryBack() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Browser back</button>; }
const show = (path = '/admin/ai-config?zoneId=zone-1') => render(<MemoryRouter initialEntries={[path]}><HistoryBack /><AiConfig /></MemoryRouter>);
async function create() { show(); fireEvent.click(await screen.findByRole('button', { name: 'Create configuration' })); await screen.findByLabelText('Add a rule'); }
const chooseRule = (value = 'type-1') => fireEvent.change(screen.getByLabelText('Add a rule'), { target: { value } });
function setQueueExits() {
  fireEvent.change(screen.getByLabelText('Long Queue warning exit'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Long Queue critical exit'), { target: { value: '4' } });
}
async function saveRule() { chooseRule(); setQueueExits(); fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.'); }

describe('API-backed monitoring configuration', () => {
  beforeEach(() => {
    failDelete = false;
    config = null; writes = []; requests = []; failSave = false; ready = true; failLoad = false; multipleFloors = false; crowdCatalog = false; densityCatalog = false; checkoutCatalog = false; checkoutZone = true; checkoutSupported = false; reviewedAreaM2 = null; criticalTaskType = null;
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
      if (path === '/api/floors/floor-1/zones') return json([checkoutZone ? { ...zone, zoneType: 'CHECKOUT' } : zone]);
      if (path === '/api/floors/floor-2/zones') return json([{ ...zone, zoneId: 'zone-2', floorId: 'floor-2', name: 'Fresh food zone', code: 'FOOD' }]);
      if (path === '/api/operational-event-types/monitoring' && checkoutCatalog) return json([type,
        { ...type, eventTypeId: 'checkout', code: 'CHECKOUT_CAPACITY', name: 'Checkout Capacity Issue', measurementType: 'CHECKOUT_CAPACITY',
          supported: checkoutSupported, thresholdUnit: 'PEOPLE_PER_STAFFED_COUNTER', unsupportedReason: checkoutSupported ? null : 'Checkout AI is disabled in this environment.' },
        { ...type, eventTypeId: 'wait', code: 'EXCESSIVE_WAIT', name: 'Excessive Waiting Time', measurementType: 'WAITING_TIME',
          supported: checkoutSupported, thresholdUnit: 'MINUTES', defaultWarningThreshold: 4, defaultCriticalThreshold: 8,
          unsupportedReason: checkoutSupported ? null : 'Checkout AI is disabled in this environment.' },
      ]);
      if (path.endsWith('/checkout-counters')) return json([]);
      if (path.endsWith('/checkout-runtime')) return json({
        state: 'NOT_ACTIVE', queueCount: null, staffedCounterCount: null, queuePerStaffedCounter: null, maxWaitSeconds: null, counters: [],
      });
      if (path === '/api/operational-event-types/monitoring') return json(densityCatalog
        ? [{ ...crowdType, measurementOptions: [...crowdType.measurementOptions,
          { mode: 'CROWD_DENSITY', unit: 'PEOPLE_PER_M2', supported: true, reason: null, defaultWarning: 2, defaultCritical: 3 }] }]
        : crowdCatalog ? [crowdType] : [type]);
      if (path === '/api/task-types') return json([{ taskTypeId: 'task-1', code: 'TT-01', name: 'Open Additional Checkout' }]);
      if (path.includes('/rule-1/response-policies')) {
        if (method === 'PUT') criticalTaskType = JSON.parse(String(init?.body)).action.taskTypeCode;
        const warning = { policyId: 'policy-1', eventPriority: 'WARNING', isEnabled: true, version: 1,
          action: { isEnabled: true, targetRoleCode: 'OPERATOR' }, issues: ['CONFIGURATION_NOT_ACTIVE'] };
        const critical = { policyId: 'policy-1', eventPriority: 'CRITICAL', isEnabled: Boolean(criticalTaskType), version: criticalTaskType ? 2 : 1,
          action: criticalTaskType ? { isEnabled: true, taskTypeCode: criticalTaskType } : null,
          issues: criticalTaskType ? ['CONFIGURATION_NOT_ACTIVE'] : ['CONFIGURATION_NOT_ACTIVE', 'ACTION_MISSING'] };
        return json(method === 'PUT' ? critical : [warning, critical]);
      }
      if (path.endsWith('/ai-preview/start') || path.endsWith('/ai-preview/status')) return json({ cameraId: 'camera-1', state: 'LIVE', frameSequence: 1, viewerLeaseId: '00000000-0000-0000-0000-000000000099' });
      if (path.endsWith('/ai-preview/stop')) return json({ cameraId: 'camera-1', state: 'STOPPED', frameSequence: 0 });
      if (path.endsWith('/ai-preview/frame/next')) return new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg', 'X-Frame-Sequence': '1', 'X-Session-Id': '00000000-0000-0000-0000-000000000001' } });
      if (path.endsWith('/review')) return json({ configuration: config, zone: { ...zone, areaM2: reviewedAreaM2 }, cameras: [{ cameraId: 'camera-1', code: 'CAM-01', name: 'Phone', status: 'ACTIVE', mappingStatus: 'ACTIVE', roiPolygon: zone.mapPolygon, sourceType: 'RECORDED', protocol: 'FILE', isEnabled: true, lastTestResult: 'SUCCESS', lastTestedAt: '2026-10-03T00:00:00Z', ready: true, issues: [] }], issues: ready ? [] : [{ code: 'ROI_INVALID', message: 'Fix camera ROI before activation.' }], warnings: [], canActivate: ready });
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

  it('edits a saved response policy beside its rule and refreshes the review summary', async () => {
    config = savedConfig();
    show();

    await screen.findByRole('table', { name: 'Operational event rules' }, { timeout: 3000 });
    expect(screen.getByText('Enabled when active')).toBeInTheDocument();
    await screen.findByText(/Notify Operators/);
    expect(screen.getByText(/Action missing/)).toBeInTheDocument();
    const manage = screen.getByRole('button', { name: 'Manage response policy for Long Queue' });
    fireEvent.click(manage);
    const panel = screen.getByRole('complementary', { name: 'Response policy' });
    expect(panel).toHaveTextContent('Actual queue zone');
    expect(screen.getByRole('table', { name: 'Operational event rules' })).toBeVisible();
    const taskType = await within(panel).findByLabelText('Task type (required when enabled)');
    await waitFor(() => expect(taskType).toBeEnabled());
    fireEvent.click(within(panel).getByLabelText('Enable critical task dispatch'));
    fireEvent.change(taskType, { target: { value: 'TT-01' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save critical task dispatch' }));
    await within(panel).findByText('Critical task dispatch saved.');
    expect(writes).toContainEqual(expect.objectContaining({ method: 'PUT', path: '/api/monitoring-rules/rule-1/response-policies/CRITICAL' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('complementary', { name: 'Response policy' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' }));
    const review = await screen.findByRole('region', { name: 'Review & activate' });
    expect(await within(review).findByText(/Create TT-01/)).toBeInTheDocument();
  });

  it('offers no Congestion rule when the catalogue only supports people count', async () => {
    crowdCatalog = true;
    await create();
    const selector = screen.getByLabelText('Add a rule');
    expect(selector).toBeDisabled();
    expect(within(selector).queryByRole('option', { name: /Congestion/ })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('offers Long Queue, waiting and capacity rules only in checkout zones', async () => {
    checkoutCatalog = true; checkoutZone = false;
    await create();
    const picker = screen.getByLabelText('Add a rule');
    expect(within(picker).queryByRole('option', { name: /Long Queue|Checkout Capacity|Excessive Waiting/ })).not.toBeInTheDocument();
    chooseRule('checkout');
    expect(screen.queryByLabelText('Checkout Capacity Issue warning')).not.toBeInTheDocument();
  });

  it('shows Checkout measurements and explains why checkout-only rules are unavailable', async () => {
    checkoutCatalog = true; checkoutZone = true;
    show();
    expect(await screen.findByRole('heading', { name: 'Checkout measurements' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create configuration' }));
    const picker = screen.getByLabelText('Add a rule');
    expect(within(picker).getByRole('option', { name: /Excessive Waiting Time.*Unavailable/ })).toBeDisabled();
    expect(within(picker).getByRole('option', { name: /Checkout Capacity Issue.*Unavailable/ })).toBeDisabled();
    expect(screen.getByText('Excessive Waiting Time: Checkout AI is disabled in this environment.')).toBeInTheDocument();
  });

  it('saves a supported checkout waiting rule with minutes and explicit exit thresholds', async () => {
    checkoutCatalog = true; checkoutZone = true; checkoutSupported = true;
    await create();
    expect(within(screen.getByLabelText('Add a rule')).getByRole('option', { name: 'Excessive Waiting Time' })).toBeEnabled();
    chooseRule('wait');
    expect(screen.queryByLabelText('Excessive Waiting Time unit')).not.toBeInTheDocument();
    expect(screen.getByText(/Review requires.*Service ROI/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Excessive Waiting Time warning exit'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Excessive Waiting Time critical exit'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect(writes[0].body.rules).toEqual([expect.objectContaining({
      eventTypeId: 'wait', thresholdUnit: 'MINUTES', enabled: true, warningThreshold: 4, criticalThreshold: 8,
      warningExitThreshold: 3, criticalExitThreshold: 6,
    })]);
  });

  it('saves operator-entered capacity thresholds and the no-staffed-counter response', async () => {
    checkoutCatalog = true; checkoutZone = true; checkoutSupported = true;
    await create();
    chooseRule('checkout');
    expect(screen.getByLabelText('Checkout Capacity Issue warning')).toHaveValue(null);
    for (const [field, value] of [['warning', '3'], ['warning exit', '2'], ['critical', '5'], ['critical exit', '4']]) {
      fireEvent.change(screen.getByLabelText('Checkout Capacity Issue ' + field), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText('Minimum queue (people)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Alert when no counter is staffed'), { target: { value: 'CRITICAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect(writes[0].body.rules).toEqual([expect.objectContaining({
      eventTypeId: 'checkout', thresholdUnit: 'PEOPLE_PER_STAFFED_COUNTER', enabled: true,
      parametersJson: '{"minQueue":4,"noStaffedAlertLevel":"CRITICAL"}',
    })]);
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
    expect(screen.getByRole('heading', { name: 'Monitoring rules', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View rules for Fresh food zone' })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('saves an explicitly selected density rule with fractional thresholds and a clear duration', async () => {
    densityCatalog = true;
    await create();
    expect(within(screen.getByLabelText('Add a rule')).getAllByRole('option', { name: /Congestion/ })).toHaveLength(1);
    chooseRule('crowd:CROWD_DENSITY');
    const label = 'Overcrowding / Congestion';
    expect(screen.queryByLabelText(label + ' unit')).not.toBeInTheDocument();
    expect(screen.getByLabelText(label + ' warning')).toHaveValue(2);
    expect(screen.getByText(/Enter the measured zone area in Store layout/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(label + ' warning'), { target: { value: '0.60' } });
    fireEvent.change(screen.getByLabelText(label + ' warning exit'), { target: { value: '0.50' } });
    fireEvent.change(screen.getByLabelText(label + ' critical'), { target: { value: '1.00' } });
    fireEvent.change(screen.getByLabelText(label + ' critical exit'), { target: { value: '0.90' } });
    fireEvent.change(screen.getByLabelText(label + ' clear duration'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect(writes[0].body.rules).toEqual([expect.objectContaining({
      enabled: true, thresholdUnit: 'PEOPLE_PER_M2', warningThreshold: 0.60, warningExitThreshold: 0.50, criticalThreshold: 1.00, criticalExitThreshold: 0.90, clearDurationSec: 5,
    })]);
    expect(screen.getByText('Needs zone area')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set zone area in Store layout' })).toHaveAttribute('href', '/admin/store-layout?floorId=floor-1');
    fireEvent.click(screen.getByRole('button', { name: 'Review configuration' }));
    expect(await screen.findByRole('button', { name: 'Activate configuration' })).toBeDisabled();
    reviewedAreaM2 = 20;
    fireEvent.click(screen.getByRole('button', { name: 'Review configuration' }));
    expect(await screen.findByRole('button', { name: 'Activate configuration' })).toBeEnabled();
    expect(screen.queryByText('Needs zone area')).not.toBeInTheDocument();
  });

  it('shows a legacy density rule as unsupported instead of converting it implicitly', async () => {
    crowdCatalog = true;
    config = { ...savedConfig(), rules: [{ ...savedConfig().rules[0], eventTypeId: 'crowd', eventCode: crowdType.code, thresholdUnit: 'PEOPLE_PER_M2', warningThreshold: 2, criticalThreshold: 3, parametersJson: '{"custom":7}' }] };
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    expect(screen.queryByLabelText('Overcrowding / Congestion unit')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Overcrowding / Congestion enabled')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Overcrowding / Congestion enabled'));
    expect(screen.getByLabelText('Overcrowding / Congestion enabled')).toBeDisabled();
    expect(screen.getByText('Runtime unsupported')).toBeInTheDocument();
    expect(screen.queryByLabelText('New people-count warning')).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('keeps the measurement and thresholds of a previously saved people-count rule', async () => {
    densityCatalog = true;
    config = { ...savedConfig(), rules: [{ ...savedConfig().rules[0], eventTypeId: 'crowd', eventCode: crowdType.code }] };
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByText('People count')).toBeInTheDocument();
    expect(screen.queryByLabelText('Overcrowding / Congestion measurement')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Overcrowding / Congestion unit')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Overcrowding / Congestion warning')).toHaveValue(3);
    expect(writes).toHaveLength(0);
  });

  it('cancels deletion without writing, then deletes the displayed saved version and updates the overview', async () => {
    config = savedConfig(); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete configuration' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete monitoring configuration?' });
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
    fireEvent.click(await screen.findByRole('button', { name: 'View rules for Actual queue zone' }));
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

  it('requires adding an operational event rule before saving and focuses the selector', async () => {
    await create(); fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one operational event rule before saving');
    expect(screen.getByLabelText('Add a rule')).toHaveFocus(); expect(writes).toHaveLength(0);
    chooseRule();
    setQueueExits();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect(screen.queryByLabelText('Configuration name')).not.toBeInTheDocument();
  });

  it('rejects removing the last rule and Cancel preserves the saved rules', async () => {
    config = savedConfig(); show(); fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    const remove = screen.getByRole('button', { name: 'Remove Long Queue' });
    fireEvent.click(remove);
    let dialog = screen.getByRole('dialog', { name: 'Remove monitoring rule?' });
    expect(dialog).toHaveTextContent('Saving the configuration applies the removal');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove).toBeInTheDocument();
    fireEvent.click(remove);
    dialog = screen.getByRole('dialog', { name: 'Remove monitoring rule?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('table')).toHaveTextContent('Long Queue');
  });

  it('cancels creation and can return to the overview without saving', async () => {
    await create(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Create configuration' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    await screen.findByRole('button', { name: 'View rules for Actual queue zone' }); expect(writes).toHaveLength(0);
  });

  it('saves numeric rules with bearer and versioned review/activation', async () => {
    await create(); chooseRule(); setQueueExits();
    expect(screen.queryByLabelText('Long Queue unit')).not.toBeInTheDocument();
    expect(screen.queryByText(/All rules in this zone use this minimum AI score/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Detection confidence'), { target: { value: '0.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    const saved = writes.find(r => r.method === 'PUT')!;
    expect(saved.path).toBe('/api/zones/zone-1/monitoring'); expect(saved.bearer).toBe('Bearer admin-token'); expect(saved.body.confidenceThreshold).toBe(.7);
    expect(saved.body.rules).toEqual([{ eventTypeId: 'type-1', warningThreshold: 3, criticalThreshold: 5, thresholdUnit: 'PEOPLE', sustainSec: 30, cooldownSec: 300, clearDurationSec: 60, enabled: true, parametersJson: null, warningExitThreshold: 2, criticalExitThreshold: 4 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Activate configuration' }));
    await waitFor(() => expect(writes.some(r => r.path.endsWith('/activate'))).toBe(true));
    expect(writes.find(r => r.path.endsWith('/activate'))?.body).toEqual({ expectedUpdatedAt: '2026-10-03T01:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    expect(await screen.findByText('ACTIVE')).toBeInTheDocument();
  });

  it('preserves draft input and never claims a failed save succeeded', async () => {
    failSave = true; await create(); chooseRule(); setQueueExits();
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
    expect(screen.getByLabelText('Long Queue warning exit')).toHaveValue(2);
    expect(screen.getByLabelText('Long Queue critical exit')).toHaveValue(4);
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    const saved = writes.find(r => r.method === 'PUT')!;
    expect(saved.body.expectedUpdatedAt).toBe('2026-10-03T01:00:00Z');
    expect((saved.body.rules as Record<string, unknown>[])[0].parametersJson).toBe('{}');
  });

  it('requires both exit thresholds and rejects entries that equal their exits', async () => {
    await create(); chooseRule();
    const warningExit = screen.getByLabelText('Long Queue warning exit');
    const criticalExit = screen.getByLabelText('Long Queue critical exit');
    expect(warningExit).toHaveValue(null);
    expect(criticalExit).toHaveValue(null);
    expect(warningExit).toBeRequired();
    expect(criticalExit).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(warningExit).toHaveAccessibleDescription('Enter a threshold.');
    expect(criticalExit).toHaveAccessibleDescription('Enter a threshold.');
    await waitFor(() => expect(warningExit).toHaveFocus());
    fireEvent.change(warningExit, { target: { value: '3' } });
    fireEvent.change(criticalExit, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(warningExit).toHaveAccessibleDescription('Warning exit must be below Warning entry.');
    expect(criticalExit).toHaveAccessibleDescription('Critical exit must be above Warning entry and below Critical entry.');
    expect(writes).toHaveLength(0);
  });

  it('blocks activation of a saved legacy rule until its exit thresholds are updated', async () => {
    const saved = savedConfig();
    config = { ...saved, rules: saved.rules.map(rule => ({ ...rule, warningExitThreshold: null, criticalExitThreshold: rule.criticalThreshold })) };
    show();
    expect(await screen.findByText(/Edit and save valid Warning and Critical thresholds before activation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' }));
    expect(await screen.findByRole('button', { name: 'Activate configuration' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByLabelText('Long Queue warning exit')).toHaveValue(null);
    expect(screen.getByLabelText('Long Queue critical exit')).toHaveValue(5);
    setQueueExits();
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect(screen.queryByText(/Edit and save valid Warning and Critical thresholds before activation/)).not.toBeInTheDocument();
  });

  it('saves lower exit thresholds as a dead band and validates them locally', async () => {
    await create(); chooseRule();
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Long Queue critical'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Long Queue warning exit'), { target: { value: '11' } });
    const warningExit = screen.getByLabelText('Long Queue warning exit');
    expect(warningExit).toHaveAccessibleDescription('Warning exit must be below Warning entry.');
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await waitFor(() => expect(warningExit).toHaveFocus()); expect(writes).toHaveLength(0);
    fireEvent.change(warningExit, { target: { value: '0' } });
    expect(warningExit).toHaveAccessibleDescription('Use a value above 0 so the event can clear.');
    fireEvent.change(screen.getByLabelText('Long Queue warning exit'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Long Queue critical exit'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(screen.getByLabelText('Long Queue critical exit')).toHaveAccessibleDescription('Critical exit must be above Warning entry and below Critical entry.'); expect(writes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Long Queue critical exit'), { target: { value: '18' } });
    expect(within(screen.getByRole('group', { name: 'WARNING' })).getByText('8 ≤ x < 10')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'CRITICAL' })).getByText('18 ≤ x < 20')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    expect((writes.find(r => r.method === 'PUT')!.body.rules as unknown[])[0]).toMatchObject({ warningThreshold: 10, criticalThreshold: 20, warningExitThreshold: 8, criticalExitThreshold: 18 });
  });

  it('rejects invalid thresholds locally and clears review when Edit opens', async () => {
    await create(); chooseRule(); setQueueExits();
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '4' } });
    expect(screen.getByLabelText('Long Queue critical')).toHaveAccessibleDescription(/at least 2 people above Warning entry/);
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(screen.getByLabelText('Long Queue critical')).toHaveAccessibleDescription('Critical must be higher than warning.'); expect(writes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Long Queue warning'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' })); await screen.findByText('Configuration saved as Draft. Review it before activating.');
    fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.queryByRole('button', { name: 'Activate configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review & activate' })).not.toBeInTheDocument();
  });

  it('keeps unsaved edits when leaving is cancelled and follows browser Back', async () => {
    config = savedConfig(); show('/admin/ai-config');
    fireEvent.click(await screen.findByRole('button', { name: 'View rules for Actual queue zone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Configuration name'), { target: { value: 'Pending draft' } });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '‹ All zones' }));
    expect(screen.getByLabelText('Configuration name')).toHaveValue('Pending draft');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    await screen.findByRole('button', { name: 'View rules for Actual queue zone' });
  });

  it('does not silently choose another zone for a broken deep link', async () => {
    show('/admin/ai-config?zoneId=missing-zone'); await screen.findByText(/requested zone was not found/i);
    expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument(); expect(writes).toHaveLength(0);
  });

  it('tests saved zone confidence in annotated preview without activating', async () => {
    await create(); await saveRule(); fireEvent.click(screen.getByRole('button', { name: 'Review & activate' })); await screen.findByText('CAM-01');
    fireEvent.click(screen.getByRole('button', { name: 'Preview zone confidence: CAM-01' }));
    const preview = await screen.findByRole('img', { name: 'Tracked preview for camera' });
    Object.defineProperty(preview, 'naturalWidth', { configurable: true, value: 640 });
    Object.defineProperty(preview, 'naturalHeight', { configurable: true, value: 360 });
    fireEvent.load(preview);
    expect(screen.getByTestId('roi-overlay')).toBeInTheDocument();
    expect(requests.some(url => url.endsWith('/ai-preview/start?zoneId=zone-1'))).toBe(true); expect(writes.some(r => r.path.endsWith('/activate'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Stop zone preview: CAM-01' })); await waitFor(() => expect(writes.some(r => r.path.endsWith('/ai-preview/stop'))).toBe(true));
  });
});

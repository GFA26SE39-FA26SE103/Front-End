import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCameraPreview, type CameraRecord, type MapPoint, type ZoneRecord } from '../api/cameras';
import { ApiError } from '../api/client';
import {
  createCheckoutCounter, deleteCheckoutCounter, deleteCheckoutMapping, listCameraCheckoutMappings,
  listCheckoutCounters, listCounterCheckoutMappings, saveCheckoutMapping, updateCheckoutCounter,
  type CheckoutCounter, type CheckoutMapping,
} from '../api/checkout';
import { getMonitoring, type MonitoringConfiguration } from '../api/monitoring';
import type { PolygonRoiEditor } from './PolygonRoiEditor';
import { CheckoutCoverageEditor } from './CheckoutCoverageEditor';

vi.mock('../api/cameras', () => ({ getCameraPreview: vi.fn() }));
vi.mock('../api/monitoring', () => ({ getMonitoring: vi.fn() }));
vi.mock('../api/checkout', () => ({
  createCheckoutCounter: vi.fn(), updateCheckoutCounter: vi.fn(), deleteCheckoutCounter: vi.fn(),
  listCheckoutCounters: vi.fn(), listCameraCheckoutMappings: vi.fn(), listCounterCheckoutMappings: vi.fn(),
  saveCheckoutMapping: vi.fn(), deleteCheckoutMapping: vi.fn(),
}));

// Geometry gestures are covered by the shared editor's tests. Exercise this parent's draft/payload contract here.
vi.mock('./PolygonRoiEditor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./PolygonRoiEditor')>();
  return { ...actual, PolygonRoiEditor: ({ label, draft, onChange, backgroundRois, disabled }: ComponentProps<typeof PolygonRoiEditor>) => (
    <div aria-label={`${label} polygon editor`}>
      <output data-testid="active-draft">{JSON.stringify(draft)}</output>
      <output data-testid="background-rois">{JSON.stringify(backgroundRois)}</output>
      <button type="button" disabled={disabled} onClick={() => onChange({ points: label === 'Lane ROI' ? lane : label === 'Service ROI' ? service : staff, complete: true, editing: true })}>Complete {label}</button>
      <button type="button" disabled={disabled} onClick={() => onChange({ points: [{ x: 0, y: 0 }, { x: .5, y: .5 }, { x: 1, y: 1 }], complete: true, editing: true })}>Invalid {label}</button>
    </div>
  ) };
});

const version = '2026-11-11T10:15:30.1234567+07:00';
const nextVersion = '2026-11-11T10:15:31.7654321+07:00';
const lane: MapPoint[] = [{ x: 0, y: 0 }, { x: .2, y: 0 }, { x: 0, y: .2 }];
const staff: MapPoint[] = [{ x: .7, y: .7 }, { x: .9, y: .7 }, { x: .7, y: .9 }];
const service: MapPoint[] = [{ x: .1, y: .1 }, { x: .2, y: .1 }, { x: .1, y: .2 }];
const camera: CameraRecord = {
  cameraId: 'cam-1', floorId: 'floor-1', code: 'CAM-01', name: 'Checkout camera', manufacturer: null, model: null,
  serialNumber: null, installedAt: null, warrantyExpiresAt: null, mapX: null, mapY: null, mapRotationDeg: null,
  status: 'ACTIVE', healthStatus: 'ONLINE', lastSeenAt: null,
};
const zone: ZoneRecord = {
  zoneId: 'zone-1', floorId: 'floor-1', code: 'CHECKOUT-1', name: 'Checkout area', zoneType: 'CHECKOUT', mapPolygon: lane,
  colorHex: null, minStaff: 0, status: 'ACTIVE', updatedAt: version,
};
const zones: ZoneRecord[] = [zone, { ...zone, zoneId: 'zone-2', name: 'Other checkout' },
  { ...zone, zoneId: 'wrong-floor', floorId: 'floor-2', name: 'Upstairs checkout' },
  { ...zone, zoneId: 'aisle', zoneType: 'AISLES', name: 'Aisle' }];
const counter: CheckoutCounter = {
  checkoutCounterId: 'counter-1', zoneId: zone.zoneId, code: 'LANE-1', name: 'Lane one', isEnabled: false, createdAt: version, updatedAt: version,
};
const ownMapping: CheckoutMapping = {
  mappingId: 'mapping-1', cameraId: camera.cameraId, checkoutCounterId: counter.checkoutCounterId,
  laneRoi: lane, staffRoi: staff, serviceRoi: service, isEnabled: false, isQueueSource: false, createdAt: version, updatedAt: version,
};
let counters: CheckoutCounter[];
let mappings: CheckoutMapping[];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
async function chooseCounter(user: ReturnType<typeof userEvent.setup>, id = 'counter-1') {
  await user.selectOptions(screen.getByLabelText('Checkout zone'), zone.zoneId);
  await screen.findByRole('option', { name: /Lane one/ });
  await user.selectOptions(screen.getByLabelText('Checkout counter'), id);
  await waitFor(() => expect(screen.getByLabelText('Counter name')).toHaveValue(counters.find(c => c.checkoutCounterId === id)!.name));
}

describe('CheckoutCoverageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMonitoring).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No monitoring configuration.'));
    counters = [{ ...counter }, { ...counter, checkoutCounterId: 'counter-2', code: 'LANE-2', name: 'Lane two' }];
    mappings = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(getCameraPreview).mockResolvedValue(new Blob(['preview'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:checkout-preview');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(listCheckoutCounters).mockImplementation(async id => counters.filter(c => c.zoneId === id));
    vi.mocked(listCounterCheckoutMappings).mockImplementation(async id => mappings.filter(m => m.checkoutCounterId === id));
    vi.mocked(listCameraCheckoutMappings).mockImplementation(async id => mappings.filter(m => m.cameraId === id));
    vi.mocked(createCheckoutCounter).mockImplementation(async (id, request) => {
      const saved = { ...counter, code: request.code || 'CTR-GENERATED', name: request.name, isEnabled: Boolean(request.cameraId),
        checkoutCounterId: 'created-counter', zoneId: id, updatedAt: nextVersion };
      counters.push(saved);
      if (request.cameraId && request.laneRoi && request.staffRoi && request.serviceRoi)
        mappings.push({ ...ownMapping, mappingId: 'created-mapping', cameraId: request.cameraId,
          checkoutCounterId: saved.checkoutCounterId, laneRoi: request.laneRoi,
          staffRoi: request.staffRoi, serviceRoi: request.serviceRoi, isEnabled: true, isQueueSource: true });
      return saved;
    });
    vi.mocked(updateCheckoutCounter).mockImplementation(async (id, request) => {
      const saved = { ...counters.find(c => c.checkoutCounterId === id)!, ...request, updatedAt: nextVersion };
      counters = counters.map(c => c.checkoutCounterId === id ? saved : c);
      return saved;
    });
    vi.mocked(saveCheckoutMapping).mockImplementation(async (id, cameraId, request) => {
      const saved = { ...ownMapping, ...request, checkoutCounterId: id, cameraId, updatedAt: nextVersion };
      mappings = [...mappings.filter(m => !(m.checkoutCounterId === id && m.cameraId === cameraId)), saved];
      if (request.isEnabled) counters = counters.map(c => c.checkoutCounterId === id
        ? { ...c, isEnabled: true, updatedAt: nextVersion } : c);
      return saved;
    });
    vi.mocked(deleteCheckoutCounter).mockImplementation(async id => { counters = counters.filter(c => c.checkoutCounterId !== id); });
    vi.mocked(deleteCheckoutMapping).mockImplementation(async (id, cameraId) => { mappings = mappings.filter(m => !(m.checkoutCounterId === id && m.cameraId === cameraId)); });
  });

  it('creates an enabled counter only after drawing all three ROIs', async () => {
    const user = userEvent.setup();
    const dirty = vi.fn();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} onDirtyChange={dirty} />);
    expect(screen.queryByRole('option', { name: /Upstairs checkout|Aisle/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Checkout zone'), zone.zoneId);
    await screen.findByRole('option', { name: /Lane one/ });
    expect(screen.queryByLabelText('Counter enabled')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Counter code')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Counter name'), 'New lane');
    expect(dirty).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(createCheckoutCounter).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Complete Lane ROI' }));
    await user.click(screen.getByRole('button', { name: 'Edit Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Complete Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Edit Service ROI' }));
    await user.click(screen.getByRole('button', { name: 'Complete Service ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    await waitFor(() => expect(createCheckoutCounter).toHaveBeenCalledWith(zone.zoneId, {
      code: '', name: 'New lane', isEnabled: true, cameraId: camera.cameraId,
      laneRoi: lane, staffRoi: staff, serviceRoi: service,
    }));
    await waitFor(() => expect(screen.getByLabelText('Counter name')).toHaveValue('New lane'));
    expect(screen.queryByRole('link', { name: 'Configure checkout monitoring' })).not.toBeInTheDocument();
    expect(saveCheckoutMapping).not.toHaveBeenCalled();
  });

  it('requires all three ROIs and enables the counter without a queue-source choice', async () => {
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    expect(JSON.parse(screen.getByTestId('active-draft').textContent!)).toEqual({ points: [], complete: false, editing: false });
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Lane ROI.*close/i);
    await user.click(screen.getByRole('button', { name: 'Complete Lane ROI' }));
    await user.click(screen.getByRole('button', { name: 'Edit Staff ROI' }));
    expect(screen.getByTestId('background-rois')).toHaveTextContent('Lane ROI');
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Staff ROI.*close/i);
    await user.click(screen.getByRole('button', { name: 'Invalid Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(saveCheckoutMapping).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Complete Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Service ROI.*close/i);
    await user.click(screen.getByRole('button', { name: 'Edit Service ROI' }));
    await user.click(screen.getByRole('button', { name: 'Complete Service ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    await waitFor(() => expect(saveCheckoutMapping).toHaveBeenCalledWith('counter-1', 'cam-1', {
      laneRoi: lane, staffRoi: staff, serviceRoi: service, isEnabled: true, isQueueSource: true,
    }));
    expect(updateCheckoutCounter).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    await waitFor(() => expect(vi.mocked(saveCheckoutMapping).mock.calls[1][2].expectedUpdatedAt).toBe(nextVersion));
  });

  it('shows saved checkout ROIs but locks changes while checking and when monitoring is active', async () => {
    mappings = [{ ...ownMapping, serviceRoi: service, isEnabled: true, isQueueSource: true }];
    const pending = deferred<MonitoringConfiguration>();
    vi.mocked(getMonitoring).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);

    expect(screen.getByText('Checking monitoring status…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete Lane ROI' })).toBeDisabled();
    const config: MonitoringConfiguration = {
      configId: 'config-1', zoneId: zone.zoneId, name: 'Checkout monitoring', confidenceThreshold: .5,
      status: 'ACTIVE', createdByUserId: 'admin', createdAt: version, updatedAt: version, rules: [],
    };
    await act(async () => pending.resolve(config));

    expect(screen.getByText(/Monitoring is active/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Staff ROI' }));
    expect(JSON.parse(screen.getByTestId('active-draft').textContent!).points).toEqual(staff);
    expect(screen.getByTestId('background-rois')).toHaveTextContent('Lane ROI');
    expect(screen.getByTestId('background-rois')).toHaveTextContent('Service ROI');
    expect(screen.getByRole('button', { name: 'Complete Staff ROI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save checkout mapping' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save counter' })).toBeDisabled();

    vi.mocked(getMonitoring).mockResolvedValue({ ...config, status: 'INACTIVE' });
    await user.click(screen.getByRole('button', { name: 'Reload saved checkout data' }));
    expect(await screen.findByRole('button', { name: 'Edit Staff ROI' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save checkout mapping' })).toBeEnabled();
  });

  it('preserves the original exact mapping version and draft across 409 until an explicit reload', async () => {
    mappings = [{ ...ownMapping }];
    vi.mocked(saveCheckoutMapping).mockRejectedValue(new ApiError(409, 'CHECKOUT_CONFIGURATION_CHANGED', 'Configuration changed.'));
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByRole('button', { name: 'Edit Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Complete Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/draft.*kept/i);
    expect(screen.getByTestId('active-draft')).toHaveTextContent('complete');
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    await waitFor(() => expect(saveCheckoutMapping).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveCheckoutMapping).mock.calls.map(call => call[2].expectedUpdatedAt)).toEqual([version, version]);
    mappings = [{ ...ownMapping, updatedAt: nextVersion }];
    await user.click(screen.getByRole('button', { name: 'Reload saved checkout data' }));
    await waitFor(() => expect(screen.getByTestId('active-draft')).toHaveTextContent('complete'));
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    await waitFor(() => expect(vi.mocked(saveCheckoutMapping).mock.calls[2][2].expectedUpdatedAt).toBe(nextVersion));
  });

  it('does not suggest reloading when active monitoring blocks a save', async () => {
    mappings = [{ ...ownMapping }];
    vi.mocked(saveCheckoutMapping).mockRejectedValue(new ApiError(409, 'MONITORING_ACTIVE', 'Deactivate zone monitoring before changing checkout configuration.'));
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Pause zone monitoring/);
    expect(screen.queryByRole('button', { name: 'Reload saved checkout data' })).not.toBeInTheDocument();
  });

  it('uses the counter baseline token on rejected edits without overwriting its draft', async () => {
    vi.mocked(updateCheckoutCounter).mockRejectedValue(new ApiError(409, 'CHECKOUT_CONFIGURATION_CHANGED', 'Counter changed.'));
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.clear(screen.getByLabelText('Counter name'));
    await user.type(screen.getByLabelText('Counter name'), 'Edited name');
    await user.click(screen.getByRole('button', { name: 'Save counter' }));
    await screen.findByRole('alert');
    expect(updateCheckoutCounter).toHaveBeenCalledWith('counter-1', { code: 'LANE-1', name: 'Edited name', isEnabled: false, expectedUpdatedAt: version });
    expect(screen.getByLabelText('Counter name')).toHaveValue('Edited name');
    expect(listCheckoutCounters).toHaveBeenCalledTimes(2); // Zone load + explicit counter selection, no error auto-reload.
  });

  it('allows another camera to cover the same counter', async () => {
    mappings = [{ ...ownMapping }, { ...ownMapping, mappingId: 'other', cameraId: 'cam-2', isEnabled: true, isQueueSource: true }];
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    expect(mappings).toHaveLength(2);
    expect(screen.queryByText(/Camera cam-2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save coverage' }));
    await waitFor(() => expect(saveCheckoutMapping).toHaveBeenCalled());
    expect(deleteCheckoutMapping).not.toHaveBeenCalled();
  });

  it('does not show an enable toggle and allows deleting the last mapping', async () => {
    const user = userEvent.setup();
    const view = render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    expect(screen.queryByLabelText('Counter enabled')).not.toBeInTheDocument();
    view.unmount();
    counters[0] = { ...counter, isEnabled: true };
    mappings = [{ ...ownMapping, isEnabled: true, isQueueSource: true }];
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    expect(screen.queryByText(/Pause the counter/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete camera mapping' })).toBeEnabled();
  });

  it('confirms dirty counter switches, shows a failed switch, and retries without writing the previous counter', async () => {
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.type(screen.getByLabelText('Counter name'), ' edited');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.selectOptions(screen.getByLabelText('Checkout counter'), 'counter-2');
    expect(screen.getByLabelText('Checkout counter')).toHaveValue('counter-1');
    vi.mocked(listCounterCheckoutMappings).mockRejectedValueOnce(new ApiError(503, 'CHECKOUT_SCHEMA_NOT_READY', 'Checkout schema unavailable.'));
    await user.selectOptions(screen.getByLabelText('Checkout counter'), 'counter-2');
    expect(await screen.findByRole('alert')).toHaveTextContent(/503|unavailable/i);
    expect(screen.getByRole('button', { name: 'Save counter' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry checkout load' }));
    await waitFor(() => expect(screen.getByLabelText('Counter name')).toHaveValue('Lane two'));
    await user.click(screen.getByRole('button', { name: 'Save counter' }));
    await waitFor(() => expect(updateCheckoutCounter).toHaveBeenCalledWith('counter-2', expect.objectContaining({ expectedUpdatedAt: version })));
  });

  it('ignores a stale counter response after a newer selection has loaded', async () => {
    const pending = deferred<CheckoutMapping[]>();
    vi.mocked(listCounterCheckoutMappings).mockImplementation(id => id === 'counter-1' ? pending.promise : Promise.resolve([]));
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await user.selectOptions(screen.getByLabelText('Checkout zone'), zone.zoneId);
    await screen.findByRole('option', { name: /Lane one/ });
    await user.selectOptions(screen.getByLabelText('Checkout counter'), 'counter-1');
    await user.selectOptions(screen.getByLabelText('Checkout counter'), 'counter-2');
    await waitFor(() => expect(screen.getByLabelText('Counter name')).toHaveValue('Lane two'));
    await act(async () => pending.resolve([{ ...ownMapping }]));
    expect(screen.getByLabelText('Counter name')).toHaveValue('Lane two');
    expect(screen.getByLabelText('Checkout counter')).toHaveValue('counter-2');
  });

  it('reports mutation busy state and prevents duplicate writes or selection changes while saving', async () => {
    mappings = [{ ...ownMapping }];
    const pending = deferred<CheckoutMapping>();
    vi.mocked(saveCheckoutMapping).mockReturnValue(pending.promise);
    const busy = vi.fn();
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} onBusyChange={busy} />);
    await chooseCounter(user);
    fireEvent.click(screen.getByRole('button', { name: 'Save coverage' }));
    fireEvent.click(screen.getByRole('button', { name: /Save coverage|Saving/ }));
    expect(saveCheckoutMapping).toHaveBeenCalledTimes(1);
    expect(busy).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Checkout zone')).toBeDisabled();
    await act(async () => pending.resolve({ ...ownMapping, updatedAt: nextVersion }));
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
  });

  it('deletes a disabled counter with its exact token only after confirming all-camera mappings', async () => {
    mappings = [{ ...ownMapping }, { ...ownMapping, mappingId: 'other', cameraId: 'cam-2' }];
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByRole('button', { name: 'Delete counter' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/all 2 camera mappings.*other cameras/i));
    await waitFor(() => expect(deleteCheckoutCounter).toHaveBeenCalledWith('counter-1', version));
    expect(counters.map(c => c.checkoutCounterId)).toEqual(['counter-2']);
  });

  it('deletes only this camera mapping and keeps other-camera coverage saved', async () => {
    mappings = [{ ...ownMapping }, { ...ownMapping, mappingId: 'other', cameraId: 'cam-2' }];
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByRole('button', { name: 'Delete camera mapping' }));
    await waitFor(() => expect(deleteCheckoutMapping).toHaveBeenCalledWith('counter-1', 'cam-1', version));
    expect(mappings).toEqual([expect.objectContaining({ cameraId: 'cam-2' })]);
    expect(deleteCheckoutCounter).not.toHaveBeenCalled();
  });
});

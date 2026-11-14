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
import type { PolygonRoiEditor } from './PolygonRoiEditor';
import { CheckoutCoverageEditor } from './CheckoutCoverageEditor';

vi.mock('../api/cameras', () => ({ getCameraPreview: vi.fn() }));
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
  laneRoi: lane, staffRoi: staff, isEnabled: false, isQueueSource: false, createdAt: version, updatedAt: version,
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
  await screen.findByRole('option', { name: /LANE-1/ });
  await user.selectOptions(screen.getByLabelText('Checkout counter'), id);
  await waitFor(() => expect(screen.getByLabelText('Counter code')).toHaveValue(counters.find(c => c.checkoutCounterId === id)!.code));
}

describe('CheckoutCoverageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const saved = { ...counter, ...request, checkoutCounterId: 'created-counter', zoneId: id, updatedAt: nextVersion };
      counters.push(saved);
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
      return saved;
    });
    vi.mocked(deleteCheckoutCounter).mockImplementation(async id => { counters = counters.filter(c => c.checkoutCounterId !== id); });
    vi.mocked(deleteCheckoutMapping).mockImplementation(async (id, cameraId) => { mappings = mappings.filter(m => !(m.checkoutCounterId === id && m.cameraId === cameraId)); });
  });

  it('lists only same-floor CHECKOUT zones and creates a counter disabled before any mapping', async () => {
    const user = userEvent.setup();
    const dirty = vi.fn();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} onDirtyChange={dirty} />);
    expect(screen.queryByRole('option', { name: /Upstairs checkout|Aisle/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Checkout zone'), zone.zoneId);
    await screen.findByRole('option', { name: /LANE-1/ });
    expect(screen.getByLabelText('Counter enabled')).toBeDisabled();
    await user.type(screen.getByLabelText('Counter code'), 'LANE-NEW');
    await user.type(screen.getByLabelText('Counter name'), 'New lane');
    expect(dirty).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Create disabled counter' }));
    await waitFor(() => expect(createCheckoutCounter).toHaveBeenCalledWith(zone.zoneId, { code: 'LANE-NEW', name: 'New lane', isEnabled: false }));
    await waitFor(() => expect(screen.getByLabelText('Counter code')).toHaveValue('LANE-NEW'));
    expect(screen.getByRole('link', { name: 'Configure checkout monitoring' })).toHaveAttribute('href', '/admin/ai-config?zoneId=zone-1');
    expect(saveCheckoutMapping).not.toHaveBeenCalled();
  });

  it('requires Service ROI for the queue source and permits independent lane/staff geometry', async () => {
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    expect(JSON.parse(screen.getByTestId('active-draft').textContent!)).toEqual({ points: [], complete: false, editing: false });
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Lane ROI.*close/i);
    await user.click(screen.getByRole('button', { name: 'Complete Lane ROI' }));
    await user.click(screen.getByRole('button', { name: 'Edit Staff ROI' }));
    expect(screen.getByTestId('background-rois')).toHaveTextContent('Lane ROI');
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Staff ROI.*close/i);
    await user.click(screen.getByRole('button', { name: 'Invalid Staff ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(saveCheckoutMapping).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Complete Staff ROI' }));
    await user.click(screen.getByLabelText('Mapping enabled'));
    await user.click(screen.getByLabelText('Use as queue source'));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Service ROI.*close/i);
    await user.click(screen.getByRole('button', { name: 'Edit Service ROI' }));
    await user.click(screen.getByRole('button', { name: 'Complete Service ROI' }));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    await waitFor(() => expect(saveCheckoutMapping).toHaveBeenCalledWith('counter-1', 'cam-1', {
      laneRoi: lane, staffRoi: staff, serviceRoi: service, isEnabled: true, isQueueSource: true,
    }));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    await waitFor(() => expect(vi.mocked(saveCheckoutMapping).mock.calls[1][2].expectedUpdatedAt).toBe(nextVersion));
  });

  it('preserves the original exact mapping version and draft across 409 until an explicit reload', async () => {
    mappings = [{ ...ownMapping }];
    vi.mocked(saveCheckoutMapping).mockRejectedValue(new ApiError(409, 'CHECKOUT_CONFIGURATION_CHANGED', 'Configuration changed.'));
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByLabelText('Mapping enabled'));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/draft.*kept/i);
    expect(screen.getByLabelText('Mapping enabled')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    await waitFor(() => expect(saveCheckoutMapping).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveCheckoutMapping).mock.calls.map(call => call[2].expectedUpdatedAt)).toEqual([version, version]);
    mappings = [{ ...ownMapping, updatedAt: nextVersion }];
    await user.click(screen.getByRole('button', { name: 'Reload saved checkout data' }));
    await waitFor(() => expect(screen.getByLabelText('Mapping enabled')).not.toBeChecked());
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    await waitFor(() => expect(vi.mocked(saveCheckoutMapping).mock.calls[2][2].expectedUpdatedAt).toBe(nextVersion));
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

  it('blocks a duplicate queue source on another camera and explains the manual switch', async () => {
    mappings = [{ ...ownMapping }, { ...ownMapping, mappingId: 'other', cameraId: 'cam-2', isEnabled: true, isQueueSource: true }];
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    expect(screen.getByText(/To switch manually/)).toHaveTextContent('cam-2');
    await user.click(screen.getByLabelText('Mapping enabled'));
    await user.click(screen.getByLabelText('Use as queue source'));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/another camera|one enabled queue source/i);
    expect(saveCheckoutMapping).not.toHaveBeenCalled();
    expect(updateCheckoutCounter).not.toHaveBeenCalled();
    expect(deleteCheckoutMapping).not.toHaveBeenCalled();
  });

  it('requires a saved queue source before counter enable and protects the last source of an enabled counter', async () => {
    const user = userEvent.setup();
    const view = render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByLabelText('Counter enabled'));
    await user.click(screen.getByRole('button', { name: 'Save counter' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/exactly one enabled queue source/i);
    expect(updateCheckoutCounter).not.toHaveBeenCalled();
    view.unmount();
    counters[0] = { ...counter, isEnabled: true };
    mappings = [{ ...ownMapping, isEnabled: true, isQueueSource: true }];
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByLabelText('Use as queue source'));
    await user.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Disable the counter/i);
    expect(saveCheckoutMapping).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete camera mapping' })).toBeDisabled();
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
    await waitFor(() => expect(screen.getByLabelText('Counter code')).toHaveValue('LANE-2'));
    await user.click(screen.getByRole('button', { name: 'Save counter' }));
    await waitFor(() => expect(updateCheckoutCounter).toHaveBeenCalledWith('counter-2', expect.objectContaining({ expectedUpdatedAt: version })));
  });

  it('ignores a stale counter response after a newer selection has loaded', async () => {
    const pending = deferred<CheckoutMapping[]>();
    vi.mocked(listCounterCheckoutMappings).mockImplementation(id => id === 'counter-1' ? pending.promise : Promise.resolve([]));
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await user.selectOptions(screen.getByLabelText('Checkout zone'), zone.zoneId);
    await screen.findByRole('option', { name: /LANE-1/ });
    await user.selectOptions(screen.getByLabelText('Checkout counter'), 'counter-1');
    await user.selectOptions(screen.getByLabelText('Checkout counter'), 'counter-2');
    await waitFor(() => expect(screen.getByLabelText('Counter code')).toHaveValue('LANE-2'));
    await act(async () => pending.resolve([{ ...ownMapping }]));
    expect(screen.getByLabelText('Counter code')).toHaveValue('LANE-2');
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
    fireEvent.click(screen.getByRole('button', { name: 'Save checkout mapping' }));
    fireEvent.click(screen.getByRole('button', { name: /Save checkout mapping|Saving/ }));
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

  it('deletes only this camera mapping and keeps other-camera coverage visible', async () => {
    mappings = [{ ...ownMapping }, { ...ownMapping, mappingId: 'other', cameraId: 'cam-2' }];
    const user = userEvent.setup();
    render(<CheckoutCoverageEditor camera={camera} zones={zones} />);
    await chooseCounter(user);
    await user.click(screen.getByRole('button', { name: 'Delete camera mapping' }));
    await waitFor(() => expect(deleteCheckoutMapping).toHaveBeenCalledWith('counter-1', 'cam-1', version));
    expect(screen.getByText(/Camera cam-2/)).toBeInTheDocument();
    expect(deleteCheckoutCounter).not.toHaveBeenCalled();
  });
});

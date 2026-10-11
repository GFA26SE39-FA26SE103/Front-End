import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCameraPreview, listCameraMappings, listCameras, updateCamera } from '../api/cameras';
import { createFloor, createZone, getFloorMap, listFloors, listSupermarkets, listZones, updateFloorDetails, updateZone, uploadFloorMap } from '../api/floors';
import StoreLayout from './StoreLayout';
import { ApiError } from '../api/client';
import { mockNativeDialogs } from '../test/dialog';
mockNativeDialogs();

vi.mock('../api/cameras', () => ({
  getCameraPreview: vi.fn(),
  listCameraMappings: vi.fn(),
  listCameras: vi.fn(),
  removeCameraMapping: vi.fn(),
  saveCameraMapping: vi.fn(),
  updateCamera: vi.fn(),
}));

vi.mock('../api/floors', () => ({
  createFloor: vi.fn(),
  createZone: vi.fn(),
  getFloorMap: vi.fn(),
  listFloors: vi.fn(),
  listSupermarkets: vi.fn(),
  listZones: vi.fn(),
  updateZone: vi.fn(),
  updateFloorDetails: vi.fn(),
  uploadFloorMap: vi.fn(),
}));

const floor = {
  floorId: 'floor-1',
  supermarketId: 'store-1',
  floorNumber: 1,
  name: 'Ground floor',
  mapAssetUrl: 'http://api.test/api/floors/floor-1/map?v=one.png',
  mapWidth: 1200,
  mapHeight: 800,
  status: 'ACTIVE',
};

const camera = {
  cameraId: 'camera-1',
  floorId: 'floor-1',
  code: 'CAM-01',
  name: 'Entrance camera',
  manufacturer: 'Acme',
  model: 'Vision',
  serialNumber: 'SN-1',
  installedAt: '2026-10-01T00:00:00Z',
  warrantyExpiresAt: '2027-10-01T00:00:00Z',
  mapX: 0.25,
  mapY: 0.5,
  mapRotationDeg: 0,
  status: 'ACTIVE',
  healthStatus: 'ONLINE',
  lastSeenAt: null,
};

const renderPage = (path = '/admin/store-layout') => render(<MemoryRouter initialEntries={[path]}><StoreLayout /></MemoryRouter>);

describe('StoreLayout', () => {
  beforeEach(() => {
    vi.mocked(listSupermarkets).mockResolvedValue([{ supermarketId: 'store-1', code: 'STORE', name: 'Central store', address: null, status: 'ACTIVE' }]);
    vi.mocked(listFloors).mockResolvedValue([floor]);
    vi.mocked(createFloor).mockResolvedValue({ ...floor, floorId: 'floor-2', floorNumber: 2, name: 'Upper floor', mapAssetUrl: null, mapWidth: null, mapHeight: null });
    vi.mocked(updateFloorDetails).mockResolvedValue({ ...floor, floorNumber: 0, name: 'Lobby' });
    vi.mocked(listZones).mockResolvedValue([]);
    vi.mocked(listCameras).mockResolvedValue([camera]);
    vi.mocked(listCameraMappings).mockResolvedValue([]);
    vi.mocked(getCameraPreview).mockResolvedValue(new Blob(['preview'], { type: 'image/jpeg' }));
    vi.mocked(getFloorMap).mockResolvedValue(new Blob(['map'], { type: 'image/png' }));
    vi.mocked(uploadFloorMap).mockResolvedValue({
      floorId: floor.floorId,
      mapUrl: 'http://api.test/api/floors/floor-1/map?v=two.png',
      mapWidth: 1200,
      mapHeight: 800,
      contentType: 'image/png',
      updatedAt: '2026-10-03T00:00:00Z',
    });
    vi.mocked(updateCamera).mockResolvedValue({ ...camera, mapX: 0.26 });
    vi.mocked(createZone).mockResolvedValue({
      zoneId: 'zone-1', floorId: floor.floorId, code: 'PRODUCE', name: 'Produce', zoneType: null,
      mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }],
      colorHex: '#22C55E', areaM2: null, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
    });
    vi.mocked(updateZone).mockRejectedValue(new Error('Unexpected zone update'));
    URL.createObjectURL = vi.fn(() => 'blob:floor-map');
    URL.revokeObjectURL = vi.fn();
  });

  it('loads real floor, zone, camera, and authenticated map data', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ground floor' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /uploaded floor plan/i })).toHaveAttribute('src', 'blob:floor-map');
    expect(screen.getByRole('button', { name: /place cam-01/i })).toBeInTheDocument();
    expect(listZones).toHaveBeenCalledWith('floor-1', expect.any(AbortSignal));
    expect(listCameras).toHaveBeenCalledWith('floor-1', expect.any(AbortSignal));
  });

  it('creates the first floor, selects it and offers floor-plan upload', async () => {
    vi.mocked(listFloors).mockResolvedValue([]);
    vi.mocked(listCameras).mockResolvedValue([]);
    const user = userEvent.setup(); renderPage();
    await screen.findByText('No floors yet. Create the first floor, then upload its floor plan.');
    await user.click(screen.getByRole('button', { name: 'Create floor' }));
    const dialog = screen.getByRole('dialog', { name: 'Create floor' });
    expect(within(dialog).getByLabelText('Floor name')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Floor name'), 'Upper floor');
    fireEvent.change(within(dialog).getByLabelText('Floor number'), { target: { value: '2' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create floor' }));
    await screen.findByText('Floor created. Upload its floor plan to continue setup.');
    expect(createFloor).toHaveBeenCalledWith('store-1', { name: 'Upper floor', floorNumber: 2 }, expect.any(AbortSignal));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upper floor.*Floor 2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Upload floor plan')).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Upper floor' })).toBeInTheDocument();
  });

  it('edits floor details and keeps the map and loaded cameras', async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });
    await user.click(screen.getByRole('button', { name: 'Edit floor' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit floor' });
    await user.clear(within(dialog).getByLabelText('Floor name'));
    await user.type(within(dialog).getByLabelText('Floor name'), 'Lobby');
    fireEvent.change(within(dialog).getByLabelText('Floor number'), { target: { value: '0' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save floor' }));
    await screen.findByText('Floor details updated.');
    expect(updateFloorDetails).toHaveBeenCalledWith('floor-1', { name: 'Lobby', floorNumber: 0 }, expect.any(AbortSignal));
    expect(screen.getByRole('heading', { name: 'Lobby' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /uploaded floor plan/i })).toHaveAttribute('src', 'blob:floor-map');
    expect(screen.getByRole('button', { name: /CAM-01 Entrance camera/i })).toBeInTheDocument();
    expect(getFloorMap).toHaveBeenCalledTimes(1);
  });

  it('cancels floor editing and retains input after duplicate-number rejection', async () => {
    vi.mocked(updateFloorDetails).mockRejectedValueOnce(new ApiError(409, 'DUPLICATE', 'Duplicate resource.'));
    const user = userEvent.setup(); renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });
    await user.click(screen.getByRole('button', { name: 'Edit floor' }));
    let dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Floor name')); await user.type(within(dialog).getByLabelText('Floor name'), 'Pending');
    await user.click(within(dialog).getByRole('button', { name: 'Save floor' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This floor number already exists.');
    expect(within(dialog).getByLabelText('Floor name')).toHaveValue('Pending');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Ground floor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit floor' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Edit floor' })); dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Floor name')).toHaveValue('Ground floor');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(updateFloorDetails).toHaveBeenCalledTimes(1);
  });

  it('rejects missing names and fractional floor numbers without sending requests', async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });
    await user.click(screen.getByRole('button', { name: 'Create floor' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create floor' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Floor name is required.');
    await user.type(within(dialog).getByLabelText('Floor name'), 'Upper');
    fireEvent.change(within(dialog).getByLabelText('Floor number'), { target: { value: '1.5' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create floor' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a whole floor number.');
    expect(createFloor).not.toHaveBeenCalled();
  });

  it('blocks floor creation when the default seed is missing or placement has unsaved changes', async () => {
    vi.mocked(listSupermarkets).mockResolvedValueOnce([]);
    const view = renderPage();
    await screen.findByText(/default store seed is missing/i);
    expect(screen.getByRole('button', { name: 'Create floor' })).toBeDisabled(); view.unmount();
    renderPage();
    fireEvent.keyDown(await screen.findByRole('button', { name: /place cam-01/i }), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Create floor' })).toBeDisabled();
    expect(screen.getByText('Finish the current camera or zone edits before changing floors.')).toBeInTheDocument();
  });

  it('opens the requested floor and camera from a dashboard action', async () => {
    const upperFloor = { ...floor, floorId: 'floor-2', floorNumber: 2, name: 'Upper floor' };
    const target = { ...camera, cameraId: 'camera-2', floorId: 'floor-2', code: 'CAM-02', name: 'Upper aisle' };
    vi.mocked(listFloors).mockResolvedValue([floor, upperFloor]);
    vi.mocked(listCameras).mockImplementation(async id => id === 'floor-2' ? [target] : [camera]);
    renderPage('/admin/store-layout?floorId=floor-2&cameraId=camera-2');

    await screen.findByRole('heading', { name: 'Upper floor' });
    expect(await screen.findByRole('heading', { name: 'Camera placement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CAM-02 Upper aisle/i })).toHaveAttribute('aria-pressed', 'true');
    expect(listZones).toHaveBeenCalledWith('floor-2', expect.any(AbortSignal));
    expect(listCameras).not.toHaveBeenCalledWith('floor-1', expect.any(AbortSignal));
    expect(getFloorMap).toHaveBeenCalledWith('floor-2', expect.any(AbortSignal));
  });

  it('rejects a requested camera outside the selected floor and allows manual selection', async () => {
    const user = userEvent.setup();
    renderPage('/admin/store-layout?floorId=floor-1&cameraId=other-floor-camera');

    expect(await screen.findByRole('alert')).toHaveTextContent('The requested camera was not found on this floor.');
    expect(screen.queryByRole('heading', { name: 'Camera placement' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /CAM-01 Entrance camera/i }));
    expect(screen.getByRole('heading', { name: 'Camera placement' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows camera placement only after a camera is selected and hides it for zone editing', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });

    expect(screen.queryByRole('heading', { name: 'Camera placement' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /CAM-01 Entrance camera/i }));
    expect(screen.getByRole('heading', { name: 'Camera placement' })).toBeInTheDocument();
    expect(screen.getByText('Drag the camera to position it. Drag its direction handle to rotate.')).toBeInTheDocument();
    expect(screen.queryByText('Normalized coordinates persist across screen sizes')).not.toBeInTheDocument();
    expect(screen.queryByText('X position')).not.toBeInTheDocument();
    expect(screen.queryByText('Y position')).not.toBeInTheDocument();
    expect(screen.queryByText('Direction')).not.toBeInTheDocument();
    expect(screen.queryByText(/Arrow keys move the selected camera/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving placement does not test/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit zones' }));
    expect(screen.queryByRole('heading', { name: 'Camera placement' })).not.toBeInTheDocument();
  });

  it('opens camera coverage for the selected camera using zones from its floor', async () => {
    vi.mocked(listZones).mockResolvedValueOnce([{
      zoneId: 'zone-1', floorId: floor.floorId, code: 'FROZEN', name: 'Frozen aisle', zoneType: 'AISLES',
      mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      colorHex: '#3B82F6', areaM2: null, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
    }]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });

    await user.click(screen.getByRole('button', { name: /CAM-01 Entrance camera/i }));
    await user.click(screen.getByRole('button', { name: 'Configure coverage' }));

    expect(await screen.findByRole('heading', { name: 'Camera coverage' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Frozen aisle (FROZEN)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Camera placement' })).not.toBeInTheDocument();
  });

  it('adds an already registered camera to the map instead of registering a new one', async () => {
    const spare = { ...camera, cameraId: 'camera-2', code: 'CAM-02', name: 'Spare camera', mapX: null, mapY: null, mapRotationDeg: null };
    vi.mocked(listCameras).mockResolvedValue([camera, spare]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });

    expect(screen.queryByRole('button', { name: /place cam-02 at/i })).not.toBeInTheDocument();
    expect(screen.getByText('Not on map')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    expect(screen.getByRole('heading', { name: 'Add camera to map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /place cam-01 entrance camera on the map/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register it on the Cameras page' })).toHaveAttribute('href', '/admin/cameras');
    expect(screen.queryByLabelText(/camera code/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /place cam-02 spare camera on the map/i }));

    expect(screen.queryByRole('heading', { name: 'Add camera to map' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place CAM-02 at 50%, 50%' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Camera placement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save placement' })).toBeEnabled();
  });

  it('says so when every camera on the floor is already on the map', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });

    await user.click(screen.getByRole('button', { name: 'Add camera' }));

    expect(screen.getByText('Every camera registered on this floor is already on the map.')).toBeInTheDocument();
  });

  it('uploads a replacement floor plan and refreshes its blob', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });
    const replacement = new File(['new-map'], 'replacement.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Upload floor plan'), replacement);

    await waitFor(() => expect(uploadFloorMap).toHaveBeenCalledWith('floor-1', replacement));
    await waitFor(() => expect(getFloorMap).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Floor plan uploaded.')).toBeInTheDocument();
  });

  it('keeps a placement dirty until the complete camera update succeeds', async () => {
    const user = userEvent.setup();
    renderPage();
    const sprite = await screen.findByRole('button', { name: /place cam-01/i });

    fireEvent.keyDown(sprite, { key: 'ArrowRight' });
    expect(screen.getAllByText('Unsaved').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Save placement' }));

    await waitFor(() => expect(updateCamera).toHaveBeenCalledWith('camera-1', {
      code: camera.code,
      name: camera.name,
      manufacturer: camera.manufacturer,
      model: camera.model,
      serialNumber: camera.serialNumber,
      installedAt: camera.installedAt,
      warrantyExpiresAt: camera.warrantyExpiresAt,
      mapX: 0.26,
      mapY: 0.5,
      mapRotationDeg: 0,
      status: 'ACTIVE',
    }));
    await waitFor(() => expect(screen.queryByText('Unsaved')).not.toBeInTheDocument());
  });

  it('keeps the edited placement visible when saving fails', async () => {
    vi.mocked(updateCamera).mockRejectedValueOnce(new Error('Network unavailable'));
    const user = userEvent.setup();
    renderPage();
    fireEvent.keyDown(await screen.findByRole('button', { name: /place cam-01/i }), { key: 'ArrowRight' });

    await user.click(screen.getByRole('button', { name: 'Save placement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getAllByText('Unsaved').length).toBeGreaterThan(0);
  });

  it('opens the zone overlay and saves a dragged rectangle', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('img', { name: /uploaded floor plan/i });
    await user.click(screen.getByRole('button', { name: 'Edit zones' }));
    const layer = screen.getByTestId('zone-drawing-layer');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, width: 800, height: 400, right: 900, bottom: 450, x: 100, y: 50, toJSON: () => ({}),
    });
    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    fireEvent.pointerDown(layer, { pointerId: 4, clientX: 180, clientY: 90 });
    fireEvent.pointerMove(layer, { pointerId: 4, clientX: 500, clientY: 250 });
    fireEvent.pointerUp(layer, { pointerId: 4, clientX: 500, clientY: 250 });
    await user.type(screen.getByLabelText('Zone name'), 'Produce');
    await user.selectOptions(screen.getByLabelText('Zone type'), 'FRESH_FOOD');
    await user.click(screen.getByRole('button', { name: 'Green' }));
    await user.click(screen.getByRole('button', { name: 'Save zone' }));

    await waitFor(() => expect(createZone).toHaveBeenCalledWith('floor-1', {
      code: 'PRODUCE', name: 'Produce', zoneType: 'FRESH_FOOD', colorHex: '#22C55E', areaM2: null, status: 'ACTIVE',
      mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }],
    }));
    expect(await screen.findByText('Zone saved.')).toBeInTheDocument();
  });
});

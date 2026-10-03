import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listCameras, updateCamera } from '../api/cameras';
import { getFloorMap, listFloors, listSupermarkets, listZones, uploadFloorMap } from '../api/floors';
import StoreLayout from './StoreLayout';

vi.mock('../api/cameras', () => ({
  listCameras: vi.fn(),
  updateCamera: vi.fn(),
}));

vi.mock('../api/floors', () => ({
  getFloorMap: vi.fn(),
  listFloors: vi.fn(),
  listSupermarkets: vi.fn(),
  listZones: vi.fn(),
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

const renderPage = () => render(<MemoryRouter><StoreLayout /></MemoryRouter>);

describe('StoreLayout', () => {
  beforeEach(() => {
    vi.mocked(listSupermarkets).mockResolvedValue([{ supermarketId: 'store-1', code: 'STORE', name: 'Central store', address: null, status: 'ACTIVE' }]);
    vi.mocked(listFloors).mockResolvedValue([floor]);
    vi.mocked(listZones).mockResolvedValue([]);
    vi.mocked(listCameras).mockResolvedValue([camera]);
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
});

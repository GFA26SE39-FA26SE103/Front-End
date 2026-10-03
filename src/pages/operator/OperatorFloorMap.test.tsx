import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCameraPreview, listCameraMappings, listCameras } from '../../api/cameras';
import { getFloorMap, listFloors, listSupermarkets, listZones } from '../../api/floors';
import OperatorFloorMap from './OperatorFloorMap';

vi.mock('../../api/cameras', () => ({
  getCameraPreview: vi.fn(),
  listCameraMappings: vi.fn(),
  listCameras: vi.fn(),
}));

vi.mock('../../api/floors', () => ({
  getFloorMap: vi.fn(),
  listFloors: vi.fn(),
  listSupermarkets: vi.fn(),
  listZones: vi.fn(),
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

const zone = (zoneId: string, name: string, x: number) => ({
  zoneId,
  floorId: 'floor-1',
  code: zoneId.toUpperCase(),
  name,
  zoneType: 'CHECKOUT',
  mapPolygon: [{ x, y: 0.1 }, { x: x + 0.2, y: 0.1 }, { x: x + 0.2, y: 0.4 }],
  colorHex: null,
  areaM2: 40,
  status: 'ACTIVE',
  updatedAt: '2026-10-03T00:00:00Z',
});

const camera = (cameraId: string, code: string, healthStatus: string) => ({
  cameraId,
  floorId: 'floor-1',
  code,
  name: `${code} name`,
  manufacturer: null,
  model: null,
  serialNumber: null,
  installedAt: '2026-10-01T00:00:00Z',
  warrantyExpiresAt: '2027-10-01T00:00:00Z',
  mapX: 0.3,
  mapY: 0.3,
  mapRotationDeg: 0,
  status: 'ACTIVE',
  healthStatus,
  lastSeenAt: null,
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/operator/floor-map']}>
    <Routes>
      <Route path="/operator/floor-map" element={<OperatorFloorMap />} />
      <Route path="/operator/cameras/:cameraId" element={<p>Live page</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('OperatorFloorMap', () => {
  beforeEach(() => {
    vi.mocked(listSupermarkets).mockResolvedValue([{ supermarketId: 'store-1', code: 'STORE', name: 'Central store', address: null, status: 'ACTIVE' }]);
    vi.mocked(listFloors).mockResolvedValue([floor]);
    vi.mocked(listZones).mockResolvedValue([zone('zone-a', 'Checkout', 0.1), zone('zone-b', 'Entrance', 0.4), zone('zone-c', 'Aisles', 0.7)]);
    vi.mocked(listCameras).mockResolvedValue([camera('cam-1', 'CAM-01', 'ONLINE'), camera('cam-2', 'CAM-02', 'OFFLINE')]);
    vi.mocked(listCameraMappings).mockImplementation(async (cameraId) => cameraId === 'cam-1'
      ? [{ cameraZoneId: 'm1', cameraId: 'cam-1', zoneId: 'zone-a', status: 'ACTIVE' }]
      : [{ cameraZoneId: 'm2', cameraId: 'cam-2', zoneId: 'zone-b', status: 'ACTIVE' }]);
    vi.mocked(getFloorMap).mockResolvedValue(new Blob(['map'], { type: 'image/png' }));
    vi.mocked(getCameraPreview).mockResolvedValue(new Blob(['frame'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows the floor plan and derives each zone status from its mapped cameras', async () => {
    renderPage();

    expect(await screen.findByRole('img', { name: 'Floor plan' })).toHaveAttribute('src', 'blob:test');
    const cards = await screen.findAllByRole('button', { name: /cameras online/ });
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('Live coverage')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/1\/1 cameras online/)).toBeInTheDocument();
    expect(within(cards[1]).getByText('No live camera')).toBeInTheDocument();
    expect(within(cards[2]).getByText('No camera')).toBeInTheDocument();
    expect(screen.getByText(/1\/2 cameras online/)).toBeInTheDocument();
  });

  it('opens a camera popup with its zones and navigates to the live view', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Inspect camera CAM-01' }));
    const popup = screen.getByRole('dialog', { name: 'Camera CAM-01' });
    expect(within(popup).getByText('Online')).toBeInTheDocument();
    expect(within(popup).getByText('Checkout')).toBeInTheDocument();
    expect(await within(popup).findByRole('img', { name: 'Latest frame from CAM-01' })).toBeInTheDocument();

    await user.click(within(popup).getByRole('button', { name: 'Open live' }));
    expect(screen.getByText('Live page')).toBeInTheDocument();
  });

  it('explains when the floor has no uploaded plan', async () => {
    vi.mocked(listFloors).mockResolvedValue([{ ...floor, mapAssetUrl: null }]);
    renderPage();

    expect(await screen.findByText(/has no floor plan yet/)).toBeInTheDocument();
    expect(getFloorMap).not.toHaveBeenCalled();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCamera, listCameraMappings, listCameras } from '../../api/cameras';
import { getFloorMap, listFloors, listSupermarkets, listZones } from '../../api/floors';
import OperatorCameraLive from './OperatorCameraLive';
vi.mock('../../api/monitoringRuntime', () => ({
  getCameraMonitoringRuntime: vi.fn(async (cameraId: string) => ({ cameraId, state: 'STOPPED', reason: 'NO_ACTIVE_CONFIGURATION', zones: [], sourceElapsedMs: null })),
  getCameraIncidents: vi.fn(async () => ({ items: [], hasMore: false, nextCreatedAt: null, nextIncidentId: null })),
}));

vi.mock('../../components/AnnotatedPreview', () => ({
  AnnotatedPreview: ({ cameraId, enabled, regions = [] }: { cameraId: string; enabled: boolean; regions?: { label: string; color: string }[] }) => (
    <div data-testid="annotated-preview">
      {cameraId}:{enabled ? 'on' : 'off'}
      {regions.map((region) => <span key={region.label} data-testid="roi-region">{region.label} {region.color}</span>)}
    </div>
  ),
}));

vi.mock('../../api/cameras', () => ({
  getCamera: vi.fn(),
  listCameraMappings: vi.fn(),
  listCameras: vi.fn(),
}));

vi.mock('../../api/floors', () => ({
  getFloorMap: vi.fn(),
  listFloors: vi.fn(),
  listSupermarkets: vi.fn(),
  listZones: vi.fn(),
}));

const camera = {
  cameraId: 'cam-3',
  floorId: 'floor-1',
  code: 'CAM-03',
  name: 'Checkout camera',
  manufacturer: null,
  model: null,
  serialNumber: null,
  installedAt: '2026-10-01T00:00:00Z',
  warrantyExpiresAt: '2027-10-01T00:00:00Z',
  mapX: 0.8,
  mapY: 0.8,
  mapRotationDeg: 180,
  status: 'ACTIVE',
  healthStatus: 'ONLINE',
  lastSeenAt: null,
};

const zone = (zoneId: string, name: string) => ({
  zoneId,
  floorId: 'floor-1',
  code: zoneId,
  name,
  zoneType: null,
  mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }],
  colorHex: null,
  areaM2: null,
  status: 'ACTIVE',
  updatedAt: '2026-10-03T00:00:00Z',
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/operator/cameras/cam-3']}>
    <Routes>
      <Route path="/operator/cameras/:cameraId" element={<OperatorCameraLive />} />
    </Routes>
  </MemoryRouter>,
);

describe('OperatorCameraLive', () => {
  beforeEach(() => {
    vi.mocked(getCamera).mockResolvedValue(camera);
    vi.mocked(listSupermarkets).mockResolvedValue([{ supermarketId: 'store-1', code: 'STORE', name: 'Central store', address: null, status: 'ACTIVE' }]);
    vi.mocked(listFloors).mockResolvedValue([{
      floorId: 'floor-1', supermarketId: 'store-1', floorNumber: 1, name: 'Ground floor',
      mapAssetUrl: 'http://api.test/api/floors/floor-1/map?v=one.png', mapWidth: 1200, mapHeight: 800, status: 'ACTIVE',
    }]);
    vi.mocked(listZones).mockResolvedValue([zone('zone-b', 'Checkout'), zone('zone-c', 'Aisles'), zone('zone-d', 'Fresh food')]);
    vi.mocked(listCameras).mockResolvedValue([camera]);
    vi.mocked(listCameraMappings).mockResolvedValue([
      { cameraZoneId: 'm1', cameraId: 'cam-3', zoneId: 'zone-b', roiPolygon: [], status: 'ACTIVE' },
      { cameraZoneId: 'm2', cameraId: 'cam-3', zoneId: 'zone-c', roiPolygon: [], status: 'ACTIVE' },
    ]);
    vi.mocked(getFloorMap).mockResolvedValue(new Blob(['map'], { type: 'image/png' }));
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows the live preview, every covered zone, and the floor minimap', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'CAM-03 · Checkout, Aisles' })).toBeInTheDocument();
    expect(screen.getByTestId('annotated-preview')).toHaveTextContent('cam-3:on');
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
    expect(await screen.findByTestId('floor-minimap')).toBeInTheDocument();
    const zoneRows = screen.getAllByText(/Checkout|Aisles/);
    expect(zoneRows.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Fresh food')).not.toBeInTheDocument();
  });

  it('passes the camera ROIs to the live preview', async () => {
    const roi = [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.7 }];
    vi.mocked(listZones).mockResolvedValue([{ ...zone('zone-b', 'Checkout'), colorHex: '#F97316' }, zone('zone-c', 'Aisles')]);
    vi.mocked(listCameraMappings).mockResolvedValue([
      { cameraZoneId: 'm1', cameraId: 'cam-3', zoneId: 'zone-b', roiPolygon: roi, status: 'ACTIVE' },
      { cameraZoneId: 'm2', cameraId: 'cam-3', zoneId: 'zone-c', roiPolygon: roi, status: 'ACTIVE' },
    ]);
    renderPage();

    const regions = await screen.findAllByTestId('roi-region');
    expect(regions.map((region) => region.textContent)).toEqual(['Checkout #F97316', 'Aisles #3B82F6']);
  });

  it('lists every camera on the floor and switches to another one', async () => {
    const other = { ...camera, cameraId: 'cam-1', code: 'CAM-01', name: 'Entrance camera', healthStatus: 'OFFLINE' };
    vi.mocked(listCameras).mockResolvedValue([other, camera]);
    vi.mocked(getCamera).mockImplementation(async (id) => (id === 'cam-1' ? other : camera));
    const user = userEvent.setup();
    renderPage();

    const switcher = await screen.findByRole('navigation', { name: 'Cameras on this floor' });
    expect(within(switcher).getByRole('link', { name: /CAM-03/ })).toHaveAttribute('aria-current', 'page');
    expect(within(switcher).getByRole('link', { name: /CAM-01/ })).toHaveTextContent('Offline');

    await user.click(within(switcher).getByRole('link', { name: /CAM-01/ }));
    expect(await screen.findByRole('heading', { name: /^CAM-01/ })).toBeInTheDocument();
    expect(screen.getByTestId('annotated-preview')).toHaveTextContent('cam-1:on');
  });

  it('stops and restarts the live view', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: /CAM-03/ });

    await user.click(screen.getByRole('button', { name: 'Stop live view' }));
    expect(screen.getByTestId('annotated-preview')).toHaveTextContent('cam-3:off');
    await user.click(screen.getByRole('button', { name: 'Start live view' }));
    expect(screen.getByTestId('annotated-preview')).toHaveTextContent('cam-3:on');
  });

  it('shows a recoverable message when the camera cannot be loaded', async () => {
    vi.mocked(getCamera).mockRejectedValue(new Error('The resource was not found.'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The resource was not found.');
    expect(within(alert.parentElement!).getByRole('link', { name: 'Back to floor map' })).toBeInTheDocument();
  });
});

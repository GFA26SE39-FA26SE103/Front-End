import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCameraPreview,
  listCameraMappings,
  removeCameraMapping,
  saveCameraMapping,
} from '../api/cameras';
import { CameraCoverageEditor } from './CameraCoverageEditor';

vi.mock('../api/cameras', () => ({
  getCameraPreview: vi.fn(),
  listCameraMappings: vi.fn(),
  removeCameraMapping: vi.fn(),
  saveCameraMapping: vi.fn(),
}));

const camera = {
  cameraId: 'camera-1', floorId: 'floor-1', code: 'CAM-01', name: 'Aisle camera',
  manufacturer: null, model: null, serialNumber: null, installedAt: null, warrantyExpiresAt: null,
  mapX: 0.5, mapY: 0.5, mapRotationDeg: 0, status: 'ACTIVE', healthStatus: 'ONLINE', lastSeenAt: null,
};

const zones = [
  {
    zoneId: 'zone-frozen', floorId: 'floor-1', code: 'FROZEN', name: 'Frozen aisle', zoneType: 'AISLES',
    mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }],
    colorHex: '#3B82F6', areaM2: null, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
  },
  {
    zoneId: 'zone-checkout', floorId: 'floor-1', code: 'CHECKOUT', name: 'Checkout area', zoneType: 'CHECKOUT',
    mapPolygon: [{ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 0.8, y: 0.8 }],
    colorHex: '#F97316', areaM2: null, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
  },
];

const previewRect = {
  left: 100, top: 50, width: 800, height: 400, right: 900, bottom: 450, x: 100, y: 50,
  toJSON: () => ({}),
};

describe('CameraCoverageEditor', () => {
  beforeEach(() => {
    vi.mocked(getCameraPreview).mockResolvedValue(new Blob(['frame'], { type: 'image/jpeg' }));
    vi.mocked(listCameraMappings).mockResolvedValue([]);
    vi.mocked(saveCameraMapping).mockImplementation(async (cameraId, zoneId, request) => ({
      cameraZoneId: 'mapping-1', cameraId, zoneId, roiPolygon: request.roiPolygon, status: request.status,
    }));
    vi.mocked(removeCameraMapping).mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => 'blob:camera-preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('draws a polygon on the camera frame and maps it to a selected floor zone', async () => {
    const user = userEvent.setup();
    render(<CameraCoverageEditor camera={camera} zones={zones} onClose={vi.fn()} />);

    expect(await screen.findByRole('img', { name: 'Camera preview for CAM-01' })).toHaveAttribute('src', 'blob:camera-preview');
    await user.selectOptions(screen.getByLabelText('Target zone'), 'zone-frozen');
    await user.click(screen.getByRole('button', { name: 'Draw polygon ROI' }));
    const layer = screen.getByTestId('roi-drawing-layer');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(previewRect);
    fireEvent.click(layer, { clientX: 180, clientY: 90 });
    fireEvent.click(layer, { clientX: 740, clientY: 90 });
    fireEvent.click(layer, { clientX: 660, clientY: 370 });
    await user.click(screen.getByRole('button', { name: 'Close polygon' }));
    await user.click(screen.getByRole('button', { name: 'Save ROI' }));

    await waitFor(() => expect(saveCameraMapping).toHaveBeenCalledWith('camera-1', 'zone-frozen', {
      roiPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.7, y: 0.8 }],
      status: 'ACTIVE',
    }));
    expect(await screen.findByText('Frozen aisle mapped.')).toBeInTheDocument();
  });

  it('loads an existing ROI for editing and removes only that camera-zone mapping', async () => {
    vi.mocked(listCameraMappings).mockResolvedValue([{
      cameraZoneId: 'mapping-1', cameraId: 'camera-1', zoneId: 'zone-checkout', status: 'ACTIVE',
      roiPolygon: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.7, y: 0.8 }],
    }]);
    const user = userEvent.setup();
    render(<CameraCoverageEditor camera={camera} zones={zones} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Edit ROI for Checkout area' }));
    expect(screen.getAllByRole('button', { name: /Resize ROI point/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove ROI for Checkout area' }));

    await waitFor(() => expect(removeCameraMapping).toHaveBeenCalledWith('camera-1', 'zone-checkout'));
    expect(await screen.findByText('Checkout area mapping removed.')).toBeInTheDocument();
  });
});

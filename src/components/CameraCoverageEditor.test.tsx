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
    colorHex: '#3B82F6', areaM2: null, minStaff: 0, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
  },
  {
    zoneId: 'zone-checkout', floorId: 'floor-1', code: 'CHECKOUT', name: 'Checkout area', zoneType: 'CHECKOUT',
    mapPolygon: [{ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 0.8, y: 0.8 }],
    colorHex: '#F97316', areaM2: null, minStaff: 1, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
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
    const layer = screen.getByTestId('roi-drawing-layer');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(previewRect);
    fireEvent.click(layer, { clientX: 180, clientY: 90 });
    fireEvent.click(layer, { clientX: 740, clientY: 90 });
    fireEvent.click(layer, { clientX: 660, clientY: 370 });
    const save = screen.getByRole('button', { name: 'Save ROI to zone' });
    expect(save).toBeDisabled();
    expect(screen.queryByTestId('active-roi')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish shape' }));
    expect(screen.getByTestId('active-roi')).toBeInTheDocument();
    expect(saveCameraMapping).not.toHaveBeenCalled();
    await user.click(save);

    await waitFor(() => expect(saveCameraMapping).toHaveBeenCalledWith('camera-1', 'zone-frozen', {
      roiPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.7, y: 0.8 }],
      status: 'ACTIVE',
    }));
    expect(await screen.findByText('ROI saved for Frozen aisle.')).toBeInTheDocument();
    expect(screen.getByTestId('active-roi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configure monitoring for Frozen aisle' })).toHaveAttribute('href', '/admin/ai-config?zoneId=zone-frozen');
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

  it('asks before discarding a dirty polygon when switching mode or closing', async () => {
    const user = userEvent.setup(); const close = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CameraCoverageEditor camera={camera} zones={zones} onClose={close} />);
    await screen.findByRole('img', { name: 'Camera preview for CAM-01' });
    await user.selectOptions(screen.getByLabelText('Target zone'), 'zone-frozen');
    const layer = screen.getByTestId('roi-drawing-layer');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(previewRect);
    fireEvent.click(layer, { clientX: 180, clientY: 90 });
    await user.click(screen.getByRole('button', { name: 'Checkout counter ROI' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Zone monitoring ROI' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Back to floor plan' })); expect(close).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Back to floor plan' })); expect(close).toHaveBeenCalledOnce();
  });

  it('does not offer zones on another floor in the shared editor', async () => {
    render(<CameraCoverageEditor camera={camera} zones={[...zones, { ...zones[0], zoneId: 'other-floor', floorId: 'floor-2', name: 'Upstairs' }]} onClose={vi.fn()} />);
    await screen.findByRole('img', { name: 'Camera preview for CAM-01' });
    expect(screen.queryByRole('option', { name: /Upstairs/ })).not.toBeInTheDocument();
  });

  it('resets undo history when reloading the same mapping after discarding edits', async () => {
    vi.mocked(listCameraMappings).mockResolvedValue([{
      cameraZoneId: 'mapping-1', cameraId: 'camera-1', zoneId: 'zone-frozen', status: 'ACTIVE',
      roiPolygon: [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .7, y: .8 }],
    }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup(); render(<CameraCoverageEditor camera={camera} zones={zones} onClose={vi.fn()} />);
    const edit = await screen.findByRole('button', { name: 'Edit ROI for Frozen aisle' }); await user.click(edit);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize ROI point 1' }), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(edit);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resize ROI point 1' })).toHaveStyle({ left: '20%' });
  });
});

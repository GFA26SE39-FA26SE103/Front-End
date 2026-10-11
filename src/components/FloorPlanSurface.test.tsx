import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloorPlanSurface, type CameraPlacement } from './FloorPlanSurface';

const cameras: CameraPlacement[] = [
  { cameraId: 'camera-1', code: 'CAM-01', mapX: 0.25, mapY: 0.5, mapRotationDeg: 0, status: 'ACTIVE' },
  { cameraId: 'camera-2', code: 'CAM-02', mapX: 0.75, mapY: 0.5, mapRotationDeg: 180, status: 'ACTIVE' },
];

const renderSurface = (overrides: Partial<React.ComponentProps<typeof FloorPlanSurface>> = {}) => {
  const onSelectCamera = vi.fn();
  const onChangePlacement = vi.fn();
  render(
    <FloorPlanSurface
      mapUrl="blob:map"
      mapContentType="image/png"
      cameras={cameras}
      selectedCameraId="camera-1"
      onSelectCamera={onSelectCamera}
      onChangePlacement={onChangePlacement}
      {...overrides}
    />,
  );
  const surface = screen.getByTestId('floor-plan-surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 50,
    width: 800,
    height: 400,
    right: 900,
    bottom: 450,
    x: 100,
    y: 50,
    toJSON: () => ({}),
  });
  return { onSelectCamera, onChangePlacement, surface };
};

describe('FloorPlanSurface', () => {
  it('renders the map, camera body, muzzle, and field of view', () => {
    renderSurface();

    expect(screen.getByRole('img', { name: /floor plan/i })).toHaveAttribute('src', 'blob:map');
    expect(screen.getByRole('button', { name: /place cam-01/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('camera-muzzle')).toHaveLength(2);
    expect(screen.getAllByTestId('camera-fov')).toHaveLength(2);
  });

  it('selects and drags only the operated camera using normalized coordinates', () => {
    const { onSelectCamera, onChangePlacement } = renderSurface();
    const camera = screen.getByRole('button', { name: /place cam-02/i });

    fireEvent.pointerDown(camera, { pointerId: 7, clientX: 700, clientY: 250 });
    fireEvent.pointerMove(camera, { pointerId: 7, clientX: 500, clientY: 150 });

    expect(onSelectCamera).toHaveBeenCalledWith('camera-2');
    expect(onChangePlacement).toHaveBeenLastCalledWith('camera-2', { x: 0.5, y: 0.25, rotationDeg: 180 });
  });

  it('clamps pointer movement at the map edges', () => {
    const { onChangePlacement } = renderSurface();
    const camera = screen.getByRole('button', { name: /place cam-01/i });

    fireEvent.pointerDown(camera, { pointerId: 1, clientX: 300, clientY: 250 });
    fireEvent.pointerMove(camera, { pointerId: 1, clientX: -100, clientY: 900 });

    expect(onChangePlacement).toHaveBeenLastCalledWith('camera-1', { x: 0, y: 1, rotationDeg: 0 });
  });

  it('rotates the selected camera from its center', () => {
    const { onChangePlacement } = renderSurface();
    const rotate = screen.getByRole('button', { name: /rotate cam-01/i });

    fireEvent.pointerDown(rotate, { pointerId: 3, clientX: 300, clientY: 250 });
    fireEvent.pointerMove(rotate, { pointerId: 3, clientX: 300, clientY: 350 });

    expect(onChangePlacement).toHaveBeenLastCalledWith('camera-1', { x: 0.25, y: 0.5, rotationDeg: 90 });
  });

  it('supports keyboard movement and rotation', () => {
    const { onChangePlacement } = renderSurface();
    fireEvent.keyDown(screen.getByRole('button', { name: /place cam-01/i }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: /rotate cam-01/i }), { key: 'ArrowLeft' });

    expect(onChangePlacement).toHaveBeenNthCalledWith(1, 'camera-1', { x: 0.26, y: 0.5, rotationDeg: 0 });
    expect(onChangePlacement).toHaveBeenNthCalledWith(2, 'camera-1', { x: 0.25, y: 0.5, rotationDeg: 355 });
  });

  it('shows which cameras have unsaved placement', () => {
    renderSurface({ dirtyCameraIds: new Set(['camera-1']) });
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('disables camera placement while the zone editor is active', () => {
    renderSurface({ zoneEditor: { zones: [], saving: false, onSave: vi.fn(), onCancel: vi.fn() } });

    expect(screen.getByRole('button', { name: /place cam-01/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /rotate cam-01/i })).toBeDisabled();
    expect(screen.getByRole('toolbar', { name: 'Zone drawing tools' })).toBeInTheDocument();
  });
  it('keeps zones visible on the plan while the zone editor is closed', () => {
    const zone = {
      zoneId: 'zone-1', floorId: 'floor-1', code: 'CHK', name: 'Checkout', zoneType: 'CHECKOUT',
      mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.4 }],
      colorHex: '#F97316', areaM2: null, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
    };
    renderSurface({ zones: [zone] });

    const layer = screen.getByTestId('zone-layer');
    expect(layer).toHaveTextContent('Checkout');
    expect(layer.querySelector('polygon')).toHaveAttribute('points', '100,100 400,100 400,400 100,400');
    expect(screen.getByRole('button', { name: /place cam-01/i })).toBeEnabled();
  });
});

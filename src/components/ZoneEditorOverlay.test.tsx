import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ZoneEditorOverlay } from './ZoneEditorOverlay';

const rectangleZone = {
  zoneId: 'zone-rectangle', floorId: 'floor-1', code: 'PRODUCE', name: 'Produce', zoneType: 'AISLES',
  mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }],
  colorHex: '#22C55E', minStaff: 2, status: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
};

const polygonZone = {
  ...rectangleZone,
  zoneId: 'zone-polygon',
  code: 'BAKERY',
  name: 'Bakery',
  mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.3, y: 0.5 }],
};

const rect = {
  left: 100,
  top: 50,
  width: 800,
  height: 400,
  right: 900,
  bottom: 450,
  x: 100,
  y: 50,
  toJSON: () => ({}),
};

const renderEditor = (zones: typeof rectangleZone[] = []) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(<ZoneEditorOverlay zones={zones} saving={false} onSave={onSave} onDelete={onDelete} onCancel={onCancel} />);
  const layer = screen.getByTestId('zone-drawing-layer');
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(rect);
  return { layer, onSave, onDelete, onCancel };
};

describe('ZoneEditorOverlay', () => {
  it('draws a rectangle by dragging, names and colors it, then saves four normalized points', async () => {
    const user = userEvent.setup();
    const { layer, onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    fireEvent.pointerDown(layer, { pointerId: 7, clientX: 180, clientY: 90 });
    fireEvent.pointerMove(layer, { pointerId: 7, clientX: 500, clientY: 250 });
    fireEvent.pointerUp(layer, { pointerId: 7, clientX: 500, clientY: 250 });
    await user.type(screen.getByLabelText('Zone name'), 'Produce');
    await user.selectOptions(screen.getByLabelText('Zone type'), 'FRESH_FOOD');
    await user.click(screen.getByRole('button', { name: 'Green' }));
    await user.click(screen.getByRole('button', { name: 'Save zone' }));

    expect(onSave).toHaveBeenCalledWith({
      zoneId: undefined,
      name: 'Produce',
      zoneType: 'FRESH_FOOD',
      colorHex: '#22C55E',
      mapPolygon: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
    });
  });

  it('offers rectangle drawing only and no area field', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Polygon' })).not.toBeInTheDocument();
    expect(screen.queryByText('Area in square metres')).not.toBeInTheDocument();
  });

  it('renders the tools in a draggable floating widget', () => {
    renderEditor();
    const toolbar = screen.getByRole('toolbar', { name: 'Zone drawing tools' });
    const handle = screen.getByRole('button', { name: 'Move zone toolbar' });
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({ ...rect, left: 116, top: 66, width: 290, height: 280, right: 406, bottom: 346 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

    fireEvent.pointerDown(handle, { pointerId: 9, clientX: 120, clientY: 70 });
    fireEvent.pointerMove(handle, { pointerId: 9, clientX: 820, clientY: 120 });
    fireEvent.pointerUp(handle, { pointerId: 9, clientX: 820, clientY: 120 });

    expect(toolbar).toHaveStyle({ position: 'fixed', left: '716px', top: '66px' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resize' })).not.toBeInTheDocument();
  });

  it('moves the entire selected zone by dragging its filled area with the Edit tool', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor([rectangleZone]);
    const zone = screen.getByRole('button', { name: 'Edit zone Produce' });

    fireEvent.pointerDown(zone, { pointerId: 3, clientX: 180, clientY: 90 });
    fireEvent.pointerMove(zone, { pointerId: 3, clientX: 260, clientY: 130 });
    fireEvent.pointerUp(zone, { pointerId: 3, clientX: 260, clientY: 130 });
    await user.click(screen.getByRole('button', { name: 'Save zone' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      zoneId: 'zone-rectangle',
      mapPolygon: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.6, y: 0.6 }, { x: 0.2, y: 0.6 }],
    }));
  });

  it('resizes a rectangle from a corner while preserving rectangular geometry', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor([rectangleZone]);
    await user.click(screen.getByRole('button', { name: 'Edit zone Produce' }));
    const corner = screen.getByRole('button', { name: 'Resize point 1' });

    fireEvent.pointerDown(corner, { pointerId: 4, clientX: 180, clientY: 90 });
    fireEvent.pointerMove(corner, { pointerId: 4, clientX: 260, clientY: 130 });
    fireEvent.pointerUp(corner, { pointerId: 4, clientX: 260, clientY: 130 });
    await user.click(screen.getByRole('button', { name: 'Save zone' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      mapPolygon: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.5 }],
    }));
  });

  it('normalizes a legacy polygon to its bounding rectangle when edited', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor([polygonZone]);
    await user.click(screen.getByRole('button', { name: 'Edit zone Bakery' }));
    await user.click(screen.getByRole('button', { name: 'Save zone' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      mapPolygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }],
    }));
  });

  it('requires confirmation before deleting a selected zone', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderEditor([rectangleZone]);
    await user.click(screen.getByRole('button', { name: 'Edit zone Produce' }));
    await user.click(screen.getByRole('button', { name: 'Delete zone' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onDelete).toHaveBeenCalledWith('zone-rectangle');
  });

  it('keeps a resize handle mounted during rapid movement and stops when pointer capture is lost', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor([rectangleZone]);
    await user.click(screen.getByRole('button', { name: 'Edit zone Produce' }));
    const corner = screen.getByRole('button', { name: 'Resize point 1' });

    fireEvent.pointerDown(corner, { pointerId: 8, clientX: 180, clientY: 90 });
    fireEvent.pointerMove(corner, { pointerId: 8, clientX: 260, clientY: 130 });
    expect(screen.getByRole('button', { name: 'Resize point 1' })).toBe(corner);

    fireEvent.lostPointerCapture(corner, { pointerId: 8 });
    fireEvent.pointerMove(corner, { pointerId: 8, clientX: 340, clientY: 170 });
    await user.click(screen.getByRole('button', { name: 'Save zone' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      mapPolygon: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.5 }],
    }));
  });

  it('shows each saved zone name at the center of its geometry', () => {
    renderEditor([rectangleZone]);

    const label = screen.getByTestId('zone-label-zone-rectangle');
    expect(label).toHaveTextContent('Produce');
    expect(label).toHaveStyle({ left: '30%', top: '30%' });
  });
});

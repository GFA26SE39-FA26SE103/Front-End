import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PolygonRoiEditor, type RoiDraft } from './PolygonRoiEditor';
import { validateRoiPolygon } from './roiPolygonValidation';

const rectangle = [{ x: .1, y: .1 }, { x: .8, y: .1 }, { x: .8, y: .8 }, { x: .1, y: .8 }];
const rect = { left: 100, top: 50, width: 800, height: 400, right: 900, bottom: 450, x: 100, y: 50, toJSON: () => ({}) };

function Editor({ initial = { points: [], complete: false, editing: false } }: { initial?: RoiDraft }) {
  const [draft, setDraft] = useState(initial);
  return <><PolygonRoiEditor previewUrl="blob:preview" cameraCode="CAM-01" draft={draft} onChange={setDraft} />
    <output data-testid="draft">{JSON.stringify(draft)}</output></>;
}

describe('normalized ROI polygon editor', () => {
  it('draws, closes and undoes normalized geometry', async () => {
    const user = userEvent.setup(); render(<Editor />);
    await user.click(screen.getByRole('button', { name: 'Draw polygon ROI' }));
    const layer = screen.getByTestId('roi-drawing-layer');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(rect);
    for (const [clientX, clientY] of [[180, 90], [740, 90], [660, 370]]) fireEvent.click(layer, { clientX, clientY });
    await user.click(screen.getByRole('button', { name: 'Close polygon' }));
    expect(JSON.parse(screen.getByTestId('draft').textContent!)).toEqual({ points: [{ x: .1, y: .1 }, { x: .8, y: .1 }, { x: .7, y: .8 }], complete: true, editing: true });
    expect(screen.getAllByRole('button', { name: /Resize ROI point/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(JSON.parse(screen.getByTestId('draft').textContent!).complete).toBe(false);
  });

  it('retains pointer capture when a fast vertex drag leaves its handle', () => {
    render(<Editor initial={{ points: rectangle, complete: true, editing: true }} />);
    const layer = screen.getByTestId('roi-drawing-layer'); vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(rect);
    const handle = screen.getByRole('button', { name: 'Resize ROI point 1' });
    const capture = vi.fn(); const release = vi.fn();
    handle.setPointerCapture = capture; handle.releasePointerCapture = release;
    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 180, clientY: 90 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 420, clientY: 250 });
    fireEvent.pointerUp(handle, { pointerId: 7 });
    expect(capture).toHaveBeenCalledWith(7); expect(release).toHaveBeenCalledWith(7);
    expect(JSON.parse(screen.getByTestId('draft').textContent!).points[0]).toEqual({ x: .4, y: .5 });
  });

  it('does not close an intersecting polygon', async () => {
    const user = userEvent.setup();
    render(<Editor initial={{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }], complete: false, editing: false }} />);
    await user.click(screen.getByRole('button', { name: 'Close polygon' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/intersect/i);
    expect(JSON.parse(screen.getByTestId('draft').textContent!).complete).toBe(false);
  });

  it('can undo all open polygon vertices beyond the bounded history window', async () => {
    const user = userEvent.setup(); render(<Editor />);
    const layer = screen.getByTestId('roi-drawing-layer'); vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(rect);
    for (let i = 0; i < 60; i++) fireEvent.click(layer, { clientX: 180 + i, clientY: 90 + i });
    for (let i = 0; i < 60; i++) await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(JSON.parse(screen.getByTestId('draft').textContent!).points).toEqual([]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('ROI geometry validation matches Backend bounds', () => {
  it('accepts independent polygons without an adjacency requirement', () => { expect(validateRoiPolygon(rectangle)).toBeNull(); });
  it.each([
    [], [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: .5, y: .5 }, { x: 1, y: 1 }],
    [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 1 }],
    [{ x: -.1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    Array.from({ length: 1001 }, (_, i) => ({ x: i / 1001, y: 0 })),
  ].map(points => ({ points })))('rejects invalid or excessive vertices %#', ({ points }) => { expect(validateRoiPolygon(points)).not.toBeNull(); });
});

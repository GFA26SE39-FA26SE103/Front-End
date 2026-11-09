import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listZoneAdjacency, replaceZoneAdjacency, type ZoneRecord } from '../api/floors';
import { mockNativeDialogs } from '../test/dialog';
import { ZoneAdjacencyEditor } from './ZoneAdjacencyEditor';

mockNativeDialogs();

vi.mock('../api/floors', () => ({
  listZoneAdjacency: vi.fn(),
  replaceZoneAdjacency: vi.fn(),
}));

const zone = (zoneId: string, code: string, name: string, floorId = 'floor-1'): ZoneRecord => ({
  zoneId, floorId, code, name, zoneType: null, mapPolygon: [], colorHex: null,
  areaM2: null, minStaff: 0, status: 'ACTIVE', updatedAt: '2026-11-09T00:00:00Z',
});

const queue = zone('zone-queue', 'QUEUE', 'Queue');
const checkout = zone('zone-checkout', 'CHECKOUT', 'Checkout');
const produce = zone('zone-produce', 'PRODUCE', 'Produce');
const upper = zone('zone-upper', 'UPPER', 'Upper floor', 'floor-2');

describe('ZoneAdjacencyEditor', () => {
  beforeEach(() => {
    vi.mocked(listZoneAdjacency).mockResolvedValue([checkout]);
    vi.mocked(replaceZoneAdjacency).mockResolvedValue([checkout, produce]);
  });

  it('loads the selected zone, shows same-floor candidates, and saves the full set', async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<ZoneAdjacencyEditor zones={[queue, checkout, produce, upper]} onClose={vi.fn()} onSaved={saved} />);

    expect(await screen.findByLabelText('Checkout (CHECKOUT)')).toBeChecked();
    expect(screen.queryByLabelText('Upper floor (UPPER)')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Produce (PRODUCE)'));
    await user.click(screen.getByRole('button', { name: 'Save adjacency' }));

    await waitFor(() => expect(replaceZoneAdjacency).toHaveBeenCalledWith('zone-queue', ['zone-checkout', 'zone-produce']));
    expect(await screen.findByRole('status')).toHaveTextContent('Adjacency saved for Queue.');
    expect(saved).toHaveBeenCalledWith('Queue');
  });

  it('reloads when the source zone changes and lets the admin retry a failed read', async () => {
    vi.mocked(listZoneAdjacency).mockRejectedValueOnce(new Error('Backend unavailable')).mockResolvedValueOnce([checkout]);
    const user = userEvent.setup();
    render(<ZoneAdjacencyEditor zones={[queue, checkout]} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Checkout (CHECKOUT)')).toBeChecked();

    await user.selectOptions(screen.getByLabelText('Zone to configure'), 'zone-checkout');
    await waitFor(() => expect(listZoneAdjacency).toHaveBeenLastCalledWith('zone-checkout', expect.any(AbortSignal)));
  });
});

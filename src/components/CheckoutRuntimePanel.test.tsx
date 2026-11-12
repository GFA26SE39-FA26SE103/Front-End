import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCheckoutRuntime, listCheckoutCounters } from '../api/checkout';
import type { ZoneRecord } from '../api/floors';
import { CheckoutRuntimePanel } from './CheckoutRuntimePanel';

vi.mock('../api/checkout', () => ({
  getCheckoutRuntime: vi.fn(),
  listCheckoutCounters: vi.fn(),
}));

const zone = {
  zoneId: 'zone-1', name: 'Checkout', zoneType: 'CHECKOUT',
} as ZoneRecord;

describe('CheckoutRuntimePanel', () => {
  beforeEach(() => {
    vi.mocked(listCheckoutCounters).mockResolvedValue([{
      checkoutCounterId: 'counter-1', zoneId: 'zone-1', code: 'C01', name: 'Lane 1',
      isEnabled: true, createdAt: '', updatedAt: '',
    }]);
    vi.mocked(getCheckoutRuntime).mockResolvedValue({
      zoneId: 'zone-1', configId: 'config-1', configVersion: '', generatedAt: '',
      state: 'UNAVAILABLE', issueCode: 'CHECKOUT_SOURCE_UNAVAILABLE',
      queueCount: null, staffedCounterCount: null, queuePerStaffedCounter: null,
      noStaffedCapacity: false, counters: [{ counterId: 'counter-1', presence: 'UNKNOWN', queueCount: null, disagreement: false }],
    });
  });

  it('shows unavailable measurements without treating them as zero', async () => {
    render(<CheckoutRuntimePanel zones={[zone]} />);
    expect(await screen.findByText(/State: UNAVAILABLE/)).toHaveTextContent('Queue Q: Unavailable');
    expect(screen.getByRole('row', { name: /C01/ })).toHaveTextContent('UNKNOWN');
    expect(screen.getByRole('row', { name: /C01/ })).toHaveTextContent('Unavailable');
  });

  it('does not poll when there is no checkout zone', () => {
    render(<CheckoutRuntimePanel zones={[]} />);
    expect(getCheckoutRuntime).not.toHaveBeenCalled();
  });
});

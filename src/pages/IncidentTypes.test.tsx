import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import { listSlaPolicies } from '../api/slaPolicies';
import IncidentTypes from './IncidentTypes';

vi.mock('../api/monitoring', () => ({
  createIncidentType: vi.fn(),
  listIncidentTypes: vi.fn(),
  updateIncidentType: vi.fn(),
}));
vi.mock('../api/slaPolicies', () => ({ listSlaPolicies: vi.fn(), saveSlaPolicy: vi.fn() }));

const type: IncidentType = {
  incidentTypeId: 'checkout', code: 'CHECKOUT_CAPACITY_ISSUE', name: 'Checkout Capacity Issue',
  description: null, sourceType: 'AI_DETECTED', measurementType: 'CHECKOUT_CAPACITY',
  status: 'ACTIVE', supported: false, thresholdUnit: null, defaultWarningThreshold: null,
  defaultCriticalThreshold: null, unsupportedReason: null, requiresBeforePhoto: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listIncidentTypes).mockResolvedValue([type]);
  vi.mocked(listSlaPolicies).mockResolvedValue([]);
});

it('toggles the catalogue status using the API result without opening the detail', async () => {
  vi.mocked(updateIncidentType).mockResolvedValueOnce({ status: 'INACTIVE' }).mockResolvedValueOnce({ status: 'ACTIVE' });
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  const checkbox = await screen.findByRole('checkbox', { name: 'Checkout Capacity Issue enabled' });
  expect(checkbox).toBeChecked();

  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(updateIncidentType).toHaveBeenNthCalledWith(1, 'checkout', expect.objectContaining({ status: 'INACTIVE' }));
  expect(screen.getByRole('heading', { name: 'New staff-reported type' })).toBeInTheDocument();

  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(updateIncidentType).toHaveBeenNthCalledWith(2, 'checkout', expect.objectContaining({ status: 'ACTIVE' }));
});

it('shows the API error and retains the saved status when the update fails', async () => {
  vi.mocked(updateIncidentType).mockRejectedValue(new Error('Status update failed.'));
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  const checkbox = await screen.findByRole('checkbox', { name: 'Checkout Capacity Issue enabled' });
  fireEvent.click(checkbox);
  expect(await screen.findByRole('alert')).toHaveTextContent('Status update failed.');
  expect(checkbox).toBeChecked();
  expect(checkbox).toBeEnabled();
});

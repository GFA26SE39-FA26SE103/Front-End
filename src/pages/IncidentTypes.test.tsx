import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createIncidentType, listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import { listSlaPolicies } from '../api/slaPolicies';
import IncidentTypes from './IncidentTypes';

vi.mock('../api/monitoring', () => ({
  createIncidentType: vi.fn(),
  listIncidentTypes: vi.fn(),
  updateIncidentType: vi.fn(),
}));
vi.mock('../api/slaPolicies', () => ({ listSlaPolicies: vi.fn() }));

const type: IncidentType = {
  incidentTypeId: 'checkout', code: 'CHECKOUT_CAPACITY_ISSUE', name: 'Checkout Capacity Issue',
  description: null, sourceType: 'AI_DETECTED', measurementType: 'CHECKOUT_CAPACITY',
  status: 'ACTIVE', supported: false, thresholdUnit: null, defaultWarningThreshold: null,
  defaultCriticalThreshold: null, unsupportedReason: null, requiresBeforePhoto: false,
};
const staffType: IncidentType = {
  ...type, incidentTypeId: 'other', name: 'Other Operational Issue', code: 'OTHER_OPERATIONAL_ISSUE',
  sourceType: 'STAFF_REPORTED', measurementType: null, supported: true,
};

const dialogMethods = [['showModal', true], ['close', false]] as const;
const stubbedMethods: string[] = [];
beforeAll(() => {
  for (const [method, open] of dialogMethods) {
    if (HTMLDialogElement.prototype[method]) continue;
    Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, value(this: HTMLDialogElement) { this.open = open; } });
    stubbedMethods.push(method);
  }
});
afterAll(() => {
  for (const method of stubbedMethods) Reflect.deleteProperty(HTMLDialogElement.prototype, method);
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listIncidentTypes).mockResolvedValue([type]);
  vi.mocked(listSlaPolicies).mockResolvedValue([]);
});

it('toggles the catalogue status using the API result without opening the detail', async () => {
  vi.mocked(updateIncidentType).mockResolvedValueOnce({ ...type, status: 'INACTIVE' }).mockResolvedValueOnce(type);
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: 'Operational event types' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Checkout Capacity Issue enabled' });
  expect(checkbox).toBeChecked();

  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(updateIncidentType).toHaveBeenNthCalledWith(1, 'checkout', expect.objectContaining({ status: 'INACTIVE' }));
  expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();

  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(updateIncidentType).toHaveBeenNthCalledWith(2, 'checkout', expect.objectContaining({ status: 'ACTIVE' }));
});

it('shows the API error and retains the saved status when the update fails', async () => {
  vi.mocked(updateIncidentType).mockRejectedValue(new Error('Status update failed.'));
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: 'Operational event types' }));
  const checkbox = await screen.findByRole('checkbox', { name: 'Checkout Capacity Issue enabled' });
  fireEvent.click(checkbox);
  expect(await screen.findByRole('alert')).toHaveTextContent('Status update failed.');
  expect(checkbox).toBeChecked();
  expect(checkbox).toBeEnabled();
});

it('routes the camera event and missing staff incident policy to their own SLA tabs', async () => {
  vi.mocked(listIncidentTypes).mockResolvedValue([type, staffType]);
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: 'Event & incident types' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Staff incident types', selected: true })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Missing incident SLA for Other Operational Issue' })).toHaveAttribute('href', '/admin/sla-policies?scope=incident');
  expect(screen.queryByRole('button', { name: /Checkout Capacity Issue/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Other Operational Issue/i }));
  expect(screen.getByRole('button', { name: 'Close details' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Operational event types' }));
  expect(screen.getByRole('link', { name: 'Operational event SLA' })).toHaveAttribute('href', '/admin/sla-policies?scope=event');
  expect(screen.queryByRole('heading', { name: 'Camera monitoring' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Other Operational Issue/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add incident type' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Checkout Capacity Issue/ }));
  expect(screen.getByRole('heading', { name: 'Checkout Capacity Issue' })).toBeInTheDocument();
  expect(screen.getByText('Measurement: CHECKOUT_CAPACITY')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(screen.queryByRole('heading', { name: 'Checkout Capacity Issue' })).not.toBeInTheDocument();
});

it('adds and edits a staff incident type through the catalogue actions', async () => {
  vi.mocked(createIncidentType).mockResolvedValue(staffType);
  vi.mocked(updateIncidentType).mockResolvedValue({ ...staffType, name: 'Other issue', requiresBeforePhoto: true });
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);

  const add = screen.getByRole('button', { name: 'Add incident type' });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  const create = within(screen.getByRole('dialog', { name: 'Add staff incident type' }));
  fireEvent.change(create.getByLabelText('Code'), { target: { value: 'other operational issue' } });
  fireEvent.change(create.getByLabelText('Name'), { target: { value: staffType.name } });
  fireEvent.click(create.getByRole('button', { name: 'Create incident type' }));

  const edit = await screen.findByRole('button', { name: `Edit ${staffType.name}` });
  expect(screen.getByRole('columnheader', { name: 'Action' })).toBeVisible();
  expect(createIncidentType).toHaveBeenCalledWith({ code: staffType.code, name: staffType.name, description: null, requiresBeforePhoto: false, status: 'ACTIVE' });
  fireEvent.click(edit);
  const form = within(screen.getByRole('dialog', { name: 'Edit staff incident type' }));
  expect(form.getByLabelText('Code')).toHaveAttribute('readonly');
  fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Other issue' } });
  fireEvent.click(form.getByLabelText('Require before photo'));
  fireEvent.click(form.getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByRole('button', { name: 'Edit Other issue' })).toBeVisible();
  expect(updateIncidentType).toHaveBeenCalledWith('other', { name: 'Other issue', description: null, requiresBeforePhoto: true, status: 'ACTIVE' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

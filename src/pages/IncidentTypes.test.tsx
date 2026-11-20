import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createIncidentType, listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import type { OperationalEventType } from '../api/operationalEventTypes';
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
const eventType: OperationalEventType = {
  eventTypeId: 'event-checkout', code: 'CHECKOUT_CAPACITY', name: 'Checkout Capacity Issue',
  description: null, measurementType: 'CHECKOUT_CAPACITY', status: 'ACTIVE',
};
const eventPath = '/api/operational-event-types';
const fetchEventApi = vi.fn<typeof fetch>();
const endpoint = (request: RequestInfo | URL) => new URL(String(request)).pathname;
const openEvents = () => fireEvent.click(screen.getByRole('tab', { name: 'Operational event types' }));

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
  vi.stubGlobal('fetch', fetchEventApi);
  fetchEventApi.mockImplementation(async request => {
    if (endpoint(request) === eventPath) return Response.json([eventType]);
    throw new Error(`Unexpected request to ${endpoint(request)}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

it('deactivates only after confirmation and reactivates using the operational event ID', async () => {
  fetchEventApi.mockResolvedValueOnce(Response.json([eventType]))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json(eventType));
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  openEvents();
  const deactivate = await screen.findByRole('button', { name: 'Deactivate Checkout Capacity Issue' });
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  expect(screen.getByRole('cell', { name: 'Active' })).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Activate Checkout Capacity Issue' })).not.toBeInTheDocument();

  fireEvent.click(deactivate);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(fetchEventApi).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('cell', { name: 'Active' })).toBeVisible();
  fireEvent.click(deactivate);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate type' }));
  const activate = await screen.findByRole('button', { name: 'Activate Checkout Capacity Issue' });
  expect(screen.getByRole('cell', { name: 'Inactive' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Deactivate Checkout Capacity Issue' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit Checkout Capacity Issue' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();
  expect(endpoint(fetchEventApi.mock.calls[1][0])).toBe(`${eventPath}/${eventType.eventTypeId}`);
  expect(fetchEventApi.mock.calls[1][1]?.method).toBe('DELETE');

  fireEvent.click(activate);
  expect(await screen.findByRole('cell', { name: 'Active' })).toBeVisible();
  expect(endpoint(fetchEventApi.mock.calls[2][0])).toBe(`${eventPath}/${eventType.eventTypeId}`);
  expect(fetchEventApi.mock.calls[2][1]?.method).toBe('PUT');
  expect(JSON.parse(String(fetchEventApi.mock.calls[2][1]?.body))).toEqual({
    name: eventType.name, description: null, measurementType: eventType.measurementType, status: 'ACTIVE',
  });
  expect(updateIncidentType).not.toHaveBeenCalled();
});

it('keeps the event type active when its monitoring rules prevent deactivation', async () => {
  const detail = 'Disable monitoring rules before deactivating this event type.';
  fetchEventApi.mockResolvedValueOnce(Response.json([eventType]))
    .mockResolvedValueOnce(Response.json({ code: 'OPERATIONAL_EVENT_TYPE_IN_USE', detail }, { status: 409 }));
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  openEvents();
  fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Checkout Capacity Issue' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Deactivate type' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(detail);
  expect(screen.getByRole('cell', { name: 'Active' })).toBeVisible();
  expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
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

  openEvents();
  expect(await screen.findByRole('link', { name: 'Operational event SLA' })).toHaveAttribute('href', '/admin/sla-policies?scope=event');
  expect(screen.queryByRole('heading', { name: 'Camera monitoring' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Other Operational Issue/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add incident type' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Checkout Capacity Issue/ }));
  expect(screen.getByRole('heading', { name: 'Checkout Capacity Issue' })).toBeInTheDocument();
  expect(screen.getByText('Measurement: CHECKOUT_CAPACITY')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(screen.queryByRole('heading', { name: 'Checkout Capacity Issue' })).not.toBeInTheDocument();
});

it('creates an inactive event type and edits its measurement through the event catalogue API', async () => {
  const created: OperationalEventType = { ...eventType, eventTypeId: 'event-custom', code: 'CUSTOM_TYPE',
    name: 'Custom event', measurementType: 'CROWD_DENSITY', status: 'INACTIVE' };
  const edited: OperationalEventType = { ...created, name: 'New name', description: 'Details', measurementType: 'QUEUE_LENGTH' };
  fetchEventApi.mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json(created)).mockResolvedValueOnce(Response.json(edited));
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  openEvents();
  const add = screen.getByRole('button', { name: 'Add operational event type' });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  const create = within(screen.getByRole('dialog', { name: 'Add operational event type' }));
  fireEvent.change(create.getByLabelText('Code'), { target: { value: 'custom type' } });
  fireEvent.change(create.getByLabelText('Name'), { target: { value: created.name } });
  fireEvent.change(create.getByLabelText('Measurement type'), { target: { value: 'crowd_density' } });
  expect(create.queryByLabelText('Require before photo')).not.toBeInTheDocument();
  fireEvent.click(create.getByRole('button', { name: 'Create operational event type' }));

  const edit = await screen.findByRole('button', { name: 'Edit Custom event' });
  expect(screen.getByRole('cell', { name: 'Inactive' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Activate Custom event' })).toBeVisible();
  expect(endpoint(fetchEventApi.mock.calls[1][0])).toBe(eventPath);
  expect(fetchEventApi.mock.calls[1][1]?.method).toBe('POST');
  const { eventTypeId: id, ...createPayload } = created;
  expect(JSON.parse(String(fetchEventApi.mock.calls[1][1]?.body))).toEqual(createPayload);
  fireEvent.click(edit);
  const form = within(screen.getByRole('dialog', { name: 'Edit operational event type' }));
  expect(form.getByLabelText('Code')).toHaveAttribute('readonly');
  fireEvent.change(form.getByLabelText('Name'), { target: { value: edited.name } });
  fireEvent.change(form.getByLabelText('Description'), { target: { value: 'Details' } });
  fireEvent.change(form.getByLabelText('Measurement type'), { target: { value: edited.measurementType } });
  fireEvent.click(form.getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByRole('button', { name: 'Edit New name' })).toBeVisible();
  expect(endpoint(fetchEventApi.mock.calls[2][0])).toBe(`${eventPath}/${id}`);
  expect(fetchEventApi.mock.calls[2][1]?.method).toBe('PUT');
  expect(JSON.parse(String(fetchEventApi.mock.calls[2][1]?.body))).toEqual({
    name: edited.name, description: edited.description, measurementType: edited.measurementType, status: 'INACTIVE',
  });
  expect(createIncidentType).not.toHaveBeenCalled();
  expect(updateIncidentType).not.toHaveBeenCalled();
});

it('keeps staff incident types available when the backend lacks the operational catalogue API', async () => {
  vi.mocked(listIncidentTypes).mockResolvedValue([type, staffType]);
  fetchEventApi.mockResolvedValueOnce(new Response(null, { status: 404 }));
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);
  openEvents();
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable on this backend version');
  expect(screen.getByRole('button', { name: 'Add operational event type' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^Checkout Capacity Issue/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Staff incident types' }));
  expect(await screen.findByRole('button', { name: 'Edit Other Operational Issue' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('shows staff incident status and changes it through the row actions', async () => {
  const incident = { ...staffType, description: 'Review the reported issue.', requiresBeforePhoto: true };
  vi.mocked(listIncidentTypes).mockResolvedValue([incident]);
  vi.mocked(updateIncidentType).mockResolvedValueOnce({ ...incident, status: 'INACTIVE' }).mockResolvedValueOnce(incident);
  render(<MemoryRouter><IncidentTypes /></MemoryRouter>);

  const deactivate = await screen.findByRole('button', { name: `Deactivate ${incident.name}` });
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  expect(screen.getByRole('cell', { name: 'Active' })).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(deactivate);
  const dialog = within(screen.getByRole('dialog', { name: `Deactivate ${incident.name}?` }));
  expect(dialog.getByText(/new reports/)).toBeVisible();
  fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect(updateIncidentType).not.toHaveBeenCalled();
  expect(screen.getByRole('cell', { name: 'Active' })).toBeVisible();

  fireEvent.click(deactivate);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate type' }));
  const activate = await screen.findByRole('button', { name: `Activate ${incident.name}` });
  expect(screen.getByRole('cell', { name: 'Inactive' })).toBeVisible();
  const fields = { name: incident.name, description: incident.description, requiresBeforePhoto: true };
  expect(updateIncidentType).toHaveBeenNthCalledWith(1, incident.incidentTypeId, { ...fields, status: 'INACTIVE' });

  fireEvent.click(activate);
  expect(await screen.findByRole('cell', { name: 'Active' })).toBeVisible();
  expect(updateIncidentType).toHaveBeenNthCalledWith(2, incident.incidentTypeId, { ...fields, status: 'ACTIVE' });
  expect(fetchEventApi).not.toHaveBeenCalled();
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

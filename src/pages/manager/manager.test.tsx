import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../../auth/session';
import type { ScheduleView, WorkShift, StaffOption, SwapRequest } from '../../api/planning';
import { mockNativeDialogs } from '../../test/dialog';
import { addDays, isoDate, weekStart } from './dates';
import { shiftHasStarted, shiftHours } from './planningData';
import Schedule from './Schedule';
import WorkShifts from './WorkShifts';
import { SwapRequestDetail } from './SwapRequests';

const manager = { userId: 'mgr', email: 'mgr@store.test', fullName: 'Trần Minh', roleId: 'role-MANAGER', role: 'MANAGER', status: 'ACTIVE' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problemJson = (status: number, code: string, detail: string) => json({ code, detail }, status);

type Call = { path: string; query: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let routes: Record<string, (call: Call) => Response>;

function serve() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const call = { path: url.pathname, query: url.search, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null };
    calls.push(call);
    const handler = routes[`${call.method} ${call.path}`];
    return handler ? handler(call) : json({ detail: 'Not found' }, 404);
  });
}

const monday = weekStart(new Date());
const day = addDays(monday, 6);
const template = (shiftId: string, name: string, startTime: string, endTime: string): WorkShift =>
  ({ shiftId, weekStart: monday, name, startTime, endTime, hours: shiftHours(startTime, endTime), status: 'ACTIVE', inUse: false });
const morning = template('t-morning', 'Morning', '06:00:00', '14:00:00');
const evening = template('t-evening', 'Evening', '14:00:00', '22:00:00');

function scheduleWith(): ScheduleView {
  return {
    from: monday, to: addDays(monday, 6), draftCount: 1, gapCount: 1,
    assignments: [{
      shiftAssignmentId: 'a-1', userId: 'u-an', fullName: 'Nguyễn An', shiftId: morning.shiftId, shiftName: 'Morning', workDate: day,
      startsAt: `${day}T06:00:00+07:00`, endsAt: `${day}T14:00:00+07:00`, status: 'DRAFT', checkInAt: null,
      zones: [{ zoneId: 'z-b', zoneName: 'Checkout' }], editable: true, pendingSwapRequestId: null, updatedAt: '2026-10-20T00:00:00Z',
    }],
    coverage: [
      { workDate: day, shiftId: morning.shiftId, shiftName: 'Morning', zoneId: 'z-b', zoneName: 'Checkout', minStaff: 1, planned: 1, published: 0, belowMinimum: false },
      { workDate: day, shiftId: evening.shiftId, shiftName: 'Evening', zoneId: 'z-b', zoneName: 'Checkout', minStaff: 1, planned: 0, published: 0, belowMinimum: true },
    ],
  };
}

function storeRoutes() {
  routes['GET /api/supermarkets'] = () => json([{ supermarketId: 'store-1', code: 'S1', name: 'Central' }]);
  routes['GET /api/supermarkets/store-1/floors'] = () => json([{ floorId: 'f-1' }]);
  routes['GET /api/floors/f-1/zones'] = () => json([
    { zoneId: 'z-b', floorId: 'f-1', code: 'B', name: 'Checkout', status: 'ACTIVE' },
    { zoneId: 'z-c', floorId: 'f-1', code: 'C', name: 'Produce', status: 'ACTIVE' },
    { zoneId: 'z-x', floorId: 'f-1', code: 'X', name: 'Old storage', status: 'INACTIVE' },
  ]);
}

function show(path: string, element: React.ReactNode, pattern = path) {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /></Routes></MemoryRouter>);
}

describe('Manager console', () => {
  mockNativeDialogs();
  beforeEach(() => {
    calls = [];
    routes = {};
    saveSession({ accessToken: 'manager-token', expiresAt: '2099-01-01T00:00:00Z', user: manager }, true);
    serve();
  });

  it('shows the week with drafts and coverage gaps, and reports a refused publish', async () => {
    storeRoutes();
    routes['GET /api/schedule'] = () => json(scheduleWith());
    routes['GET /api/shifts'] = () => json([evening, morning]);
    routes['GET /api/swap-requests'] = () => json([]);
    routes['POST /api/schedule/publish'] = () => problemJson(409, 'COVERAGE_GAPS', 'Evening Sun: Checkout has 0 of 1 staff.');
    show('/manager/schedule', <Schedule />);

    const draft = await screen.findByRole('button', { name: /Nguyễn An, Morning .*, draft/ });
    expect(within(draft).getByText('Draft')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/schedule')!.query).toBe(`?from=${monday}&to=${addDays(monday, 6)}`);
    // Rows follow the start time, not the API order.
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Morning');
    expect(screen.getByText('Checkout · 0 planned · minimum 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Publish week (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout has 0 of 1 staff');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/schedule/publish', body: { from: monday, to: addDays(monday, 6) } });
  });

  it('keeps an inactive shift visible only when the viewed week already uses it', async () => {
    storeRoutes();
    const inactiveMorning = { ...morning, status: 'INACTIVE' };
    const unusedInactive = { ...template('t-old', 'Old shift', '10:00:00', '14:00:00'), status: 'INACTIVE' };
    routes['GET /api/schedule'] = () => json(scheduleWith());
    routes['GET /api/shifts'] = () => json([inactiveMorning, unusedInactive, evening]);
    routes['GET /api/swap-requests'] = () => json([]);
    show('/manager/schedule', <Schedule />);

    const assigned = await screen.findByRole('button', { name: /Nguyễn An, Morning/ });
    expect(assigned).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByText('Old shift')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assign staff to Morning/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Inactive shifts remain visible only when this week already has an assignment/)).toBeInTheDocument();
  });

  it('warns when published schedule history still references an inactive Zone', async () => {
    storeRoutes();
    const withInactiveZone = {
      ...scheduleWith(),
      assignments: [{
        ...scheduleWith().assignments[0],
        zones: [{ zoneId: 'z-x', zoneName: 'Old storage' }],
      }],
      coverage: [{
        workDate: day, shiftId: morning.shiftId, shiftName: 'Morning', zoneId: 'z-x', zoneName: 'Old storage',
        minStaff: 1, planned: 1, published: 1, belowMinimum: false,
      }],
    };
    routes['GET /api/schedule'] = () => json(withInactiveZone);
    routes['GET /api/shifts'] = () => json([morning]);
    routes['GET /api/swap-requests'] = () => json([]);
    show('/manager/schedule', <Schedule />);

    expect(await screen.findByText(/Published assignments in this week still reference inactive Zone: Old storage/)).toBeInTheDocument();
    expect(screen.getByText('Old storage (inactive)')).toBeInTheDocument();
    expect(screen.getByText('Old storage · inactive · 1 planned · minimum 1')).toBeInTheDocument();
  });

  it('assigns an eligible Staff member as a draft; ineligible ones show why', async () => {
    storeRoutes();
    routes['GET /api/schedule'] = () => json({ ...scheduleWith(), assignments: [], draftCount: 0 });
    routes['GET /api/shifts'] = () => json([morning]);
    routes['GET /api/swap-requests'] = () => json([]);
    const options: StaffOption[] = [
      { userId: 'u-lan', fullName: 'Hoàng Lan', eligible: true, weeklyHoursAfter: 16, problems: [] },
      { userId: 'u-duc', fullName: 'Minh Đức', eligible: false, weeklyHoursAfter: 52, problems: ['Would work 52 h that week (limit 48 h).'] },
    ];
    routes['GET /api/schedule/staff-options'] = () => json(options);
    routes['POST /api/schedule/assignments'] = (call) => json({ ...scheduleWith().assignments[0], userId: call.body!.userId, fullName: 'Hoàng Lan' });
    show('/manager/schedule', <Schedule />);

    const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00`));
    await userEvent.click(await screen.findByRole('button', { name: `Assign staff to Morning on ${dayName}` }));
    const blocked = await screen.findByRole('radio', { name: /Minh Đức/ });
    expect(blocked).toBeDisabled();
    expect(screen.getByText('Would work 52 h that week (limit 48 h).')).toBeInTheDocument();
    const zone = screen.getByRole('combobox', { name: 'Zone' });
    expect(zone).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Choose a zone' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'Checkout' })).not.toBeInTheDocument();
    expect(screen.queryByText('Old storage')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /Hoàng Lan/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add as draft' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a Zone.');
    await userEvent.selectOptions(zone, 'z-c');
    await userEvent.click(screen.getByRole('button', { name: 'Add as draft' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Hoàng Lan added as a draft');
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/api/schedule/assignments', body: { userId: 'u-lan', shiftId: morning.shiftId, workDate: day, zoneIds: ['z-c'] },
    });
  });

  it('normalizes a legacy multi-zone assignment to the first Zone when it is saved', async () => {
    storeRoutes();
    const existing = { ...scheduleWith().assignments[0], zones: [{ zoneId: 'z-b', zoneName: 'Checkout' }, { zoneId: 'z-c', zoneName: 'Produce' }] };
    routes['GET /api/schedule'] = () => json({ ...scheduleWith(), assignments: [existing] });
    routes['GET /api/shifts'] = () => json([morning]);
    routes['GET /api/swap-requests'] = () => json([]);
    routes['GET /api/schedule/staff-options'] = () => json([{ userId: existing.userId, fullName: existing.fullName, eligible: true, weeklyHoursAfter: 8, problems: [] }]);
    routes[`PATCH /api/schedule/assignments/${existing.shiftAssignmentId}`] = () => json({ ...existing, zones: [existing.zones[0]] });
    show('/manager/schedule', <Schedule />);

    await userEvent.click(await screen.findByRole('button', { name: /Nguyễn An, Morning .*, draft/ }));
    expect(await screen.findByRole('combobox', { name: 'Zone' })).toHaveValue('z-b');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: `/api/schedule/assignments/${existing.shiftAssignmentId}`, body: { zoneIds: ['z-b'] },
    }));
  });

  it('needs a reason to reject a swap, and shows the rule checks', async () => {
    const shift = (id: string, user: string, date: string) => ({
      shiftAssignmentId: id, userId: user, shiftName: 'Evening', workDate: date, startsAt: `${date}T14:00:00+07:00`, endsAt: `${date}T22:00:00+07:00`,
      zones: [{ zoneId: 'z-b', zoneName: 'Checkout' }],
    });
    const request: SwapRequest = {
      swapRequestId: 'sw-1', type: 'SWAP', status: 'PENDING_MANAGER',
      requester: { userId: 'u-thao', fullName: 'Thảo' }, requesterShift: shift('a-1', 'u-thao', day),
      target: { userId: 'u-duc', fullName: 'Minh Đức' }, targetShift: shift('a-2', 'u-duc', addDays(day, 1)),
      reasonCode: 'PERSONAL', note: 'Family dinner', createdAt: '2026-10-20T03:00:00Z', expiresAt: '2026-10-24T07:00:00Z',
      targetRespondedAt: '2026-10-20T04:00:00Z', decidedBy: null, decidedAt: null, decisionNote: null, cancelledBy: null, cancelledAt: null,
      cancellationReason: null, viewerRole: 'MANAGER', canCancel: false, canRespond: false, canDecide: true, updatedAt: '2026-10-20T04:00:00Z',
      checks: [
        { code: 'NO_OVERLAP', passed: true, message: 'Both free at the new times.' },
        { code: 'WEEKLY_HOURS', passed: false, message: 'Minh Đức would work 50 h (limit 48 h).' },
      ],
    };
    routes['GET /api/swap-requests/sw-1'] = () => json(request);
    routes['POST /api/swap-requests/sw-1/reject'] = (call) => json({ ...request, status: 'REJECTED', canDecide: false, decisionNote: call.body!.note, decidedAt: '2026-10-20T05:00:00Z' });
    show('/manager/swaps/sw-1', <SwapRequestDetail />, '/manager/swaps/:swapRequestId');

    expect(await screen.findByRole('heading', { name: 'Thảo ↔ Minh Đức' })).toBeInTheDocument();
    const comparison = screen.getByRole('table', { name: 'Assignment comparison' });
    const rows = within(comparison).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader', { name: 'Thảo' })).toBeInTheDocument();
    expect(within(rows[1]).getAllByText(/Evening/)).toHaveLength(2);
    expect(within(rows[2]).getByRole('rowheader', { name: 'Minh Đức' })).toBeInTheDocument();
    expect(within(rows[2]).getAllByText(/Evening/)).toHaveLength(2);
    expect(screen.getByText(/Minh Đức would work 50 h/)).toBeInTheDocument();
    expect(screen.getByText('1 check needs attention')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a reason before rejecting');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.type(screen.getByRole('textbox'), 'Over weekly hours');
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Rejected.');
    expect(calls.at(-1)).toMatchObject({ path: '/api/swap-requests/sw-1/reject', body: { note: 'Over weekly hours' } });
    expect(screen.queryByRole('button', { name: 'Approve swap' })).not.toBeInTheDocument();
  });

  it('uses weekly Work Shift language and only accepts 4, 6 or 8 hour shifts', async () => {
    routes['GET /api/shifts'] = () => json([morning]);
    routes['POST /api/shifts'] = (call) => json(template('t-new', String(call.body!.name), String(call.body!.startTime), String(call.body!.endTime)));
    show('/manager/shifts', <WorkShifts />);

    expect(await screen.findByRole('heading', { name: 'Work Shifts', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work Shifts' })).toHaveAttribute('href', '/manager/shifts');
    expect(screen.getByRole('heading', { name: /Work Shifts ·/, level: 2 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New Work Shift' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New Work Shift' })).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Night');
    const [start, end] = [within(dialog).getByLabelText('Start'), within(dialog).getByLabelText('End')];
    await userEvent.clear(start);
    await userEvent.type(start, '22:00');
    await userEvent.clear(end);
    await userEvent.type(end, '03:00');
    expect(within(dialog).getByText(/5 hours, ends the next day/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create Work Shift' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('A shift must last 4, 6 or 8 hours.');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.clear(end);
    await userEvent.type(end, '06:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create Work Shift' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'POST')).toMatchObject({ method: 'POST', body: { weekStart: monday, name: 'Night', startTime: '22:00:00', endTime: '06:00:00' } }));
    expect(await screen.findByRole('status')).toHaveTextContent('Night created');
  });

  it('filters weekly Work Shifts by active and inactive status', async () => {
    const inactive = { ...template('t-test', 'Test', '08:00:00', '16:00:00'), status: 'INACTIVE', inUse: true };
    routes['GET /api/shifts'] = () => json([morning, inactive, evening]);
    show('/manager/shifts', <WorkShifts />);

    const filter = await screen.findByRole('combobox', { name: 'Filter Work Shifts by status' });
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();

    await userEvent.selectOptions(filter, 'ACTIVE');
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();
    expect(screen.queryByText('Test')).not.toBeInTheDocument();

    await userEvent.selectOptions(filter, 'INACTIVE');
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.queryByText('Morning')).not.toBeInTheDocument();
  });

  it('formats dates as local store days', () => {
    expect(isoDate(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(weekStart(new Date(2026, 9, 25))).toBe('2026-10-19');
    expect(shiftHours('22:00', '06:00')).toBe(8);
    expect(shiftHasStarted('2026-10-28', '06:00:00', new Date('2026-10-28T06:00:00+07:00'))).toBe(true);
    expect(shiftHasStarted('2026-10-28', '14:00:00', new Date('2026-10-28T13:59:59+07:00'))).toBe(false);
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleView, WorkShift } from '../../api/planning';
import { saveSession } from '../../auth/session';
import { addDays, isoDate } from './dates';
import ZoneStaffing from './ZoneStaffing';
import { buildStaffingOverview, type StaffingFloor } from './zoneStaffingData';

const manager = { userId: 'mgr', email: 'mgr@store.test', fullName: 'Trần Minh', roleId: 'role-MANAGER', role: 'MANAGER', status: 'ACTIVE' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { path: string; query: string; method: string };
let calls: Call[];

const floors: StaffingFloor[] = [
  {
    floorId: 'f-1', floorNumber: 1, floorName: 'Ground floor',
    zones: [
      { zoneId: 'z-checkout', code: 'CHECKOUT', zoneName: 'Checkout' },
      { zoneId: 'z-produce', code: 'PRODUCE', zoneName: 'Produce' },
    ],
  },
  {
    floorId: 'f-2', floorNumber: 2, floorName: 'Upper floor',
    zones: [{ zoneId: 'z-frozen', code: 'FROZEN', zoneName: 'Frozen' }],
  },
];

const shift: WorkShift = {
  shiftId: 'shift-morning', weekStart: '2026-10-26', name: 'Morning', startTime: '06:00:00', endTime: '14:00:00', hours: 8, status: 'ACTIVE', inUse: true,
};

const assignment = (overrides: Record<string, unknown>) => ({
  shiftAssignmentId: 'a-1', userId: 'u-an', fullName: 'Nguyễn An', shiftId: shift.shiftId, shiftName: shift.name,
  workDate: '2026-10-26', startsAt: '2026-10-26T06:00:00+07:00', endsAt: '2026-10-26T14:00:00+07:00',
  status: 'SCHEDULED', checkInAt: null, zones: [{ zoneId: 'z-checkout', zoneName: 'Checkout' }], editable: true,
  pendingSwapRequestId: null, updatedAt: '2026-10-25T00:00:00Z', ...overrides,
});

function schedule(workDate: string): ScheduleView {
  return {
    from: workDate, to: workDate, draftCount: 1, gapCount: 2,
    assignments: [
      assignment({ workDate }),
      assignment({ shiftAssignmentId: 'a-legacy', workDate, checkInAt: `${workDate}T06:02:00+07:00` }),
      assignment({ shiftAssignmentId: 'a-2', userId: 'u-lan', fullName: 'Hoàng Lan', workDate, status: 'DRAFT' }),
      assignment({ shiftAssignmentId: 'a-3', userId: 'u-minh', fullName: 'Minh Đức', workDate, zones: [{ zoneId: 'z-frozen', zoneName: 'Frozen' }] }),
      assignment({ shiftAssignmentId: 'a-cancelled', userId: 'u-cancelled', fullName: 'Cancelled Staff', workDate, status: 'CANCELLED', zones: [{ zoneId: 'z-produce', zoneName: 'Produce' }] }),
      assignment({ shiftAssignmentId: 'a-other', userId: 'u-other', fullName: 'Other shift', workDate, shiftId: 'shift-evening' }),
    ],
    coverage: [
      { workDate, shiftId: shift.shiftId, shiftName: shift.name, zoneId: 'z-checkout', zoneName: 'Checkout', minStaff: 3, planned: 2, published: 1, belowMinimum: true },
      { workDate, shiftId: shift.shiftId, shiftName: shift.name, zoneId: 'z-produce', zoneName: 'Produce', minStaff: 1, planned: 0, published: 0, belowMinimum: true },
      { workDate, shiftId: shift.shiftId, shiftName: shift.name, zoneId: 'z-frozen', zoneName: 'Frozen', minStaff: 1, planned: 1, published: 1, belowMinimum: false },
    ],
  } as ScheduleView;
}

function serve(today: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, query: url.search, method: init?.method ?? 'GET' });
    if (url.pathname === '/api/supermarkets') return json([{ supermarketId: 'store-1', code: 'S1', name: 'Central', status: 'ACTIVE' }]);
    // The current Floor API has no lifecycle status; every returned Floor is available.
    if (url.pathname === '/api/supermarkets/store-1/floors') return json([
      { floorId: 'f-1', supermarketId: 'store-1', floorNumber: 1, name: 'Ground floor' },
      { floorId: 'f-2', supermarketId: 'store-1', floorNumber: 2, name: 'Upper floor' },
    ]);
    if (url.pathname === '/api/floors/f-1/zones') return json([
      { zoneId: 'z-checkout', floorId: 'f-1', code: 'CHECKOUT', name: 'Checkout', status: 'ACTIVE' },
      { zoneId: 'z-produce', floorId: 'f-1', code: 'PRODUCE', name: 'Produce', status: 'ACTIVE' },
      { zoneId: 'z-old', floorId: 'f-1', code: 'OLD', name: 'Old zone', status: 'INACTIVE' },
    ]);
    if (url.pathname === '/api/floors/f-2/zones') return json([{ zoneId: 'z-frozen', floorId: 'f-2', code: 'FROZEN', name: 'Frozen', status: 'ACTIVE' }]);
    if (url.pathname === '/api/shifts') return json([shift]);
    if (url.pathname === '/api/schedule') {
      const selected = url.searchParams.get('from') ?? today;
      return json(schedule(selected));
    }
    return json({ detail: 'Not found' }, 404);
  });
}

describe('Manager Zone staffing overview', () => {
  beforeEach(() => {
    calls = [];
    saveSession({ accessToken: 'manager-token', expiresAt: '2099-01-01T00:00:00Z', user: manager }, true);
  });

  it('aggregates every active Zone, distinct Staff and coverage state', () => {
    const overview = buildStaffingOverview(floors, schedule('2026-10-26'), shift.shiftId, '');

    expect(overview).toMatchObject({ floorCount: 2, zoneCount: 3, assignedStaff: 3, gapCount: 2 });
    expect(overview.floors[0]).toMatchObject({ floorName: 'Ground floor', zoneCount: 2, assignedStaff: 2 });
    expect(overview.floors[0].zones[0]).toMatchObject({ zoneName: 'Checkout', assigned: 2, minimum: 3, gap: true });
    expect(overview.floors[0].zones[0].staff).toEqual([
      { userId: 'u-lan', fullName: 'Hoàng Lan', state: 'Draft' },
      { userId: 'u-an', fullName: 'Nguyễn An', state: 'Checked in' },
    ]);
    expect(overview.floors[0].zones[1]).toMatchObject({ zoneName: 'Produce', assigned: 0, minimum: 1, gap: true, staff: [] });
    expect(overview.floors[1].zones[0]).toMatchObject({ zoneName: 'Frozen', assigned: 1, minimum: 1, gap: false });
  });

  it('shows the hierarchy and refetches only when the selected date changes', async () => {
    const today = isoDate(new Date());
    const future = addDays(today, 1);
    serve(today);
    render(
      <MemoryRouter initialEntries={['/manager/staffing']}>
        <Routes><Route path="/manager/staffing" element={<ZoneStaffing />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Zone staffing', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zone staffing' })).toHaveAttribute('href', '/manager/staffing');
    expect(screen.getByRole('combobox', { name: 'Shift' })).toHaveValue(shift.shiftId);
    expect(await screen.findByRole('heading', { name: 'Floor 1 · Ground floor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Floor 2 · Upper floor' })).toBeInTheDocument();
    expect(within(screen.getByTestId('zone-z-checkout')).getByText('2 / 3')).toBeInTheDocument();
    expect(within(screen.getByTestId('zone-z-produce')).getByText('No Staff assigned')).toBeInTheDocument();

    const scheduleCalls = calls.filter((call) => call.path === '/api/schedule').length;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Floor' }), 'f-2');
    expect(screen.queryByRole('heading', { name: 'Floor 1 · Ground floor' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Floor 2 · Upper floor' })).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/api/schedule')).toHaveLength(scheduleCalls);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: future } });
    await waitFor(() => expect(calls.some((call) => call.path === '/api/schedule' && call.query === `?from=${future}&to=${future}`)).toBe(true));
  });
});

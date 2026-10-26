import { listFloors, listSupermarkets, listZones } from '../../api/floors';
import type { ScheduleView, ScheduledShift } from '../../api/planning';

export type StaffingZone = { zoneId: string; code: string; zoneName: string };
export type StaffingFloor = { floorId: string; floorNumber: number; floorName: string; zones: StaffingZone[] };
export type StaffingState = 'Checked in' | 'Draft' | 'Published';
export type StaffingPersonView = { userId: string; fullName: string; state: StaffingState };
export type StaffingZoneView = StaffingZone & {
  assigned: number;
  minimum: number;
  gap: boolean;
  staff: StaffingPersonView[];
};
export type StaffingFloorView = Omit<StaffingFloor, 'zones'> & {
  zoneCount: number;
  assignedStaff: number;
  zones: StaffingZoneView[];
};
export type StaffingOverview = {
  floorCount: number;
  zoneCount: number;
  assignedStaff: number;
  gapCount: number;
  floors: StaffingFloorView[];
};

/** Loads the active physical hierarchy. Schedule assignments are deliberately loaded separately by date. */
export async function loadStaffingFloors(signal?: AbortSignal): Promise<StaffingFloor[]> {
  const stores = await listSupermarkets(signal);
  const store = stores.find((item) => item.status === 'ACTIVE') ?? stores[0];
  if (!store) return [];

  // Floor currently has no lifecycle status in the backend contract, so every returned Floor is available.
  const floorRecords = (await listFloors(store.supermarketId, signal))
    .sort((a, b) => a.floorNumber - b.floorNumber || a.name.localeCompare(b.name));

  return Promise.all(floorRecords.map(async (floor) => ({
    floorId: floor.floorId,
    floorNumber: floor.floorNumber,
    floorName: floor.name,
    zones: (await listZones(floor.floorId, signal))
      .filter((zone) => zone.status === 'ACTIVE')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((zone) => ({ zoneId: zone.zoneId, code: zone.code, zoneName: zone.name })),
  })));
}

const stateOf = (assignment: ScheduledShift): StaffingState => assignment.checkInAt
  ? 'Checked in'
  : assignment.status === 'DRAFT' ? 'Draft' : 'Published';

const stateRank: Record<StaffingState, number> = { 'Published': 1, 'Draft': 2, 'Checked in': 3 };

/** Builds a read-only Floor → Zone → Staff projection for one shift on the schedule's selected day. */
export function buildStaffingOverview(
  sourceFloors: StaffingFloor[],
  schedule: ScheduleView,
  shiftId: string,
  floorId: string,
): StaffingOverview {
  const floors = sourceFloors.filter((floor) => !floorId || floor.floorId === floorId);
  const assignments = schedule.assignments.filter((assignment) => assignment.shiftId === shiftId && assignment.status !== 'CANCELLED');
  const allStaff = new Set<string>();
  let zoneCount = 0;
  let gapCount = 0;

  const floorViews = floors.map<StaffingFloorView>((floor) => {
    const floorStaff = new Set<string>();
    const zones = floor.zones.map<StaffingZoneView>((zone) => {
      const byPerson = new Map<string, StaffingPersonView>();
      for (const assignment of assignments) {
        if (!assignment.zones.some((assignedZone) => assignedZone.zoneId === zone.zoneId)) continue;
        const state = stateOf(assignment);
        const existing = byPerson.get(assignment.userId);
        if (!existing || stateRank[state] > stateRank[existing.state]) {
          byPerson.set(assignment.userId, { userId: assignment.userId, fullName: assignment.fullName, state });
        }
      }

      const staff = [...byPerson.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
      staff.forEach((person) => {
        floorStaff.add(person.userId);
        allStaff.add(person.userId);
      });
      const minimum = schedule.coverage.find((coverage) => coverage.shiftId === shiftId && coverage.zoneId === zone.zoneId)?.minStaff ?? 0;
      const gap = staff.length < minimum;
      zoneCount += 1;
      if (gap) gapCount += 1;
      return { ...zone, assigned: staff.length, minimum, gap, staff };
    });

    return { ...floor, zoneCount: zones.length, assignedStaff: floorStaff.size, zones };
  });

  return { floorCount: floorViews.length, zoneCount, assignedStaff: allStaff.size, gapCount, floors: floorViews };
}

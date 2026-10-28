import { listFloors, listSupermarkets, listZones } from '../../api/floors';
import { getStaffOptions, listWorkShifts } from '../../api/planning';
import { isoDate, weekStart } from './dates';

export type StoreZone = { zoneId: string; name: string };
export type Person = { userId: string; fullName: string };

/** Every active Zone of the store (all floors), for choosing where a Staff member works. */
export async function listStoreZones(signal?: AbortSignal): Promise<StoreZone[]> {
  const stores = await listSupermarkets(signal);
  if (!stores.length) return [];
  const floors = await listFloors(stores[0].supermarketId, signal);
  const zones = (await Promise.all(floors.map((floor) => listZones(floor.floorId, signal)))).flat();
  return zones.filter((zone) => zone.status === 'ACTIVE').map((zone) => ({ zoneId: zone.zoneId, name: zone.name }));
}

/** Active Staff accounts. The planning API lists every one of them as a staff option for any shift. */
export async function listStaff(signal?: AbortSignal): Promise<Person[]> {
  const today = new Date();
  const workShifts = await listWorkShifts(weekStart(today), signal);
  const any = workShifts.find((shift) => shift.status === 'ACTIVE') ?? workShifts[0];
  if (!any) return [];
  const options = await getStaffOptions(any.shiftId, isoDate(new Date()), undefined, signal);
  return options.map(({ userId, fullName }) => ({ userId, fullName })).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** BR-33: Work Shifts last 4, 6 or 8 hours. */
export const ALLOWED_HOURS = [4, 6, 8];

/** BR-35: Managers cannot add or change an assignment after the shift starts in the store timezone. */
export function shiftHasStarted(workDate: string, startTime: string, now = new Date()): boolean {
  const normalizedTime = startTime.length === 5 ? `${startTime}:00` : startTime;
  return new Date(`${workDate}T${normalizedTime}+07:00`).getTime() <= now.getTime();
}

/** Length in hours of "HH:mm" times; an end at or before the start means the shift ends the next day. */
export function shiftHours(start: string, end: string): number {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = minutes(end) - minutes(start);
  return (diff <= 0 ? diff + 24 * 60 : diff) / 60;
}

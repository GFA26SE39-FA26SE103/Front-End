import { apiFetch } from './client';
import type { ZoneRecord } from './floors';

// MF-04 Manager shift planning and swap approval (Back-End docs/API.md, "MF-04 xếp ca cho Manager" and
// "MF-04 đổi ca SWAP/COVER"). Dates are local store dates (yyyy-MM-dd); instants are UTC ISO strings.

export type ShiftZone = { zoneId: string; zoneName: string };

export type WorkShift = { shiftId: string; weekStart: string; name: string; startTime: string; endTime: string; hours: number; status: 'ACTIVE' | 'INACTIVE' | string; inUse: boolean };
export type CreateWorkShiftRequest = { weekStart: string; name: string; startTime: string; endTime: string };
export type UpdateWorkShiftRequest = Partial<Omit<CreateWorkShiftRequest, 'weekStart'>> & { status?: string };

export type AssignmentStatus = 'DRAFT' | 'SCHEDULED' | 'CANCELLED';
export type ScheduledShift = {
  shiftAssignmentId: string; userId: string; fullName: string; shiftId: string; shiftName: string; workDate: string;
  startsAt: string; endsAt: string; status: AssignmentStatus | string; checkInAt: string | null; zones: ShiftZone[];
  editable: boolean; pendingSwapRequestId: string | null; updatedAt: string;
};
export type ZoneCoverage = {
  workDate: string; shiftId: string; shiftName: string; zoneId: string; zoneName: string;
  minStaff: number; planned: number; published: number; belowMinimum: boolean;
};
export type ScheduleView = { from: string; to: string; assignments: ScheduledShift[]; coverage: ZoneCoverage[]; draftCount: number; gapCount: number };
export type StaffOption = { userId: string; fullName: string; eligible: boolean; weeklyHoursAfter: number; problems: string[] };
export type PublishResult = { from: string; to: string; published: number; notified: number };

export type Unavailability = { unavailabilityId: string; userId: string; fullName: string; startAt: string; endAt: string; note: string | null; createdAt: string };
export type UnavailabilityRequest = { userId: string; startAt: string; endAt: string; note: string | null };

export type SwapPerson = { userId: string; fullName: string };
export type SwapShift = { shiftAssignmentId: string; userId: string; shiftName: string; workDate: string; startsAt: string; endsAt: string; zones: ShiftZone[] };
export type SwapCheck = { code: string; passed: boolean; message: string };
export type SwapStatus = 'PENDING_PEER' | 'PENDING_MANAGER' | 'APPROVED' | 'REJECTED' | 'DECLINED_BY_PEER' | 'CANCELLED' | 'EXPIRED';
export type SwapRequest = {
  swapRequestId: string; type: 'SWAP' | 'COVER' | string; status: SwapStatus | string;
  requester: SwapPerson; requesterShift: SwapShift; target: SwapPerson | null; targetShift: SwapShift | null;
  reasonCode: string | null; note: string | null; createdAt: string; expiresAt: string | null; targetRespondedAt: string | null;
  decidedBy: SwapPerson | null; decidedAt: string | null; decisionNote: string | null;
  cancelledBy: SwapPerson | null; cancelledAt: string | null; cancellationReason: string | null;
  viewerRole: string; canCancel: boolean; canRespond: boolean; canDecide: boolean; checks: SwapCheck[]; updatedAt: string;
};

const id = encodeURIComponent;
const post = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const listWorkShifts = (weekStart: string, signal?: AbortSignal) =>
  apiFetch<WorkShift[]>(`/api/shifts?weekStart=${weekStart}`, { signal });
export const createWorkShift = (request: CreateWorkShiftRequest) => post<WorkShift>('/api/shifts', request);
export const updateWorkShift = (shiftId: string, request: UpdateWorkShiftRequest) =>
  apiFetch<WorkShift>(`/api/shifts/${id(shiftId)}`, { method: 'PATCH', body: JSON.stringify(request) });
export const copyWorkShiftWeek = (sourceWeekStart: string, targetWeekStart: string) =>
  post<WorkShift[]>('/api/shifts/copy-week', { sourceWeekStart, targetWeekStart });

export const getSchedule = (from: string, to: string, signal?: AbortSignal) =>
  apiFetch<ScheduleView>(`/api/schedule?from=${from}&to=${to}`, { signal });
export const getStaffOptions = (shiftId: string, workDate: string, replacingAssignmentId?: string, signal?: AbortSignal) =>
  apiFetch<StaffOption[]>(`/api/schedule/staff-options?shiftId=${id(shiftId)}&workDate=${workDate}${replacingAssignmentId ? `&replacingAssignmentId=${id(replacingAssignmentId)}` : ''}`, { signal });
export const assignShift = (request: { userId: string; shiftId: string; workDate: string; zoneIds: string[] }) =>
  post<ScheduledShift>('/api/schedule/assignments', request);
export const updateAssignment = (assignmentId: string, request: { userId?: string; zoneIds?: string[] }) =>
  apiFetch<ScheduledShift>(`/api/schedule/assignments/${id(assignmentId)}`, { method: 'PATCH', body: JSON.stringify(request) });
export const cancelAssignment = (assignmentId: string, reason: string | null) =>
  post<ScheduledShift>(`/api/schedule/assignments/${id(assignmentId)}/cancel`, { reason });
export const publishSchedule = (from: string, to: string) => post<PublishResult>('/api/schedule/publish', { from, to });
export const updateZoneMinimumStaff = (zoneId: string, minStaff: number, expectedUpdatedAt: string) =>
  apiFetch<ZoneRecord>(`/api/zones/${id(zoneId)}/minimum-staff`, {
    method: 'PATCH', body: JSON.stringify({ minStaff, expectedUpdatedAt }),
  });

export const listUnavailability = (from: string, to: string, signal?: AbortSignal) =>
  apiFetch<Unavailability[]>(`/api/staff-unavailability?from=${from}&to=${to}`, { signal });
export const addUnavailability = (request: UnavailabilityRequest) => post<Unavailability>('/api/staff-unavailability', request);
export const removeUnavailability = (unavailabilityId: string) =>
  apiFetch<void>(`/api/staff-unavailability/${id(unavailabilityId)}`, { method: 'DELETE' });

/** `status` is a comma list, `ALL`, or omitted for PENDING_MANAGER (the Manager's queue). */
export const listSwapRequests = (status?: string, signal?: AbortSignal) =>
  apiFetch<SwapRequest[]>(`/api/swap-requests${status ? `?status=${id(status)}` : ''}`, { signal });
export const getSwapRequest = (swapRequestId: string, signal?: AbortSignal) => apiFetch<SwapRequest>(`/api/swap-requests/${id(swapRequestId)}`, { signal });
export const approveSwap = (swapRequestId: string, note: string | null) => post<SwapRequest>(`/api/swap-requests/${id(swapRequestId)}/approve`, { note });
export const rejectSwap = (swapRequestId: string, note: string) => post<SwapRequest>(`/api/swap-requests/${id(swapRequestId)}/reject`, { note });

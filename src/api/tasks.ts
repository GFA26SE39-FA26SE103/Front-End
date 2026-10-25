import { apiFetch } from './client';

export const taskStatuses = ['OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'CANCELLED'] as const;
export type TaskStatus = typeof taskStatuses[number];
export type OperationalTask = {
  taskId: string; origin: string; sourceCode: string; eventTypeCode: string | null;
  title: string; instructions: string | null; priority: string; raisedFrom: string | null;
  zoneId: string; zoneName: string; cameraCode: string | null; status: TaskStatus; assignmentType: string;
  assigneeUserId: string | null; assigneeName: string | null; createdAt: string;
  assignedAt: string | null; acceptedAt: string | null; plannedStartAt: string | null;
  startedAt: string | null; submittedAt: string | null; eventClearedAt: string | null;
  needsAssignment: boolean; updatedAt: string;
};
export type AssignableStaff = {
  userId: string; fullName: string; assignedToZone: boolean; activeTasks: number; shiftEndsAt: string;
};
export type TaskAssignment = { staffUserId: string; reason: string | null; expectedUpdatedAt: string };
const taskPath = (id: string) => `/api/tasks/${encodeURIComponent(id)}`;
export function listTasks(query: { status?: string; needsAssignment?: boolean } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.needsAssignment) params.set('needsAssignment', 'true');
  return apiFetch<OperationalTask[]>(`/api/tasks${params.size ? `?${params}` : ''}`, { signal });
}
export const getTask = (id: string, signal?: AbortSignal) => apiFetch<OperationalTask>(taskPath(id), { signal });
export const listAssignableStaff = (id: string, signal?: AbortSignal) => apiFetch<AssignableStaff[]>(`${taskPath(id)}/assignable-staff`, { signal });
export const assignTask = (id: string, assignment: TaskAssignment, signal?: AbortSignal) => apiFetch<OperationalTask>(`${taskPath(id)}/assign`, {
  method: 'POST', body: JSON.stringify(assignment), signal,
});

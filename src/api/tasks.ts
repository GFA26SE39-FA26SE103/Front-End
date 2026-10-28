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

// MF-03 completion: Staff evidence and submission, independent Operator verification (Report 3 §3.7.4–3.7.5).
export type EvidencePhoto = { evidenceId: string; evidenceType: 'BEFORE_PHOTO' | 'AFTER_PHOTO'; imageUrl: string; capturedAt: string };
export type ReviewStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type TaskSubmission = {
  submissionId: string; submittedByUserId: string; submittedByName: string | null; note: string; submittedAt: string;
  reviewStatus: ReviewStatus; rejectReason: string | null; photos: EvidencePhoto[];
};
export type TaskEvidence = {
  taskId: string; taskStatus: TaskStatus; requiresBeforePhoto: boolean; requiresAfterPhoto: boolean; rejectionCount: number;
  drafts: EvidencePhoto[]; submissions: TaskSubmission[];
};
export type TaskCompletionResult = {
  taskId: string; status: TaskStatus; submittedAt: string | null; verifiedAt: string | null; rejectionCount: number;
  assigneeUserId: string | null; updatedAt: string; evidence: TaskEvidence;
};
export const getTaskEvidence = (id: string, signal?: AbortSignal) => apiFetch<TaskEvidence>(`${taskPath(id)}/evidence`, { signal });
/** Photo bytes need the session token, so they are fetched as a blob rather than linked. */
export const getEvidenceImage = (imageUrl: string, signal?: AbortSignal) => apiFetch<Blob>(imageUrl, { responseType: 'blob', signal });
export const verifyTask = (id: string, expectedUpdatedAt: string) => apiFetch<TaskCompletionResult>(`${taskPath(id)}/verify`, {
  method: 'POST', body: JSON.stringify({ expectedUpdatedAt }),
});
export const rejectTask = (id: string, reason: string, expectedUpdatedAt: string) => apiFetch<TaskCompletionResult>(`${taskPath(id)}/reject`, {
  method: 'POST', body: JSON.stringify({ reason, expectedUpdatedAt }),
});

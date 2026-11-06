import { apiFetch } from './client';

export type TaskType = {
  taskTypeId: string;
  code: string;
  name: string;
  description: string | null;
  requiredSpecialtyId: string;
};

export const listTaskTypes = (signal?: AbortSignal) =>
  apiFetch<TaskType[]>('/api/task-types', { signal });

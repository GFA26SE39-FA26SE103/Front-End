import { apiFetch } from './client';
import type { AuthUser } from '../auth/session';

export type AccountRecord = AuthUser & {
  specialtyId: string | null;
  specialtyCode: string | null;
  specialtyName: string | null;
};
export type RoleRecord = { roleId: string; name: string; description?: string | null };
export type StaffSpecialtyRecord = { specialtyId: string; code: string; name: string; description: string | null };
export type CreateAccountRequest = { email: string; password: string; fullName: string; roleId: string; specialtyId: string | null };
export type UpdateAccountRequest = { fullName: string; roleId: string; specialtyId: string | null };

export const listAccounts = (signal?: AbortSignal) => apiFetch<AccountRecord[]>('/api/users', { signal });
export const listRoles = (signal?: AbortSignal) => apiFetch<RoleRecord[]>('/api/roles', { signal });
export const listStaffSpecialties = (signal?: AbortSignal) => apiFetch<StaffSpecialtyRecord[]>('/api/staff-specialties', { signal });
export const createAccount = (request: CreateAccountRequest) => apiFetch<AccountRecord>('/api/users', { method: 'POST', body: JSON.stringify(request) });
export const updateAccount = (id: string, request: UpdateAccountRequest) => apiFetch<AccountRecord>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(request) });
export const setAccountEnabled = (id: string, enabled: boolean) => apiFetch<AccountRecord>(`/api/users/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });

import { apiFetch } from './client';
import type { AuthUser } from '../auth/session';

export type AccountRecord = AuthUser;
export type RoleRecord = { roleId: string; name: string; description?: string | null };
export type CreateAccountRequest = { email: string; password: string; fullName: string; roleId: string };
export type UpdateAccountRequest = { fullName: string; roleId: string };

export const listAccounts = (signal?: AbortSignal) => apiFetch<AccountRecord[]>('/api/users', { signal });
export const listRoles = (signal?: AbortSignal) => apiFetch<RoleRecord[]>('/api/roles', { signal });
export const createAccount = (request: CreateAccountRequest) => apiFetch<AccountRecord>('/api/users', { method: 'POST', body: JSON.stringify(request) });
export const updateAccount = (id: string, request: UpdateAccountRequest) => apiFetch<AccountRecord>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(request) });
export const setAccountEnabled = (id: string, enabled: boolean) => apiFetch<AccountRecord>(`/api/users/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });

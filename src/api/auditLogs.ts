import { apiFetch } from './client';

/** FE-12 §3.13.3: read-only Admin audit-log inspection (`/api/admin/audit-logs`). */
export type AuditLogEntry = {
  auditLogId: string; createdAt: string; userId: string | null; userName: string | null; userEmail: string | null; userRole: string | null;
  action: string; entityType: string; entityId: string | null; reason: string | null; resultStatus: string | null; ipAddress: string | null;
  oldValuesJson: string | null; newValuesJson: string | null;
};
export type AuditLogPage = { items: AuditLogEntry[]; totalCount: number; page: number; pageSize: number; generatedAt: string; timeZone: string };
export type AuditLogFacets = { actions: string[]; entityTypes: string[]; results: string[]; actors: { userId: string; fullName: string; role: string | null }[] };
export type AuditLogFilter = {
  from?: string; to?: string; userId?: string; action?: string; entityType?: string; result?: string; search?: string; page?: number; pageSize?: number;
};

export function listAuditLogs(filter: AuditLogFilter, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value !== undefined && value !== '') params.set(key, String(value));
  return apiFetch<AuditLogPage>(`/api/admin/audit-logs${params.size ? `?${params}` : ''}`, { signal });
}
export const getAuditLogFacets = (signal?: AbortSignal) => apiFetch<AuditLogFacets>('/api/admin/audit-logs/facets', { signal });

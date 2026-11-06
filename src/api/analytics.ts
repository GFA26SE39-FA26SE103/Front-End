import { apiFetch } from './client';

export type AnalyticsQuery = { from?: string; to?: string; zoneId?: string };
export type AnalyticsPeriod = {
  from: string; to: string; timeZone: string; fromUtc: string; toUtcExclusive: string;
  generatedAt: string; zoneId: string | null;
};
export type AnalyticsDuration = { samples: number; averageSeconds: number | null };
export type AnalyticsSla = { evaluated: number; met: number; breached: number; pending: number; unavailable: number; metPercent: number | null };
export type AnalyticsSummary = {
  events: { total: number; active: number; cleared: number; latestCritical: number; clearTime: AnalyticsDuration };
  incidents: { recorded: number; total: number; open: number; closed: number; dismissed: number; resolutionTime: AnalyticsDuration };
  tasks: {
    total: number; byStatus: Record<string, number>; responseTime: AnalyticsDuration; completionTime: AnalyticsDuration;
    responseSla: AnalyticsSla; resolutionSla: AnalyticsSla;
  };
};
export type AnalyticsOverview = { period: AnalyticsPeriod; summary: AnalyticsSummary };
export type AnalyticsTrends = { period: AnalyticsPeriod; days: { date: string; summary: AnalyticsSummary }[] };
export type AnalyticsZones = { period: AnalyticsPeriod; zones: { zoneId: string; zoneName: string; summary: AnalyticsSummary }[] };

function read<T>(path: string, query: AnalyticsQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.zoneId) params.set('zoneId', query.zoneId);
  return apiFetch<T>(`/api/manager/analytics/${path}${params.size ? `?${params}` : ''}`, { signal });
}

export const getAnalyticsOverview = (query: AnalyticsQuery = {}, signal?: AbortSignal) => read<AnalyticsOverview>('overview', query, signal);
export const getAnalyticsTrends = (query: AnalyticsQuery = {}, signal?: AbortSignal) => read<AnalyticsTrends>('trends', query, signal);
export const getAnalyticsZones = (query: AnalyticsQuery = {}, signal?: AbortSignal) => read<AnalyticsZones>('zones', query, signal);

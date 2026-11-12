import { apiFetch } from './client';

export type RecommendationWorkspace = 'manager' | 'operator';
export type RecommendationStatus = 'AVAILABLE' | 'DEFERRED' | 'ACCEPTED' | 'DISMISSED' | 'EXPIRED';
export type RecommendationDecision = 'ACCEPTED' | 'DEFERRED' | 'DISMISSED';
export type Recommendation = {
  recommendationId: string;
  zoneId: string | null;
  eventId: string | null;
  recommendationType: string;
  title: string;
  description: string;
  status: RecommendationStatus;
  generatedAt: string;
  expiresAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  evidence: {
    signal: { eventType: string; alertLevel: string; metric: number; unit: string; warningThreshold: number;
      criticalThreshold: number; sustainSeconds: number; slaPriority: string | null };
    observedAt: string;
    confidence: string;
    slaPolicyVersion: number | null;
  } | null;
};

type RecommendationPage = { items: Recommendation[]; page: number; pageSize: number; hasMore: boolean };
type GenerationResult = { recommendation: Recommendation | null; reason: string | null };
const base = (workspace: RecommendationWorkspace) => `/api/${workspace}/recommendations`;

export function listRecommendations(workspace: RecommendationWorkspace, page: number, status: RecommendationStatus | '', signal: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (workspace === 'manager' && status) params.set('status', status);
  return apiFetch<RecommendationPage>(`${base(workspace)}?${params}`, { signal });
}

export const getRecommendation = (workspace: RecommendationWorkspace, id: string, signal: AbortSignal) =>
  apiFetch<Recommendation>(`${base(workspace)}/${encodeURIComponent(id)}`, { signal });

export const decideRecommendation = (id: string, decision: RecommendationDecision, reason: string) =>
  apiFetch<Recommendation>(`${base('manager')}/${encodeURIComponent(id)}/decision`, {
    method: 'POST', body: JSON.stringify({ decision, reason: reason.trim() || null }),
  });

export const generateRecommendation = (eventId: string, signal: AbortSignal) =>
  apiFetch<GenerationResult>(`${base('manager')}/generate`, {
    method: 'POST', body: JSON.stringify({ eventId }), timeoutMs: 125000, signal,
  });

import { clearSession, loadSession } from '../auth/session';

type ResponseType = 'json' | 'blob' | 'text';
const DEFAULT_TIMEOUT_MS = 15000;
export type ApiFetchInit = RequestInit & { responseType?: ResponseType; timeoutMs?: number };

const apiUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:5080').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = void>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { responseType = 'json', timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  const session = loadSession();
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  const isFormData = typeof FormData !== 'undefined' && requestInit.body instanceof FormData;
  if (requestInit.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const timeoutController = new AbortController();
  const externalSignal = requestInit.signal;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromCaller = () => timeoutController.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
  }

  try {
    const response = await fetch(`${apiUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
      ...requestInit,
      headers,
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      let problem: { code?: string; title?: string; detail?: string; message?: string; errors?: Record<string, string[]> } = {};
      try {
        problem = await response.json() as typeof problem;
      } catch {
        // Empty and non-JSON failures still become a typed, sanitized error.
      }
      if (response.status === 401) {
        clearSession();
        window.dispatchEvent(new Event('auth:expired'));
      }
      throw new ApiError(
        response.status,
        problem.code ?? problem.title ?? (response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED'),
        problem.detail ?? problem.message ?? Object.values(problem.errors ?? {}).flat()[0] ?? 'The request could not be completed.',
      );
    }

    if (response.status === 204) return undefined as T;
    if (responseType === 'blob') return await response.blob() as T;
    if (responseType === 'text') return await response.text() as T;
    return await response.json() as T;
  } catch (error) {
    if (timedOut) throw new ApiError(504, 'REQUEST_TIMEOUT', `The request timed out after ${timeoutMs} ms.`);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

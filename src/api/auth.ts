import { ApiError, apiFetch } from './client';
import { saveSession, type AuthSession } from '../auth/session';

export type SignInResult = 'ok' | 'invalid' | 'error' | 'suspended' | 'rate-limited';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_SECONDS = 15 * 60;

export async function signIn(email: string, password: string, remember: boolean): Promise<SignInResult> {
  try {
    const session = await apiFetch<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (session.user.status !== 'ACTIVE') return 'suspended';
    saveSession(session, remember);
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) return 'rate-limited';
      if (error.code === 'ACCOUNT_DISABLED') return 'suspended';
      if (error.status === 401 || error.code === 'INVALID_CREDENTIALS') return 'invalid';
    }
    return 'error';
  }
}


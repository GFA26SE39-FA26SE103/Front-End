export type AuthUser = {
  userId: string;
  email: string;
  fullName: string;
  roleId: string;
  role: string;
  status: string;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

const SESSION_KEY = 'shepherd.auth.session';

export function saveSession(session: AuthSession, remember: boolean): void {
  clearSession();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): AuthSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    const expiry = Date.parse(session.expiresAt);
    if (!session.accessToken || !Number.isFinite(expiry) || expiry <= Date.now() || !session.user?.userId) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function updateSessionUser(user: AuthUser): void {
  const session = loadSession();
  if (!session) return;
  if (JSON.stringify(session.user) === JSON.stringify(user)) return;
  const storage = sessionStorage.getItem(SESSION_KEY) ? sessionStorage : localStorage;
  storage.setItem(SESSION_KEY, JSON.stringify({ ...session, user }));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}


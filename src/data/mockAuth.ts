// Stand-in for POST /auth/login until the backend exists.
// Demo rules: an email containing "suspended" or "error" triggers those states;
// the password "wrong" is rejected; anything else signs in.

export type SignInResult = 'ok' | 'invalid' | 'error' | 'suspended';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_SECONDS = 15 * 60;

export function signIn(email: string, password: string): Promise<SignInResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const e = email.toLowerCase();
      if (e.includes('suspended')) resolve('suspended');
      else if (e.includes('error')) resolve('error');
      else if (password === 'wrong') resolve('invalid');
      else resolve('ok');
    }, 900);
  });
}

export function requestReset(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 600));
}

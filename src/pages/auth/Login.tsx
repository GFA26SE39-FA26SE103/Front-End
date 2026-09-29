import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../../components/AuthLayout';
import { Icon } from '../../components/Icon';
import { LOCK_SECONDS, MAX_FAILED_ATTEMPTS, signIn } from '../../data/mockAuth';
import s from './auth.module.css';

type Status = 'idle' | 'loading' | 'invalid' | 'error' | 'suspended';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionExpired = params.get('reason') === 'session-expired';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState('');
  const [failed, setFailed] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);

  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = window.setTimeout(() => setLockLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [lockLeft]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@') || !password) {
      setFormError('Enter your work email and password.');
      return;
    }
    setFormError('');
    setStatus('loading');
    const result = await signIn(email, password);
    if (result === 'ok') {
      navigate('/admin/dashboard'); // TODO: route by role once the API returns it
      return;
    }
    if (result === 'invalid') {
      const n = failed + 1;
      setFailed(n);
      if (n >= MAX_FAILED_ATTEMPTS) setLockLeft(LOCK_SECONDS);
    }
    setStatus(result);
  }

  if (lockLeft > 0) return <Blocked email={email} lockLeft={lockLeft} />;

  const loading = status === 'loading';
  const suspended = status === 'suspended';
  const errorInputs = status === 'invalid';

  const heading =
    loading ? { title: 'Signing in', hint: 'Please wait while we verify your account.' }
    : status === 'error' ? { title: 'Unable to sign in', hint: 'We couldn’t complete your sign-in request.' }
    : suspended ? { title: 'Account suspended', hint: 'This account cannot access the operations workspace.' }
    : sessionExpired ? { title: 'Sign in again', hint: 'Re-enter your password to continue securely.' }
    : { title: 'Sign in', hint: 'Use your operations account to continue.' };

  const alert =
    status === 'invalid' ? { tone: 'var(--color-danger)', icon: 'auth-alert-danger', title: 'Email or password is incorrect', text: `Check your details and try again. ${MAX_FAILED_ATTEMPTS - failed} attempt${MAX_FAILED_ATTEMPTS - failed === 1 ? '' : 's'} left before the account is locked.` }
    : status === 'error' ? { tone: 'var(--color-danger)', icon: 'auth-alert-danger', title: 'Something went wrong', text: 'The service is temporarily unavailable. Try again in a moment.' }
    : suspended ? { tone: 'var(--color-danger)', icon: 'auth-alert-danger', title: 'Access disabled by an administrator', text: 'Contact your store administrator to restore access.' }
    : sessionExpired && status === 'idle' ? { tone: 'var(--color-warning)', icon: 'auth-clock-warning', title: 'Session expired', text: 'Sign in again to continue where you left off.' }
    : null;

  const footnote =
    loading ? 'Checking your account and permissions…'
    : status === 'error' ? 'If the issue continues, contact your administrator.'
    : suspended ? 'Need access restored? Contact your store administrator.'
    : sessionExpired ? 'For security, sessions expire after a period of inactivity.'
    : 'Role-based access · Operator · Manager · Administrator · Staff app on mobile';

  return (
    <AuthLayout>
      <form className={s.form} onSubmit={submit} noValidate aria-busy={loading}>
        <div>
          <h2 className={s.title}>{heading.title}</h2>
          <p className={s.hint}>{heading.hint}</p>
        </div>

        {alert && (
          <div className={s.alert} style={{ '--tone': alert.tone } as CSSProperties} role="alert">
            <Icon name={alert.icon} size={18} />
            <div>
              <p className={s.alertTitle}>{alert.title}</p>
              <p className={s.alertText}>{alert.text}</p>
            </div>
          </div>
        )}

        <label className={`${s.label} ${loading || suspended ? s.disabled : ''}`}>
          Email
          <span className={`${s.inputBox} ${errorInputs ? s.inputError : ''}`}>
            <Icon name="login-mail" size={16} />
            <input type="email" autoComplete="username" placeholder="you@store.com" value={email} disabled={loading || suspended} onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle'); }} />
          </span>
        </label>
        <label className={`${s.label} ${loading || suspended ? s.disabled : ''}`}>
          Password
          <span className={`${s.inputBox} ${errorInputs ? s.inputError : ''}`}>
            <Icon name="login-lock" size={16} />
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder={sessionExpired ? 'Enter your password' : '••••••••••'} value={password} disabled={loading || suspended} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>
              <Icon name="login-eye" size={16} />
            </button>
          </span>
        </label>

        {!suspended && (
          <div className={s.row} style={loading ? { opacity: 0.5 } : undefined}>
            <label className={s.remember}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={loading} />
              Remember me
            </label>
            <Link className={s.link} to="/forgot-password">Forgot password?</Link>
          </div>
        )}

        {formError && <p className={s.errorText} role="alert">{formError}</p>}

        {suspended ? (
          <button type="button" className={s.primary} onClick={() => { setStatus('idle'); setEmail(''); setPassword(''); }}>
            Back to sign in
            <Icon name="login-arrow-right" size={14} />
          </button>
        ) : (
          <button type="submit" className={s.primary} disabled={loading}>
            {loading && <Icon name="auth-loader" size={14} className={s.spin} />}
            {loading ? 'Signing in…' : status === 'error' ? 'Try again' : sessionExpired ? 'Sign in again' : 'Sign in'}
            {!loading && <Icon name="login-arrow-right" size={14} />}
          </button>
        )}
        <p className={s.footnote}>{footnote}</p>
      </form>
    </AuthLayout>
  );
}

function Blocked({ email, lockLeft }: { email: string; lockLeft: number }) {
  return (
    <AuthLayout plain>
      <div className={`${s.form} ${s.wide}`}>
        <div>
          <h2 className={s.title}>Sign in</h2>
          <p className={s.hint}>Use your operations account to continue.</p>
        </div>
        <div className={s.lockAlert} role="alert">
          <span className={s.lockBadge}>!</span>
          <div>
            <p className={s.alertTitle} style={{ '--tone': 'var(--color-danger)', fontSize: 13 } as CSSProperties}>Too many failed sign-in attempts</p>
            <p style={{ fontSize: 11, marginTop: 5 }}>Try again in {mmss(lockLeft)} or reset your password.</p>
          </div>
        </div>
        <label className={`${s.label} ${s.labelStrong}`}>
          Email
          <span className={s.inputBox}><input value={email} readOnly /></span>
        </label>
        <label className={`${s.label} ${s.labelStrong}`}>
          Password
          <span className={`${s.inputBox} ${s.inputLocked}`}><input type="password" value="••••••••••" readOnly /></span>
        </label>
        <p className={s.errorText}>The password was incorrect. Your account is temporarily locked after {MAX_FAILED_ATTEMPTS} failed attempts.</p>
        <button type="button" className={s.muted} disabled>Try again in {mmss(lockLeft)}</button>
        <Link to="/forgot-password" className={s.outline} style={{ textDecoration: 'none' }}>Reset password</Link>
        <div className={`${s.panel} ${s.panelPlain}`}>
          <p className={s.overline}>SECURITY NOTICE</p>
          <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>This attempt and device information were recorded in the audit log.</p>
        </div>
        <p className={s.center}>Need urgent access? Contact your store administrator.</p>
      </div>
    </AuthLayout>
  );
}

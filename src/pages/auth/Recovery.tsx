import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../../components/AuthLayout';
import { Icon } from '../../components/Icon';
import { requestReset } from '../../data/mockAuth';
import s from './auth.module.css';

function Shell({ children, gap = 14 }: { children: ReactNode; gap?: number }) {
  return (
    <AuthLayout plain>
      <div className={`${s.form} ${s.wide}`} style={{ gap }}>
        <Link to="/login" className={`${s.link} ${s.back}`}>←&nbsp;&nbsp;Back to sign in</Link>
        {children}
      </div>
    </AuthLayout>
  );
}

function Circle({ size, tone = 'primary', children }: { size: number; tone?: 'primary' | 'warning'; children: ReactNode }) {
  return (
    <span className={s.iconCircle} style={{ width: size, height: size, ...(tone === 'warning' ? { background: 'var(--color-warning)' } : null) }}>
      {children}
    </span>
  );
}

/* ---------- 1. Forgot password ---------- */
export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return setError('Enter the email of your operations account.');
    setSending(true);
    await requestReset(); // TODO: POST /auth/forgot-password
    navigate(`/forgot-password/sent?email=${encodeURIComponent(email)}`);
  }

  return (
    <Shell gap={16}>
      <Circle size={52}>@</Circle>
      <h2 className={s.title} style={{ margin: 0 }}>Reset your password</h2>
      <p className={s.hint}>Enter the email associated with your operations account. We’ll send you a secure reset link.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label className={`${s.label} ${s.labelStrong}`}>
          Email
          <span className={`${s.inputBox} ${error ? s.inputError : ''}`}>
            <input type="email" autoComplete="username" placeholder="you@store.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
          </span>
        </label>
        {error && <p className={s.errorText} role="alert">{error}</p>}
        <button type="submit" className={s.primary} disabled={sending}>{sending ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <div className={s.panel}>
        <p className={s.overline}>WHAT HAPPENS NEXT</p>
        <p className={s.bullet}><i style={{ background: 'var(--color-success)' }} />The reset link expires after 15 minutes.</p>
        <p className={s.bullet}><i style={{ background: 'var(--color-success)' }} />Check your spam folder if it does not arrive.</p>
        <p className={s.bullet}><i style={{ background: 'var(--color-warning)' }} />Contact an administrator if your account is locked.</p>
      </div>
      <p className={s.center}>For security, we will not confirm whether an email is registered.</p>
    </Shell>
  );
}

/* ---------- 2. Reset link sent ---------- */
export function ResetLinkSent() {
  const [params] = useSearchParams();
  const email = params.get('email') || 'your account email';
  const [resent, setResent] = useState(false);

  return (
    <Shell>
      <Circle size={56}><Icon name="auth-check-lg" size={26} /></Circle>
      <h2 className={s.title} style={{ margin: 0 }}>Check your inbox</h2>
      <p className={s.hint}>If an account exists for {email}, we sent a secure password reset link.</p>
      <div className={s.panel} style={{ gap: 8 }}>
        <p className={s.overline} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)' }}>
          <Icon name="auth-mail-primary" size={18} />RESET LINK SENT
        </p>
        <p style={{ fontSize: 14, fontWeight: 600 }}>{email}</p>
        <p style={{ fontSize: 11 }}>The secure link expires in 15 minutes.</p>
      </div>
      <Link to="/login" className={s.primary} style={{ textDecoration: 'none' }}>Back to sign in</Link>
      <button type="button" className={`${s.outline} ${s.outlineNeutral}`} onClick={async () => { await requestReset(); setResent(true); }} disabled={resent}>
        {resent ? 'Email sent again' : 'Resend email'}
      </button>
      <p className={s.center}>Didn’t receive it? Check your spam folder before requesting another link.</p>
      <p className={s.center}>
        Demo: <Link className={s.link} style={{ fontSize: 10 }} to="/reset-password">open the reset link</Link> · <Link className={s.link} style={{ fontSize: 10 }} to="/reset-password/expired">open an expired link</Link>
      </p>
    </Shell>
  );
}

/* ---------- 3. Set a new password ---------- */
const rules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
const strengthLabel = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColor = ['var(--color-danger)', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)'];

export function SetNewPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(12 * 60 + 42);

  useEffect(() => {
    if (left <= 0) {
      navigate('/reset-password/expired');
      return;
    }
    const t = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, navigate]);

  const passed = rules.filter((r) => r.test(pw)).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (passed < rules.length) return setError('The password does not meet all requirements yet.');
    if (pw !== confirm) return setError('The two passwords do not match.');
    navigate('/reset-password/done'); // TODO: POST /auth/reset-password
  }

  return (
    <Shell gap={10}>
      <Circle size={48}><Icon name="auth-lock-primary" size={24} /></Circle>
      <h2 className={s.title} style={{ margin: 0 }}>Set a new password</h2>
      <p className={s.hint}>Create a strong password for your operations account.</p>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { label: 'New password', value: pw, set: setPw, auto: 'new-password' },
          { label: 'Confirm password', value: confirm, set: setConfirm, auto: 'new-password' },
        ].map((f) => (
          <label key={f.label} className={`${s.label} ${s.labelStrong}`}>
            {f.label}
            <span className={s.inputBox}>
              <input type={show ? 'text' : 'password'} autoComplete={f.auto} value={f.value} onChange={(e) => { f.set(e.target.value); setError(''); }} />
              <button type="button" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow((v) => !v)}><Icon name="auth-eye-lg" size={20} /></button>
            </span>
          </label>
        ))}
        <div className={s.strength}>
          <p className={s.row} style={{ fontSize: 10, fontWeight: 600 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Password strength</span>
            <span style={{ color: strengthColor[passed] }}>{pw ? strengthLabel[passed] : '—'}</span>
          </p>
          <div className={s.meter}>
            {rules.map((_, i) => <span key={i} style={i < passed ? { background: strengthColor[passed] } : undefined} />)}
          </div>
        </div>
        <div className={s.panel} style={{ padding: '12px 16px' }}>
          <p className={s.overline} style={{ color: 'var(--color-text-muted)' }}>PASSWORD MUST INCLUDE</p>
          <div className={s.reqGrid}>
            {[rules[0], rules[1], rules[2], rules[3]].map((r) => (
              <span key={r.label} className={`${s.req} ${r.test(pw) ? '' : s.reqOff}`}>
                {r.test(pw) ? <Icon name="auth-check-sm" size={13} /> : <span style={{ width: 13, textAlign: 'center' }}>·</span>}
                {r.label}
              </span>
            ))}
          </div>
        </div>
        {error && <p className={s.errorText} role="alert">{error}</p>}
        <button type="submit" className={s.primary}>Update password</button>
      </form>
      <p className={s.center}>Reset link expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
    </Shell>
  );
}

/* ---------- 4. Password updated ---------- */
export function PasswordUpdated() {
  return (
    <Shell gap={0}>
      <Circle size={64}><Icon name="auth-success-lg" size={30} /></Circle>
      <h2 className={s.title} style={{ margin: '14px 0 0', lineHeight: '38px' }}>Password updated</h2>
      <p className={s.hint} style={{ lineHeight: '20px', marginBottom: 14 }}>Your password has been reset successfully. You can now sign in with your new password.</p>
      <div className={s.panel} style={{ padding: 16, marginBottom: 14 }}>
        <p className={s.overline} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--color-success)' }}>
          <Icon name="auth-success-sm" size={16} />PASSWORD RESET COMPLETE
        </p>
        <p style={{ fontSize: 14, fontWeight: 600 }}>Your account is ready</p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Use your new password to access the operations dashboard.</p>
      </div>
      <Link to="/login" className={s.primary} style={{ textDecoration: 'none' }}>Continue to sign in</Link>
      <p className={s.center} style={{ lineHeight: '20px', marginTop: 8 }}>Use your new password the next time you sign in.</p>
    </Shell>
  );
}

/* ---------- 5. Reset link expired ---------- */
export function ResetLinkExpired() {
  const navigate = useNavigate();
  return (
    <Shell gap={0}>
      <Circle size={64} tone="warning"><Icon name="auth-expired-lg" size={30} /></Circle>
      <h2 className={s.title} style={{ margin: '14px 0 0', lineHeight: '38px' }}>Reset link expired</h2>
      <p className={s.hint} style={{ lineHeight: '20px', marginBottom: 14 }}>This password reset link is no longer valid. It may have expired or already been used.</p>
      <div className={s.panel} style={{ padding: 16, marginBottom: 14 }}>
        <p className={s.overline} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--color-warning)' }}>
          <Icon name="auth-expired-sm" size={16} />RESET LINK UNAVAILABLE
        </p>
        <p style={{ fontSize: 14, fontWeight: 600 }}>Request a new reset link</p>
        <p style={{ fontSize: 11, lineHeight: '17px', color: 'var(--color-text-muted)' }}>For your security, reset links expire after a limited time and can only be used once.</p>
      </div>
      <button type="button" className={s.primary} onClick={() => navigate('/forgot-password')}>Send a new reset link</button>
      <p className={s.center} style={{ lineHeight: '20px', marginTop: 8 }}>We’ll send the new link to your account email.</p>
    </Shell>
  );
}

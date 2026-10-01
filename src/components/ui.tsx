import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';
import s from './ui.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx(s.card, className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 className={s.cardTitle} style={{ margin: 0 }}>{title}</h2>
        {subtitle && <p className={s.cardSubtitle}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Overline({ children }: { children: ReactNode }) {
  return <p className={s.overline}>{children}</p>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'dangerGhost';
  size?: 'md' | 'lg';
  block?: boolean;
  icon?: string;
  iconSize?: number;
};

export function Button({ variant = 'primary', size = 'md', block, icon, iconSize = 14, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx(s.btn, s[variant], size === 'lg' && s.lg, block && s.block, className)} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
    </button>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'primary' | 'purple' | 'neutral';

export function Chip({ tone, dot, pill, children }: { tone: Tone; dot?: string; pill?: boolean; children: ReactNode }) {
  return (
    <span className={cx(s.chip, s[`tone-${tone}`], pill && s.pill)}>
      {dot && <Icon name={dot} size={6} />}
      {children}
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder, width, iconName = 'search-small', iconSize = 13, height = 32 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width?: number;
  iconName?: string;
  iconSize?: number;
  height?: number;
}) {
  return (
    <label className={s.search} style={{ width, height }}>
      <Icon name={iconName} size={iconSize} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ value, onChange, suffix, style, type = 'text', placeholder, autoComplete, disabled }: { value: string; onChange: (v: string) => void; suffix?: ReactNode; style?: CSSProperties; type?: string; placeholder?: string; autoComplete?: string; disabled?: boolean }) {
  return (
    <span className={s.input} style={style}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} disabled={disabled} />
      {suffix}
    </span>
  );
}

export function Select<T extends string>({ value, options, onChange, chevron = 'chevron-down', chevronSize = 14, height, disabled }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  chevron?: string;
  chevronSize?: number;
  height?: number;
  disabled?: boolean;
}) {
  return (
    <span className={cx(s.input, s.selectWrap)} style={{ height }}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Icon name={chevron} size={chevronSize} />
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={cx(s.segment, o.value === value && s.segmentActive)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, size = 'sm' }: { on: boolean; onChange: (v: boolean) => void; label: string; size?: 'sm' | 'md' }) {
  const md = size === 'md';
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={cx(s.toggle, md && s.toggleMd, !on && s.toggleOff)} onClick={() => onChange(!on)}>
      {on && (md ? <Icon name="toggle-on-md" size={20} width={34} /> : <Icon name="toggle-on" size={17} width={30} />)}
    </button>
  );
}

export function StatCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'success' | 'warning' | 'danger' | 'primary' }) {
  return (
    <div className={s.stat}>
      <p className={s.overline}>{label}</p>
      <div className={s.statValue}>
        <span>{value}</span>
        <i style={{ background: `var(--color-${tone})` }} />
      </div>
      <p className={s.statNote}>{note}</p>
    </div>
  );
}

export function Badge({ tone, children, width }: { tone: 'success' | 'warning' | 'danger' | 'primary' | 'neutral'; children: ReactNode; width?: number }) {
  return (
    <span className={cx(s.badge, s[`tone-${tone}`])} style={width ? { width } : undefined}>
      {children}
    </span>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="checkbox" aria-checked={checked} aria-label={label} className={cx(s.checkbox, checked && s.checkboxOn)} onClick={() => onChange(!checked)}>
      {checked && <Icon name="check-white-sm" size={12} />}
    </button>
  );
}

export function Callout({ tone, icon, children, action }: { tone: 'info' | 'warning'; icon: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx(s.callout, s[`callout-${tone}`])}>
      <Icon name={icon} size={tone === 'warning' ? 15 : 14} />
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { icon } from '../assets/icons';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Card, Chip, Field, Select, TextInput, Toggle } from '../components/ui';
import { defaultRouting } from '../data/mockOps';
import s from './Routing.module.css';

type Knob = 'low' | 'high';

const knobUrl = icon('slider-knob');

const toggleLabels: { key: keyof typeof defaultRouting.toggles; label: string }[] = [
  { key: 'adjacent', label: 'Adjacent zones: at once if the zone has no eligible staff, otherwise from attempt 3' },
  { key: 'managerCritical', label: 'Critical incidents: also inform the Manager' },
  { key: 'operatorCritical', label: 'Critical incidents: always show to the Operator, even when auto-broadcast' },
  { key: 'reviewTimeout', label: 'Unreviewed after 2 min (Critical: 1 min) → escalate to the Manager on duty' },
  { key: 'withdraw', label: 'Withdraw alert from others once a staff accepts' },
];

export default function Routing() {
  const [cfg, setCfg] = useState(defaultRouting);
  const [saved, setSaved] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<Knob | null>(null);

  const update = (patch: Partial<typeof cfg>) => { setCfg((c) => ({ ...c, ...patch })); setSaved(false); };

  function moveTo(clientX: number) {
    const knob = dragging.current;
    const el = barRef.current;
    if (!knob || !el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    if (knob === 'low') update({ low: Math.min(Math.max(pct, 10), cfg.high - 5) });
    else update({ high: Math.max(Math.min(pct, 95), cfg.low + 5) });
  }

  const startDrag = (k: Knob) => (e: ReactPointerEvent) => {
    dragging.current = k;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const nudge = (k: Knob, delta: number) => {
    setSaved(false);
    setCfg((c) =>
      k === 'low'
        ? { ...c, low: Math.min(Math.max(c.low + delta, 10), c.high - 5) }
        : { ...c, high: Math.max(Math.min(c.high + delta, 95), c.low + 5) },
    );
  };

  const knob = (k: Knob) => (
    <>
      <span className={s.knobTag} style={{ left: `${cfg[k]}%` }}>{cfg[k]}%</span>
      <img
        src={knobUrl}
        alt=""
        role="slider"
        tabIndex={0}
        aria-label={k === 'low' ? 'Operator review from' : 'Auto-broadcast from'}
        aria-valuenow={cfg[k]}
        aria-valuemin={0}
        aria-valuemax={100}
        className={s.knob}
        style={{ left: `${cfg[k]}%` }}
        draggable={false}
        onPointerDown={startDrag(k)}
        onPointerMove={(e) => moveTo(e.clientX)}
        onPointerUp={() => { dragging.current = null; }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nudge(k, -1);
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nudge(k, 1);
        }}
      />
    </>
  );

  return (
    <AdminLayout title="Routing & alerts" subtitle="Who gets an incident, how fast, and what happens if nobody answers">
      <div className={s.left}>
        <section className={s.card}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <p className={s.title}>AI confidence routing</p>
              <p className={s.sub}>Applies to AI-detected incidents only</p>
            </div>
            <Chip tone="primary"><Icon name="sparkles-primary" size={11} /><span style={{ fontSize: 9.5 }}>AI</span></Chip>
          </div>

          <div className={s.bar} ref={barRef}>
            <span className={s.seg} style={{ left: 0, width: `calc(${cfg.low}% - 3px)`, background: 'var(--color-track)' }} />
            <span className={s.seg} style={{ left: `${cfg.low}%`, width: `calc(${cfg.high - cfg.low}% - 3px)`, background: 'var(--color-warning)' }} />
            <span className={s.seg} style={{ left: `${cfg.high}%`, right: 0, background: 'var(--color-primary)' }} />
            {knob('low')}
            {knob('high')}
            <span className={s.scale} style={{ left: 0 }}>0%</span>
            <span className={s.scale} style={{ right: 0 }}>100%</span>
          </div>

          <div className={s.bands}>
            <div className={s.band} style={{ background: 'var(--color-surface-2)' }}>
              <p className={s.bandHead}><Icon name="band-file" size={15} /><span>Log only</span><span style={{ color: 'var(--color-text-muted)' }}>&lt; {cfg.low}%</span></p>
              <p className={s.bandText}>Stored as a low-confidence event for AI tuning. No incident, no alert.</p>
            </div>
            <div className={s.band} style={{ background: 'var(--color-warning-tint)' }}>
              <p className={s.bandHead}><Icon name="band-eye" size={15} /><span>Operator review</span><span style={{ color: 'var(--color-warning)' }}>{cfg.low} – {cfg.high - 1}%</span></p>
              <p className={s.bandText}>Goes to the Review queue. Operator confirms (→ broadcast) or dismisses as false alarm.</p>
            </div>
            <div className={s.band} style={{ background: 'var(--color-primary-tint)' }}>
              <p className={s.bandHead}><Icon name="band-users" size={15} /><span>Auto-broadcast</span><span style={{ color: 'var(--color-primary)' }}>≥ {cfg.high}%</span></p>
              <p className={s.bandText}>Incident created and sent straight to all on-shift staff of that zone.</p>
            </div>
          </div>
          <p className={s.note}><Icon name="staff-note" size={14} />Staff-reported incidents skip review — a person already confirmed it — and are broadcast directly.</p>
        </section>

        <section className={s.card} style={{ flex: 1 }}>
          <div>
            <p className={s.title}>Broadcast, claim &amp; escalation</p>
            <p className={s.sub}>Business rule: we cannot know which staff is free, so everyone on shift in the zone is notified</p>
          </div>
          <div className={s.steps}>
            {[
              { icon: 'step-bell', bg: 'var(--color-primary-tint)', title: '1 · Broadcast', text: 'Push + vibrate to all on-shift staff of the zone' },
              { icon: 'step-hand', bg: 'var(--color-success-tint)', title: '2 · First accept wins', text: 'Task goes to the first staff who taps Accept; others’ alerts are withdrawn' },
              { icon: 'step-refresh', bg: 'var(--color-warning-tint)', title: '3 · Re-notify', text: `No accept after ${cfg.renotifySec} s → notify again (max ${cfg.maxAttempts} times), stronger vibration` },
              { icon: 'step-phone', bg: 'var(--color-danger-tint)', title: '4 · Escalate', text: `Still unclaimed → ${cfg.escalateTo} is alerted to call / assign manually` },
            ].map((st, i, all) => (
              <div key={st.title} className={s.step}>
                <div className={s.stepTop}>
                  <span className={s.stepIcon} style={{ background: st.bg }}><Icon name={st.icon} size={15} /></span>
                  {i < all.length - 1 && <i />}
                </div>
                <p className={s.stepTitle}>{st.title}</p>
                <p className={s.stepText}>{st.text}</p>
              </div>
            ))}
          </div>
          <div className={s.inputs}>
            <Field label="Re-notify after">
              <TextInput value={String(cfg.renotifySec)} onChange={(v) => update({ renotifySec: Number(v.replace(/\D/g, '')) || 0 })} suffix={<span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>s</span>} style={{ height: 32 }} />
            </Field>
            <Field label="Max notify attempts">
              <TextInput value={String(cfg.maxAttempts)} onChange={(v) => update({ maxAttempts: Number(v.replace(/\D/g, '')) || 0 })} suffix={<span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>times</span>} style={{ height: 32 }} />
            </Field>
            <Field label="Vibration (Critical)">
              <Select value={cfg.vibration} onChange={(v) => update({ vibration: v })} chevron="chevron-down-small" chevronSize={13} height={32} options={['Short × 1', 'Long × 2', 'Long × 3'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="Escalate to">
              <Select value={cfg.escalateTo} onChange={(v) => update({ escalateTo: v })} chevron="chevron-down-small" chevronSize={13} height={32} options={['Operator on duty', 'Manager on duty'].map((v) => ({ value: v, label: v }))} />
            </Field>
          </div>
          <div className={s.toggles}>
            {toggleLabels.map((t) => (
              <div key={t.key} className={s.toggleRow}>
                <Toggle on={cfg.toggles[t.key]} onChange={(on) => update({ toggles: { ...cfg.toggles, [t.key]: on } })} label={t.label} />
                {t.label}
              </div>
            ))}
          </div>
        </section>
      </div>

      <Card className={s.example}>
        <div>
          <p className={s.title}>How it plays out</p>
          <p className={s.sub}>Two real cases from today</p>
        </div>
        <div className={s.case}>
          <p className={s.caseHead}><span>INC-1042 · Long queue</span><Chip tone={92 >= cfg.high ? 'primary' : 'warning'}>92%</Chip></p>
          <div>
            <TL line="timeline-primary" title={92 >= cfg.high ? `Auto-broadcast (≥ ${cfg.high}%)` : `Sent to Review queue (${cfg.low}–${cfg.high - 1}%)`} meta="12:41:07 · 3 staff in Zone B" />
            <TL line="timeline-success" title="Minh Đức accepted" meta="12:41:31 · alerts withdrawn for 2 others" />
            <TL end title="Done · evidence verified" meta="12:47:02 · by Operator" />
          </div>
        </div>
        <div className={s.case}>
          <p className={s.caseHead}><span>INC-1045 · Overcrowding</span><Chip tone={64 >= cfg.high ? 'primary' : 'warning'}>64%</Chip></p>
          <div>
            <TL line="timeline-warning" title={64 < cfg.low ? `Logged only (< ${cfg.low}%)` : 64 >= cfg.high ? `Auto-broadcast (≥ ${cfg.high}%)` : `Sent to Review queue (${cfg.low}–${cfg.high - 1}%)`} meta="13:02:10 · Operator An" />
            <TL line="timeline-primary" title="Confirmed → broadcast" meta="13:02:48 · 4 staff in Zone A" />
            <TL line="timeline-danger" title={`${cfg.maxAttempts} attempts, no accept`} meta={`13:05:50 · escalated to ${cfg.escalateTo.replace(' on duty', '')}`} />
            <TL end title="Assigned manually" meta="13:06:20 · Lộc (Zone C, adjacent)" />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {saved && <p className={s.saved} role="status">Routing rules saved.</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="lg" style={{ flex: 1 }} onClick={() => { setCfg(defaultRouting); setSaved(false); }}>Reset</Button>
          <Button size="lg" icon="check-white" style={{ flex: 1 }} onClick={() => setSaved(true)}>Save rules</Button>
        </div>
      </Card>
    </AdminLayout>
  );
}

function TL({ line, end, title, meta }: { line?: string; end?: boolean; title: string; meta: string }) {
  return (
    <div className={s.tl}>
      {end ? <Icon name="timeline-end" size={10} /> : <Icon name={line!} size={40} width={10} />}
      <div className={s.tlText}>
        <p className={s.tlTitle}>{title}</p>
        <p className={s.tlMeta}>{meta}</p>
      </div>
    </div>
  );
}


import { useMemo, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Callout, Card, CardHeader, Chip, Field, SearchBox, Segmented, Select, TextInput, Toggle } from '../components/ui';
import { incidentTypes as initialTypes, measurements, type IncidentType } from '../data/mock';
import s from './IncidentTypes.module.css';

const zoneTypes = ['Entrance', 'Checkout', 'Aisles', 'Fresh food'] as const;
const routings = ['Confidence routing (default)', 'Broadcast to zone staff'] as const;

type Draft = {
  name: string;
  source: 'AI' | 'STAFF';
  measurement: (typeof measurements)[number];
  unit: string;
  operator: '≥' | '≤';
  value: string;
  sustain: string;
  warning: string;
  critical: string;
  zoneTypes: string[];
  routing: (typeof routings)[number];
};

const emptyDraft: Draft = {
  name: 'Crowd at entrance',
  source: 'AI',
  measurement: 'People count (per zone)',
  unit: 'people',
  operator: '≥',
  value: '25',
  sustain: '30',
  warning: '25',
  critical: '40',
  zoneTypes: ['Entrance'],
  routing: 'Confidence routing (default)',
};

export default function IncidentTypes() {
  const [types, setTypes] = useState(initialTypes);
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState('');

  const visible = useMemo(() => types.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase())), [types, query]);
  const ai = visible.filter((t) => t.source === 'AI');
  const staff = visible.filter((t) => t.source === 'STAFF');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function create() {
    const name = draft.name.trim();
    if (!name) return setError('Give the type a name.');
    if (types.some((t) => t.name.toLowerCase() === name.toLowerCase())) return setError('A type with this name already exists.');
    if (draft.source === 'AI' && Number(draft.critical) <= Number(draft.warning)) return setError('Critical must be higher than Warning.');
    const type: IncidentType = {
      id: `custom-${Date.now()}`,
      name,
      source: draft.source,
      basedOn: draft.source === 'AI' ? draft.measurement.replace(' (per zone)', '') : 'Staff report',
      thresholds: draft.source === 'AI' ? `${draft.warning} / ${draft.critical} ${draft.unit}` : 'Staff sets',
      enabled: true,
    };
    setTypes((all) => [...all, type]);
    setDrawerOpen(false);
    setDraft(emptyDraft);
    setError('');
  }

  const renderRow = (t: IncidentType) => (
    <div key={t.id} className={`${s.row} ${t.enabled ? '' : s.disabled}`}>
      <span className={s.name}>{t.name}</span>
      <span className={s.muted}>{t.basedOn}</span>
      <span className={t.source === 'AI' ? s.strong : s.dim}>{t.thresholds}</span>
      <span>{t.source === 'AI' ? <Chip tone="primary">Confidence routing</Chip> : <Chip tone="warning">Broadcast to zone staff</Chip>}</span>
      <Toggle on={t.enabled} label={`${t.name} enabled`} onChange={(on) => setTypes((all) => all.map((x) => (x.id === t.id ? { ...x, enabled: on } : x)))} />
    </div>
  );

  return (
    <AdminLayout title="Incident types" subtitle={`${types.length} types · ${types.filter((t) => t.source === 'AI').length} AI-detected · ${types.filter((t) => t.source === 'STAFF').length} staff-reported`}>
      <Card className={s.list}>
        <CardHeader title="Incident catalogue" subtitle="Each type = a measurement + thresholds + sustain time + routing">
          <SearchBox value={query} onChange={setQuery} placeholder="Search type" width={150} />
          <Button icon="plus-white" onClick={() => setDrawerOpen(true)}>New type</Button>
        </CardHeader>
        <div className={`${s.row} ${s.head}`}>
          <span>TYPE</span>
          <span>BASED ON</span>
          <span>WARNING / CRITICAL</span>
          <span>ROUTING</span>
          <span>ON</span>
        </div>
        <div>
          <p className={s.group} style={{ color: 'var(--color-primary)' }}>
            <Icon name="sparkle-primary" size={12} />
            <span>AI-DETECTED</span>
            <span>· {ai.length}</span>
          </p>
          {ai.map(renderRow)}
          <p className={s.group} style={{ color: 'var(--color-warning)' }}>
            <Icon name="staff-warning" size={12} />
            <span>STAFF-REPORTED</span>
            <span>· {staff.length}</span>
          </p>
          {staff.map(renderRow)}
          <p className={s.footnote}>
            <Icon name="activity-info" size={12} />
            System faults (camera offline, stream degraded, AI service down) are Admin alerts in System health, not incidents.
          </p>
        </div>
      </Card>

      <Card className={s.drawer}>
        {drawerOpen ? (
          <>
            <CardHeader title="New incident type" subtitle="Built from an existing AI measurement — no retraining">
              <button aria-label="Close" onClick={() => setDrawerOpen(false)}><Icon name="close" size={16} /></button>
            </CardHeader>
            <Field label="Name">
              <TextInput value={draft.name} onChange={(v) => set('name', v)} style={{ height: 34 }} />
            </Field>
            <Field label="Source">
              <Segmented value={draft.source} onChange={(v) => set('source', v)} options={[{ value: 'AI', label: 'AI detection' }, { value: 'STAFF', label: 'Staff report' }]} />
            </Field>
            {draft.source === 'AI' && (
              <>
                <Field label="Based on measurement">
                  <Select value={draft.measurement} onChange={(v) => set('measurement', v)} chevron="chevron-down-small" chevronSize={13} height={34} options={measurements.map((m) => ({ value: m, label: m }))} />
                  <span className={s.help}>Pick 1 of the 6 measurements the AI already produces: people count, zone entry/exit, queue length, waiting time, crowd density, checkout utilisation.</span>
                </Field>
                <Field label="Condition">
                  <span className={s.condition}>
                    <TextInput value={draft.unit} onChange={(v) => set('unit', v)} style={{ width: 80, height: 34 }} />
                    <span style={{ width: 44 }}>
                      <Select value={draft.operator} onChange={(v) => set('operator', v)} chevron="chevron-down-small" chevronSize={10} height={34} options={[{ value: '≥', label: '≥' }, { value: '≤', label: '≤' }]} />
                    </span>
                    <TextInput value={draft.value} onChange={(v) => set('value', v)} style={{ height: 34 }} />
                    for
                    <TextInput value={draft.sustain} onChange={(v) => set('sustain', v)} suffix={<span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>s</span>} style={{ width: 64, height: 34 }} />
                  </span>
                </Field>
                <div className={s.two}>
                  <Field label="Warning at">
                    <TextInput value={draft.warning} onChange={(v) => set('warning', v)} suffix={<span className={s.help}>{draft.unit}</span>} style={{ height: 34 }} />
                  </Field>
                  <Field label="Critical at">
                    <TextInput value={draft.critical} onChange={(v) => set('critical', v)} suffix={<span className={s.help}>{draft.unit}</span>} style={{ height: 34 }} />
                  </Field>
                </div>
              </>
            )}
            <Field label="Apply to zone types">
              <span className={s.chips}>
                {zoneTypes.map((z) => {
                  const on = draft.zoneTypes.includes(z);
                  return (
                    <button key={z} type="button" aria-pressed={on} className={`${s.chipBtn} ${on ? s.chipOn : ''}`} onClick={() => set('zoneTypes', on ? draft.zoneTypes.filter((x) => x !== z) : [...draft.zoneTypes, z])}>
                      {on && <Icon name="check-primary" size={11} />}
                      {z}
                    </button>
                  );
                })}
              </span>
            </Field>
            <Field label="Routing">
              <Select value={draft.routing} onChange={(v) => set('routing', v)} chevron="chevron-down-small" chevronSize={13} height={34} options={routings.map((r) => ({ value: r, label: r }))} />
            </Field>
            <Callout tone="info" icon="info">A brand-new behaviour the AI cannot detect yet (e.g. theft, falls) needs a new model — out of scope, recorded in Business Rules.</Callout>
            <div style={{ flex: 1 }} />
            {error && <p className={s.error} role="alert">{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="lg" style={{ flex: 1 }} onClick={() => { setDrawerOpen(false); setError(''); }}>Cancel</Button>
              <Button size="lg" icon="check-white" style={{ flex: 1 }} onClick={create}>Create type</Button>
            </div>
          </>
        ) : (
          <div className={s.empty}>
            <p>Select “New type” to add an incident type from an existing AI measurement or a staff report.</p>
            <Button icon="plus-white" onClick={() => setDrawerOpen(true)}>New type</Button>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}

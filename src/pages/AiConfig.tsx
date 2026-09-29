import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Overline, Toggle } from '../components/ui';
import { zones, zoneLabel } from '../data/mock';
import { defaultAiRules, defaultDetection, defaultHealth, defaultOverrides, type Setting, type ZoneOverride } from '../data/mockOps';
import s from './AiConfig.module.css';

const model = [
  ['DETECTOR', 'YOLOv11'],
  ['TRACKER', 'ByteTrack'],
  ['CONFIDENCE', '0.50'],
  ['PROCESS FPS', '10'],
  ['RUNTIME', 'ONNX Runtime'],
];

export default function AiConfig() {
  const [rules, setRules] = useState(defaultAiRules);
  const [detection, setDetection] = useState(defaultDetection);
  const [health, setHealth] = useState(defaultHealth);
  const [overrides, setOverrides] = useState<ZoneOverride[]>(defaultOverrides);
  const [showOverrides, setShowOverrides] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const touch = () => { setDirty(true); setSaved(false); };
  const setRule = (id: string, patch: Partial<(typeof rules)[number]>) => { setRules((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r))); touch(); };
  const setValue = (list: Setting[], set: (l: Setting[]) => void, id: string, raw: string) => {
    const n = Number(raw.replace(/\D/g, ''));
    set(list.map((x) => (x.id === id ? { ...x, value: n } : x)));
    touch();
  };

  function reset() {
    setRules(defaultAiRules);
    setDetection(defaultDetection);
    setHealth(defaultHealth);
    setOverrides(defaultOverrides);
    setDirty(false);
    setSaved(false);
  }

  function addOverride() {
    setOverrides((o) => [...o, { zone: zoneLabel(zones[0]), rule: rules[0].name, warning: rules[0].warning, critical: rules[0].critical }]);
    touch();
  }

  const settings = (title: string, icon: string, list: Setting[], set: (l: Setting[]) => void) => (
    <div className={s.panel}>
      <p className={s.cardTitle}><Icon name={icon} size={16} />{title}</p>
      {list.map((x) => (
        <label key={x.id} className={s.setting}>
          {x.label}
          <span className={s.valueBox}>
            <input inputMode="numeric" value={x.value} onChange={(e) => setValue(list, set, x.id, e.target.value)} aria-label={x.label} style={{ width: `${Math.max(1, String(x.value).length)}ch` }} />
            {x.unit}{x.suffix && ` ${x.suffix}`}
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <AdminLayout title="AI Configuration" subtitle="Model parameters · incident rules · system thresholds">
      <div className={s.column}>
        <div className={`${s.panel} ${s.model}`}>
          {model.map(([k, v]) => (
            <div key={k}>
              <Overline>{k}</Overline>
              {v}
            </div>
          ))}
        </div>

        <div className={s.panel} style={{ paddingBottom: 8 }}>
          <div className={s.head}>
            <div>
              <p className={s.title}>AI incident rules</p>
              <p className={s.sub}>An incident is created when a metric stays above threshold</p>
            </div>
            <button className={s.linkBtn} onClick={() => setShowOverrides((v) => !v)} aria-expanded={showOverrides}>
              {showOverrides ? 'Hide zone overrides' : `Zone overrides${overrides.length ? ` (${overrides.length})` : ''}`}
            </button>
          </div>

          {showOverrides && (
            <div className={s.overrides}>
              <div className={s.overrideRow} style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.72, color: 'var(--color-text-dim)' }}>
                <span>ZONE</span><span>RULE</span><span>WARNING ≥</span><span>CRITICAL ≥</span><span />
              </div>
              {overrides.map((o, i) => (
                <div key={i} className={s.overrideRow}>
                  <select value={o.zone} onChange={(e) => { setOverrides((all) => all.map((x, j) => (j === i ? { ...x, zone: e.target.value } : x))); touch(); }}>
                    {zones.map((z) => <option key={z.id}>{zoneLabel(z)}</option>)}
                  </select>
                  <select value={o.rule} onChange={(e) => { setOverrides((all) => all.map((x, j) => (j === i ? { ...x, rule: e.target.value } : x))); touch(); }}>
                    {rules.map((r) => <option key={r.id}>{r.name}</option>)}
                  </select>
                  <input className={`${s.pill} ${s.warn}`} value={o.warning} onChange={(e) => { setOverrides((all) => all.map((x, j) => (j === i ? { ...x, warning: e.target.value } : x))); touch(); }} aria-label="Override warning" />
                  <input className={`${s.pill} ${s.crit}`} value={o.critical} onChange={(e) => { setOverrides((all) => all.map((x, j) => (j === i ? { ...x, critical: e.target.value } : x))); touch(); }} aria-label="Override critical" />
                  <button aria-label="Remove override" onClick={() => { setOverrides((all) => all.filter((_, j) => j !== i)); touch(); }}><Icon name="close" size={14} /></button>
                </div>
              ))}
              <button className={s.linkBtn} style={{ alignSelf: 'flex-start' }} onClick={addOverride}>+ Add zone override</button>
            </div>
          )}

          <div className={`${s.row} ${s.th}`}>
            <span>INCIDENT TYPE</span><span>WARNING ≥</span><span>CRITICAL ≥</span><span>APPLIES TO</span><span className={s.end}>ON</span>
          </div>
          {rules.map((r) => (
            <div key={r.id} className={s.row} style={r.enabled ? undefined : { opacity: 0.55 }}>
              <div className={s.typeCell}>
                <span className={s.iconTile}><Icon name={r.icon} size={16} /></span>
                <div>
                  <p className={s.name}>{r.name}</p>
                  <p className={s.desc}>{r.description}</p>
                </div>
              </div>
              <input className={`${s.pill} ${s.warn}`} value={r.warning} onChange={(e) => setRule(r.id, { warning: e.target.value })} aria-label={`${r.name} warning`} />
              <input className={`${s.pill} ${s.crit}`} value={r.critical} onChange={(e) => setRule(r.id, { critical: e.target.value })} aria-label={`${r.name} critical`} />
              <span className={s.muted}>{r.appliesTo}</span>
              <span className={s.end}><Toggle size="md" on={r.enabled} onChange={(on) => setRule(r.id, { enabled: on })} label={`${r.name} enabled`} /></span>
            </div>
          ))}
        </div>

        <div className={s.two}>
          {settings('Detection rules', 'shield-primary', detection, setDetection)}
          {settings('System health thresholds', 'gauge-primary', health, setHealth)}
        </div>

        <div className={s.actions}>
          <Button size="lg" onClick={() => { setSaved(true); setDirty(false); }} disabled={!dirty} style={{ fontSize: 13, padding: '0 16px' }}>Save changes</Button>
          <Button variant="secondary" size="lg" onClick={reset} style={{ fontSize: 13, padding: '0 16px' }}>Reset to default</Button>
          {saved && <span className={s.saved} role="status">Changes saved. They apply to new detections only.</span>}
        </div>
      </div>
    </AdminLayout>
  );
}

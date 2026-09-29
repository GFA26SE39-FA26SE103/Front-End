import { useMemo, useState } from 'react';
import { icon as iconUrl } from '../assets/icons';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Callout, Card, CardHeader, Chip, Overline, SearchBox, Select, TextInput } from '../components/ui';
import { cameras as initialCameras, floors, zones, type Camera } from '../data/mock';
import { cameraPlacements, zoneRects } from '../data/floorPlan';
import { statusChip } from './cameraStatus';
import s from './Cameras.module.css';

type Log = { date: string; note: string };

const today = () => new Date().toLocaleDateString('en-GB');
const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? '';

// Mini floor map: plan walls (14..522 × 14..650) scaled into the 96 × 96 box at (7, 7).
const mini = (x: number, y: number) => ({ x: 7 + ((x - 14) * 96) / 508, y: 7 + ((y - 14) * 96) / 636 });

export default function Cameras() {
  const [cameras, setCameras] = useState(initialCameras);
  const [query, setQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState<'all' | 'F1' | 'F2'>('all');
  const [selected, setSelected] = useState('CAM-03');
  const [tab, setTab] = useState<'device' | 'log' | 'stream'>('device');
  const [logs, setLogs] = useState<Record<string, Log[]>>({ 'CAM-03': [{ date: '02/09/2026', note: 'Lens cleaned' }, { date: '12/08/2026', note: 'Installed by An Phát Security' }] });
  const [logNote, setLogNote] = useState('');
  const [test, setTest] = useState<{ code: string; state: 'running' | 'ok' | 'fail' } | null>(null);
  const [reminder, setReminder] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cameras.filter((c) => (floorFilter === 'all' || c.floor === floorFilter) && (!q || c.code.toLowerCase().includes(q) || c.zones.some((z) => zoneName(z).toLowerCase().includes(q))));
  }, [cameras, query, floorFilter]);

  const camera = cameras.find((c) => c.code === selected);
  const expiring = cameras.find((c) => c.warrantyNote);
  const counts = {
    online: cameras.filter((c) => c.status === 'Online').length,
    degraded: cameras.filter((c) => c.status === 'Degraded').length,
    offline: cameras.filter((c) => c.status === 'Offline').length,
  };

  function addCamera() {
    const code = `CAM-${String(cameras.length + 1).padStart(2, '0')}`;
    const cam: Camera = { ...cameras[0], code, zones: ['A'], status: 'Offline', installed: today(), warrantyUntil: '—', warrantyNote: undefined, lastMaintenance: '—', serial: '—', stream: 'Not connected', nextCheck: '—', view: 'new camera', note: 'New camera' };
    setCameras((all) => [...all, cam]);
    setSelected(code);
    setTab('device');
  }

  function runTest(c: Camera) {
    setTest({ code: c.code, state: 'running' });
    // TODO: POST /cameras/{id}/test-connection
    window.setTimeout(() => setTest({ code: c.code, state: c.status === 'Offline' ? 'fail' : 'ok' }), 900);
  }

  function saveLog(c: Camera) {
    if (!logNote.trim()) return;
    const entry = { date: today(), note: logNote.trim() };
    setLogs((all) => ({ ...all, [c.code]: [entry, ...(all[c.code] ?? [])] }));
    setCameras((all) => all.map((x) => (x.code === c.code ? { ...x, lastMaintenance: `${entry.date} · ${entry.note}` } : x)));
    setLogNote('');
  }

  return (
    <AdminLayout title="Cameras" subtitle={`${cameras.length} cameras · ${counts.online} online · ${counts.degraded} degraded · ${counts.offline} offline · ${expiring ? 1 : 0} warranty expiring`}>
      <Card className={s.registry}>
        <CardHeader title="Camera registry" subtitle="Device records for maintenance & warranty evidence">
          <SearchBox value={query} onChange={setQuery} placeholder="Search camera" width={170} />
          <div style={{ width: 110 }}>
            <Select value={floorFilter} onChange={setFloorFilter} chevron="chevron-down-small" chevronSize={13} height={32} options={[{ value: 'all', label: 'All floors' }, ...floors.map((f) => ({ value: f.id, label: f.short }))]} />
          </div>
          <Button icon="plus-white" onClick={addCamera}>Add camera</Button>
        </CardHeader>

        <div className={s.table} role="table">
          <div className={`${s.row} ${s.head}`} role="row">
            <span>CAMERA</span>
            <span>FLOOR · ZONE</span>
            <span>STATUS</span>
            <span>INSTALLED</span>
            <span>WARRANTY UNTIL</span>
            <span>LAST MAINTENANCE</span>
          </div>
          {visible.map((c) => {
            const active = c.code === selected;
            return (
              <button key={c.code} role="row" className={`${s.row} ${active ? s.selected : ''}`} onClick={() => { setSelected(c.code); setTest(null); }}>
                <span className={s.code}>
                  <Icon name={active ? 'camera-row-active' : 'camera-row'} size={14} />
                  {c.code}
                </span>
                <span title={c.zones.map((z) => `${z} ${zoneName(z)}`).join(', ')}>
                  {c.floor} · {c.zones[0]} {zoneName(c.zones[0])}
                  {c.zones.length > 1 && ` +${c.zones.slice(1).join(', ')}`}
                </span>
                <span>{statusChip(c.status)}</span>
                <span>{c.installed}</span>
                <span className={c.warrantyNote ? s.warn : s.strong}>{c.warrantyUntil}{c.warrantyNote && ` · ${c.warrantyNote}`}</span>
                <span>{c.lastMaintenance.split(' · ')[0]}</span>
              </button>
            );
          })}
          {visible.length === 0 && <p className={s.empty}>No camera matches “{query}”.</p>}
        </div>

        <div style={{ flex: 1 }} />
        {expiring && (
          <Callout
            tone="warning"
            icon="shield-warning"
            action={
              <Button variant="dangerGhost" style={{ height: 26, padding: '0 6px', fontSize: 11, color: 'var(--color-warning)' }} onClick={() => setReminder(true)} disabled={reminder}>
                {reminder ? 'Reminder created' : 'Create reminder'}
              </Button>
            }
          >
            <span style={{ fontSize: 11, fontWeight: 500 }}>{expiring.code} warranty ends {expiring.warrantyUntil} — schedule a check with the vendor before it expires.</span>
          </Callout>
        )}
      </Card>

      {camera && (
        <Card className={s.detail}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className={s.detailTitle}>
                {camera.code}
                {statusChip(camera.status)}
              </div>
              <p className={s.detailSub}>
                {floors.find((f) => f.id === camera.floor)?.short} · {camera.zones.map((z) => `Zone ${z} · ${zoneName(z)}`).join(' + ')} — {camera.view}
              </p>
            </div>
            <button className={s.iconBtn} aria-label="Edit camera"><Icon name="edit" size={14} /></button>
          </div>

          <div className={s.media}>
            <div className={s.snapshot} aria-label="Live snapshot">
              {camera.status === 'Offline' ? (
                <span className={s.offline}>No signal</span>
              ) : (
                <>
                  {[30, 60, 90, 120, 150].map((x) => <span key={x} className={s.snapRect} style={{ left: x }} />)}
                  <span style={{ position: 'absolute', left: 26, top: 90, width: 150, height: 1.5, background: '#f0aa37' }} />
                  <span className={s.live}>LIVE</span>
                </>
              )}
            </div>
            <Placement camera={camera} />
          </div>

          <div className={s.tabs} role="tablist">
            {(['device', 'log', 'stream'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`${s.tab} ${tab === t ? s.tabActive : ''}`} onClick={() => setTab(t)}>
                {t === 'device' ? 'Device' : t === 'log' ? 'Maintenance log' : 'Stream'}
              </button>
            ))}
          </div>

          {tab === 'device' && (
            <>
              <dl style={{ margin: 0 }}>
                <KV k="Model" v={camera.model} />
                <KV k="Security standard" v="QCVN 11:2026/BCA · compliant" />
                <KV k="Serial no." v={camera.serial} />
                <KV k="Stream" v={camera.stream} />
                <KV k="Installed" v={`${camera.installed} · by ${camera.installer}`} />
                <div className={s.kv}>
                  <dt>Warranty until</dt>
                  <dd>{camera.warrantyUntil}</dd>
                  {camera.warrantyNote ? <Chip tone="warning">{camera.warrantyNote}</Chip> : monthsLeft(camera.warrantyUntil) !== null && <Chip tone="success">{monthsLeft(camera.warrantyUntil)} mo left</Chip>}
                </div>
                <KV k="Last maintenance" v={camera.lastMaintenance} />
                <KV k="Next check due" v={camera.nextCheck} />
              </dl>
              <Overline>MAINTENANCE EVIDENCE</Overline>
              <div className={s.evidence}>
                {[
                  { title: 'Lens cleaned', date: '02/09/2026', icon: 'image' },
                  { title: 'Installed', date: camera.installed, icon: 'image' },
                  { title: 'Warranty card', date: camera.installed, icon: 'file-muted' },
                ].map((e) => (
                  <div key={e.title} className={s.evidenceItem}>
                    <div className={s.thumb}><Icon name={e.icon} size={16} /></div>
                    <p className={s.evTitle}>{e.title}</p>
                    <p className={s.evDate}>{e.date}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'log' && (
            <>
              <ul className={s.log} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {(logs[camera.code] ?? []).map((l, i) => (
                  <li key={i}><span>{l.note}</span><span style={{ color: 'var(--color-text-muted)' }}>{l.date}</span></li>
                ))}
                {!(logs[camera.code] ?? []).length && <li style={{ color: 'var(--color-text-muted)' }}>No maintenance recorded yet.</li>}
              </ul>
              <TextInput value={logNote} onChange={setLogNote} />
            </>
          )}

          {tab === 'stream' && (
            <dl style={{ margin: 0 }}>
              <KV k="Source" v={camera.stream} />
              <KV k="Credentials" v="Stored as secret reference" />
              <KV k="Last test" v={test?.code === camera.code && test.state !== 'running' ? (test.state === 'ok' ? 'OK · 25 fps' : 'Failed · no response') : '—'} />
            </dl>
          )}

          <div style={{ flex: 1 }} />
          {test?.code === camera.code && (
            <p className={s.testResult} style={{ color: test.state === 'fail' ? 'var(--color-danger)' : test.state === 'ok' ? 'var(--color-success)' : 'var(--color-text-muted)' }} role="status">
              {test.state === 'running' ? 'Testing stream…' : test.state === 'ok' ? 'Stream OK · 25 fps · 1920×1080' : 'No response from the camera. Check power and network.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="lg" icon="refresh" style={{ flex: 1 }} onClick={() => runTest(camera)} disabled={test?.code === camera.code && test.state === 'running'}>Test stream</Button>
            <Button size="lg" icon="wrench-white" style={{ flex: 1 }} onClick={() => (tab === 'log' ? saveLog(camera) : setTab('log'))}>
              {tab === 'log' ? 'Save log entry' : 'Log maintenance'}
            </Button>
          </div>
        </Card>
      )}
    </AdminLayout>
  );
}

function monthsLeft(ddmmyyyy: string): number | null {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  if (!d || !m || !y) return null;
  const now = new Date();
  const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) - (d < now.getDate() ? 1 : 0);
  return months >= 0 ? months : null;
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className={s.kv}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Placement({ camera }: { camera: Camera }) {
  const p = cameraPlacements[camera.code];
  return (
    <div className={s.placement} aria-label="Position on floor plan">
      <span style={{ position: 'absolute', left: 7, top: 7, width: 96, height: 96, borderRadius: 2, background: 'var(--color-surface)', border: '1px solid var(--color-text-dim)' }} />
      {camera.zones.map((id) => {
        const r = zoneRects[id];
        if (!r) return null;
        const a = mini(r.x, r.y);
        const b = mini(r.x + r.w, r.y + r.h);
        return <span key={id} style={{ position: 'absolute', left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)', border: '1.2px solid var(--color-primary)' }} />;
      })}
      {camera.code === 'CAM-03' && <img src={iconUrl('placement-fov')} width={44} height={26} alt="" style={{ position: 'absolute', left: 55, top: 81 }} />}
      {p && (() => {
        const m = mini(p.marker.x + 11, p.marker.y + 11);
        return <img src={iconUrl('placement-dot')} width={10} height={10} alt="" style={{ position: 'absolute', left: Math.min(m.x - 5, 93), top: Math.min(m.y - 5, 93) }} />;
      })()}
      <span style={{ position: 'absolute', left: 11, top: 11, padding: '1px 4px', borderRadius: 3, background: 'var(--color-surface)', fontSize: 7.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>On floor plan</span>
    </div>
  );
}


import { useState } from 'react';
import { Link } from 'react-router-dom';
import { icon as iconUrl } from '../assets/icons';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Card, Chip, Field, Select, TextInput } from '../components/ui';
import { cameras as initialCameras, zones, zoneLabel, type Camera, type CameraStatus } from '../data/mock';
import { setupSteps } from '../data/mockOps';
import s from './SetupHealth.module.css';

const statusStyle: Record<CameraStatus, { color: string; dot: string }> = {
  Online: { color: 'var(--color-success)', dot: 'dot-success-lg' },
  Degraded: { color: 'var(--color-warning)', dot: 'dot-warning-lg' },
  Offline: { color: 'var(--color-danger)', dot: 'dot-danger-lg' },
};

// Where each later setup step is actually done.
const stepLinks: Record<number, { to: string; text: string; label: string }> = {
  3: { to: '/admin/store-layout', text: 'Place each camera on the floor plan and draw the area it watches in every zone it covers.', label: 'Open Store layout' },
  4: { to: '/admin/ai-config', text: 'Check the Warning / Critical thresholds and the incident types the AI should raise.', label: 'Open AI Config' },
  5: { to: '/admin/routing', text: 'Confirm confidence routing and escalation, then invite Operators, Managers and Staff.', label: 'Open Routing & alerts' },
};

export default function SetupHealth() {
  const [step, setStep] = useState(2); // 0-based: steps 1–2 done, 3 in progress (as in Figma)
  const [cameras, setCameras] = useState<Camera[]>(initialCameras);
  const [name, setName] = useState(`CAM-${String(initialCameras.length + 1).padStart(2, '0')}`);
  const [rtsp, setRtsp] = useState('');
  const [zone, setZone] = useState('C');
  const [error, setError] = useState('');
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  function addCamera() {
    if (!name.trim()) return setError('Give the camera a name.');
    if (!/^rtsp:\/\/.+/.test(rtsp)) return setError('Enter a stream address that starts with rtsp://');
    if (cameras.some((c) => c.code === name.trim())) return setError('A camera with this name already exists.');
    const z = zones.find((x) => x.id === zone)!;
    setCameras((all) => [...all, { ...all[0], code: name.trim(), floor: z.floor, zones: [z.id], status: 'Online', stream: rtsp, note: 'New camera', view: 'new camera' }]);
    setError('');
    setRtsp('');
    setName(`CAM-${String(cameras.length + 2).padStart(2, '0')}`);
    setStep(3);
  }

  function reconnect(code: string) {
    setReconnecting(code);
    // TODO: POST /cameras/{id}/reconnect
    window.setTimeout(() => {
      setCameras((all) => all.map((c) => (c.code === code ? { ...c, status: 'Online' } : c)));
      setReconnecting(null);
    }, 1000);
  }

  const online = cameras.filter((c) => c.status === 'Online').length;
  const shown = cameras.filter((c) => c.status !== 'Online').concat(cameras.filter((c) => c.status === 'Online').slice(0, 2));
  const floorZones = zones.filter((z) => z.floor === 'F1').slice(0, 3);

  return (
    <AdminLayout title="System setup" subtitle="Initial configuration · camera & system health">
      <Card className={s.col}>
        <div className={s.head}>
          System setup
          <Chip tone="primary" pill>{active ? 'MONITORING ACTIVE' : `STEP ${step + 1} / ${setupSteps.length}`}</Chip>
        </div>
        <div className={s.steps}>
          {setupSteps.map((label, i) => {
            const done = i < step || active;
            const current = i === step && !active;
            return (
              <button key={label} className={`${s.step} ${done ? s.stepDone : ''} ${current ? s.stepCurrent : ''}`} disabled={!done} onClick={() => setStep(i)}>
                {done ? <span className={s.doneDot}><Icon name="step-check" size={12} /></span> : <Icon name={current ? 'step-current' : 'step-todo'} size={22} />}
                <span>{label}</span>
                {done && <span className={s.stepState} style={{ color: 'var(--color-success)' }}>Done</span>}
                {current && <span className={s.stepState} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>In progress</span>}
              </button>
            );
          })}
        </div>

        {!active && (
          <div className={s.form}>
            <p className={s.formTitle}>Step {step + 1} · {step === 2 ? 'Register cameras' : setupSteps[step]}</p>
            {step === 2 ? (
              <>
                <Field label="Camera name"><TextInput value={name} onChange={setName} /></Field>
                <Field label="RTSP URL"><TextInput value={rtsp} onChange={(v) => { setRtsp(v); setError(''); }} /></Field>
                <Field label="Assign to zone">
                  <Select value={zone} onChange={setZone} chevron="chevron-down-muted" options={zones.map((z) => ({ value: z.id, label: zoneLabel(z) }))} />
                </Field>
                <p className={s.formText} style={{ fontSize: 10.5 }}>Add more zones for this camera later in Store layout if it covers several.</p>
                {error && <p className={s.error} role="alert">{error}</p>}
              </>
            ) : step < 2 ? (
              <p className={s.formText}>This step is complete. {step === 0 ? 'The floor plan for Floor 1 was uploaded on 24/09.' : `${zones.length} zones are set up on 2 floors.`}</p>
            ) : step === 6 ? (
              <p className={s.formText}>Everything is configured. Activating starts AI monitoring on every online camera; incidents will reach Operators and on-shift staff.</p>
            ) : (
              <p className={s.formText}>{stepLinks[step].text} <Link to={stepLinks[step].to} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{stepLinks[step].label} →</Link></p>
            )}
            <div className={s.formActions}>
              <Button variant="secondary" disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))} style={{ height: 34, padding: '0 16px', fontSize: 12 }}>Back</Button>
              {step === 2 ? (
                <Button icon="arrow-right-white" onClick={addCamera} style={{ height: 34, padding: '0 16px', fontSize: 12, flexDirection: 'row-reverse' }}>Add &amp; continue</Button>
              ) : step === 6 ? (
                <Button onClick={() => setActive(true)} style={{ height: 34, padding: '0 16px', fontSize: 12 }}>Activate monitoring</Button>
              ) : (
                <Button icon="arrow-right-white" onClick={() => setStep((v) => v + 1)} style={{ height: 34, padding: '0 16px', fontSize: 12, flexDirection: 'row-reverse' }}>Continue</Button>
              )}
            </div>
          </div>
        )}
        {active && <p className={s.formText} role="status" style={{ color: 'var(--color-success)', fontWeight: 500 }}>Monitoring is active on {online} cameras.</p>}
      </Card>

      <Card className={s.col}>
        <div className={s.head}>
          Camera &amp; system health
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-success)' }}>
            <Icon name="dot-success-lg" size={8} />{online} / {cameras.length} online
          </span>
        </div>

        <div className={s.mini} aria-label="Floor 1 overview">
          {[
            { z: floorZones[0], box: { left: 16, top: 16, width: 223, height: 100 } },
            { z: floorZones[1], box: { left: 265.5, top: 16, width: 244, height: 84 } },
            { z: floorZones[2], box: { left: 16, top: 128, width: 372, height: 76 } },
          ].map(({ z, box }) => {
            const bad = cameras.some((c) => c.zones.includes(z.id) && c.status === 'Offline');
            const warn = cameras.some((c) => c.zones.includes(z.id) && c.status === 'Degraded');
            const tone = bad ? 'danger' : warn ? 'warning' : 'success';
            return <div key={z.id} className={s.miniZone} style={{ ...box, background: `var(--color-${tone}-tint)`, borderColor: `var(--color-${tone})` }}>Zone {z.id}</div>;
          })}
          <img className={s.miniCam} src={iconUrl('mini-camera-success')} width={18} height={18} alt="" style={{ left: 132.75, top: 62 }} />
          <img className={s.miniCam} src={iconUrl(cameras.find((c) => c.code === 'CAM-05')?.status === 'Online' ? 'mini-camera-success' : 'mini-camera-warning')} width={18} height={18} alt="" style={{ left: 329.22, top: 48 }} />
          <img className={s.miniCam} src={iconUrl('mini-camera-success')} width={18} height={18} alt="" style={{ left: 451.35, top: 60 }} />
          <img className={s.miniCam} src={iconUrl(cameras.find((c) => c.code === 'CAM-07')?.status === 'Online' ? 'mini-camera-success' : 'mini-camera-danger')} width={18} height={18} alt="" style={{ left: 212.4, top: 160 }} />
          <img className={s.miniCam} src={iconUrl('mini-camera-success')} width={18} height={18} alt="" style={{ left: 79.65, top: 160 }} />
        </div>

        <div role="table">
          <div className={`${s.row} ${s.th}`} role="row"><span>CAMERA</span><span>ZONE</span><span>STATUS</span><span>UPTIME</span><span /></div>
          {shown.map((c) => (
            <div key={c.code} className={s.row} role="row">
              <span className={s.cam}><Icon name="camera-row-muted" size={14} />{c.code}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{c.zones.map((z) => `Zone ${z}`).join(', ')}</span>
              <span className={s.status} style={{ color: statusStyle[c.status].color }}><Icon name={statusStyle[c.status].dot} size={8} />{c.status}</span>
              <span style={{ fontWeight: 500 }}>{c.status === 'Offline' ? '—' : c.status === 'Degraded' ? '91.2%' : '99.8%'}</span>
              {c.status !== 'Online' ? (
                <button className={s.reconnect} onClick={() => reconnect(c.code)} disabled={reconnecting === c.code}>
                  <Icon name="refresh-primary" size={14} />{reconnecting === c.code ? 'Reconnecting…' : 'Reconnect'}
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
      </Card>
    </AdminLayout>
  );
}


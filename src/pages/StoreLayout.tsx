import { useMemo, useState, type CSSProperties } from 'react';
import { icon as iconSrc } from '../assets/icons';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Callout, Card, Checkbox, Chip, Field, Overline, Segmented, Select, TextInput, Toggle } from '../components/ui';
import { cameras as initialCameras, floors, zones as initialZones, zoneLabel, type Camera, type Zone, type ZoneType } from '../data/mock';
import { STAGE, blindSpot, cameraPlacements, counterLabels, fixtures, markerIcon, walls, zoneLabelPos, zoneRects, type Rect } from '../data/floorPlan';
import { statusChip } from './cameraStatus';
import s from './StoreLayout.module.css';

const toneVar: Record<Zone['tone'], string> = {
  success: 'var(--color-success)',
  primary: 'var(--color-primary)',
  warning: 'var(--color-warning)',
  purple: 'var(--color-purple)',
};

const zoneTypes: ZoneType[] = ['Entrance', 'Checkout area', 'Aisles', 'Fresh food', 'Household', 'Electronics'];
const tools = ['Select', 'Draw zone', 'Place camera', 'Calibrate'] as const;
const toolIcon: Record<(typeof tools)[number], [string, string]> = {
  Select: ['cursor', 'cursor'],
  'Draw zone': ['edit', 'edit-white'],
  'Place camera': ['camera-tool', 'camera-tool'],
  Calibrate: ['scan', 'scan'],
};

const box = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

export default function StoreLayout() {
  const [zones, setZones] = useState(initialZones);
  const [cameras, setCameras] = useState(initialCameras);
  const [floor, setFloor] = useState<'F1' | 'F2'>('F1');
  const [openFloors, setOpenFloors] = useState<Record<string, boolean>>({ F1: true, F2: false });
  const [selectedZoneId, setSelectedZoneId] = useState('B');
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [tab, setTab] = useState<'zone' | 'camera'>('zone');
  const [tool, setTool] = useState<(typeof tools)[number]>('Draw zone');
  const [draft, setDraft] = useState<Zone>(() => initialZones.find((z) => z.id === 'B')!);
  const [saved, setSaved] = useState(false);

  const zoneById = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z])), [zones]);
  const camerasIn = (zoneId: string) => cameras.filter((c) => c.zones.includes(zoneId));

  function selectZone(id: string) {
    const z = zoneById[id];
    if (!z) return;
    setSelectedZoneId(id);
    setDraft(z);
    setFloor(z.floor);
    setTab('zone');
    setSaved(false);
  }

  function selectCamera(code: string) {
    setSelectedCam(code);
    setTab('camera');
  }

  function saveZone() {
    setZones((all) => all.map((z) => (z.id === draft.id ? draft : z)));
    setSaved(true);
  }

  function deleteZone() {
    if (!window.confirm(`Delete ${zoneLabel(draft)}? Cameras keep their other zones.`)) return;
    setZones((all) => all.filter((z) => z.id !== draft.id));
    setCameras((all) => all.map((c) => ({ ...c, zones: c.zones.filter((id) => id !== draft.id) })));
    const next = zones.find((z) => z.id !== draft.id && z.floor === draft.floor);
    if (next) selectZone(next.id);
  }

  function toggleCoverage(cam: Camera, zoneId: string) {
    const covers = cam.zones.includes(zoneId);
    if (covers && cam.zones.length === 1) return; // every camera must cover at least one zone
    setCameras((all) => all.map((c) => (c.code === cam.code ? { ...c, zones: covers ? c.zones.filter((z) => z !== zoneId) : [...c.zones, zoneId] } : c)));
  }

  const floorZones = zones.filter((z) => z.floor === floor);
  const floorCameras = cameras.filter((c) => c.floor === floor);
  const selectedZone = zoneById[selectedZoneId];
  const camera = cameras.find((c) => c.code === selectedCam);

  return (
    <AdminLayout title="Store layout" subtitle={`Central Q1 store · ${floors.length} floors · ${zones.length} zones · ${cameras.length} cameras`}>
      {/* ---------- Structure tree ---------- */}
      <Card className={s.structure}>
        <Overline>STORE STRUCTURE</Overline>
        <div className={s.storeName}>
          <Icon name="store" size={15} />
          Central Q1 store
        </div>
        <div className={s.tree} role="tree">
          {floors.map((f) => {
            const open = openFloors[f.id];
            const fz = zones.filter((z) => z.floor === f.id);
            return (
              <div key={f.id} role="group">
                <button className={`${s.treeRow} ${s.floorRow}`} onClick={() => { setOpenFloors((o) => ({ ...o, [f.id]: !open })); setFloor(f.id); }} aria-expanded={open}>
                  <Icon name={open ? 'tree-chevron-down' : 'tree-chevron-right'} size={11} />
                  <Icon name="layers" size={13} />
                  <span>{f.name}</span>
                  <span className={s.count}>{fz.length} zones</span>
                </button>
                {open &&
                  fz.map((z) => {
                    const selected = z.id === selectedZoneId;
                    return (
                      <div key={z.id}>
                        <button className={`${s.treeRow} ${s.zoneRow} ${selected ? s.treeSelected : ''}`} onClick={() => selectZone(z.id)} aria-selected={selected}>
                          <Icon name={selected ? 'tree-chevron-down-active' : 'tree-chevron-right'} size={11} />
                          <Icon name={z.pin} size={13} />
                          <span>{zoneLabel(z)}</span>
                          <span className={s.count}>{camerasIn(z.id).length} cam</span>
                        </button>
                        {selected &&
                          camerasIn(z.id).map((c) => (
                            <button key={c.code} className={`${s.treeRow} ${s.camRow}`} onClick={() => selectCamera(c.code)}>
                              <Icon name="tree-chevron-right" size={11} />
                              <Icon name="tree-camera" size={13} />
                              <span>{c.code}</span>
                              {c.zones.filter((id) => id !== z.id).map((id) => (
                                <Chip key={id} tone="neutral">+ Zone {id}</Chip>
                              ))}
                            </button>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
          <button className={s.addFloor}>
            <Icon name="plus-primary" size={13} />
            Add floor
          </button>
        </div>
        <p className={s.hint}>A camera may cover several zones on its floor, so it can appear under more than one zone. Monitored areas of one zone must not overlap.</p>
        <div style={{ flex: 1 }} />
        <Overline>FLOOR PLAN SOURCE</Overline>
        <div className={s.source}>
          <div className={s.sourceFile}>
            <Icon name="file-primary" size={16} />
            <div>
              <p className={s.sourceName}>floorplan_F1.pdf</p>
              <p className={s.sourceMeta}>From store facilities · 24/09</p>
            </div>
          </div>
          <p className={s.sourceMeta} style={{ fontWeight: 500 }}>Scale 1 px = 5 cm · 42 × 36 m</p>
          <Button variant="secondary" icon="upload" block style={{ height: 30, fontSize: 11 }}>Replace floor plan</Button>
        </div>
      </Card>

      {/* ---------- Floor plan ---------- */}
      <Card className={s.canvas}>
        <div className={s.toolbar}>
          {tools.map((t) => (
            <Button key={t} variant={tool === t ? 'primary' : 'secondary'} icon={toolIcon[t][tool === t ? 1 : 0]} onClick={() => setTool(t)} aria-pressed={tool === t} style={{ padding: '0 10px' }}>
              {t}
            </Button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ width: 125 }}>
            <Segmented value={floor} onChange={setFloor} options={floors.map((f) => ({ value: f.id, label: f.short }))} />
          </div>
        </div>
        <div className={s.stageWrap}>
          {floor === 'F1' ? (
            <div className={s.stage} style={{ width: STAGE.w, height: STAGE.h }}>
              <div className={s.walls} style={box(walls)} />
              {floorZones.filter((z) => zoneRects[z.id]).map((z) => (
                <button
                  key={z.id}
                  aria-label={zoneLabel(z)}
                  className={`${s.zone} ${z.id === selectedZoneId ? s.zoneSelected : ''}`}
                  style={{ ...box(zoneRects[z.id]), ['--tone' as string]: toneVar[z.tone] }}
                  onClick={() => selectZone(z.id)}
                />
              ))}
              {fixtures.map((f, i) => <div key={i} className={s.fixture} style={box(f)} />)}
              {counterLabels.map((c) => <span key={c.text} className={s.counterLabel} style={{ left: c.x, top: c.y }}>{c.text}</span>)}
              <div className={s.abs} style={{ left: 43.31, top: 647, width: 87.92, height: 6, background: 'var(--color-surface)' }} />
              <span className={s.entrance} style={{ left: 55.03, top: 624 }}>ENTRANCE</span>
              <div className={s.blindSpot} style={box(blindSpot)} />
              {floorCameras.map((c) => {
                const p = cameraPlacements[c.code];
                if (!p) return null;
                return <img key={c.code} className={s.fov} src={iconSrc(p.fov.asset)} alt="" style={box(p.fov)} />;
              })}
              {floorCameras.map((c) => {
                const p = cameraPlacements[c.code];
                const home = zoneById[c.zones[0]];
                if (!p || !home) return null;
                const inSelected = c.zones.includes(selectedZoneId);
                const tone = inSelected && selectedZone ? toneVar[selectedZone.tone] : toneVar[home.tone];
                return (
                  <span key={c.code}>
                    <button
                      className={`${s.marker} ${inSelected ? s.markerFilled : ''} ${selectedCam === c.code && tab === 'camera' ? s.markerActive : ''}`}
                      style={{ left: p.marker.x, top: p.marker.y, ['--tone' as string]: tone }}
                      aria-label={c.code}
                      title={`${c.code} · covers ${c.zones.map((id) => `Zone ${id}`).join(', ')}`}
                      onClick={() => selectCamera(c.code)}
                    >
                      <Icon name={inSelected ? 'cam-marker-white' : markerIcon[home.id] ?? 'cam-marker-success'} size={11} />
                    </button>
                    {inSelected && <span className={s.camTag} style={{ left: p.label.x, top: p.label.y }}>{c.code}</span>}
                  </span>
                );
              })}
              {floorZones.filter((z) => zoneLabelPos[z.id]).map((z) => (
                <span key={z.id} className={s.zoneTag} style={{ left: zoneLabelPos[z.id].x, top: zoneLabelPos[z.id].y, ['--tone' as string]: toneVar[z.tone] }}>
                  <Icon name={z.dot} size={7} />
                  {zoneLabel(z)}
                </span>
              ))}
              {selectedZone && zoneRects[selectedZone.id] && corners(zoneRects[selectedZone.id]).map((c, i) => <span key={i} className={s.handle} style={{ left: c.x, top: c.y, borderColor: toneVar[selectedZone.tone] }} />)}
              <div className={s.legend} style={{ left: 14, top: 671 }}>
                <span><i className={s.swatch} style={{ background: 'var(--color-placeholder)', border: '1px solid var(--color-border)' }} />Shelf / fixture</span>
                <span><i className={s.swatch} style={{ background: 'color-mix(in srgb, var(--color-primary) 25%, transparent)' }} />Camera view</span>
                <span><i className={s.swatch} style={{ background: 'color-mix(in srgb, var(--color-danger) 25%, transparent)', border: '1px dashed var(--color-danger)' }} />Blind spot</span>
              </div>
              <span className={s.abs} style={{ left: 357, top: 674 }}>
                <Chip tone="danger" dot={undefined}>
                  <Icon name="alert-danger" size={11} />
                  <span style={{ fontSize: 10 }}>Coverage 96% · 1 blind spot</span>
                </Chip>
              </span>
            </div>
          ) : (
            <div className={s.emptyPlan}>
              <Icon name="upload" size={14} />
              <p>No floor plan uploaded for Floor 2 yet.</p>
              <Button variant="secondary" icon="upload">Upload floor plan</Button>
            </div>
          )}
        </div>
      </Card>

      {/* ---------- Properties ---------- */}
      <Card className={s.props}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'zone', label: 'Zone' }, { value: 'camera', label: 'Camera' }]} />
        {tab === 'zone' ? (
          <>
            <Field label="Zone name">
              <TextInput value={draft.name} onChange={(name) => { setDraft({ ...draft, name }); setSaved(false); }} />
            </Field>
            <Field label="Floor">
              <Select value={draft.floor} onChange={(f) => setDraft({ ...draft, floor: f })} options={floors.map((f) => ({ value: f.id, label: f.name }))} />
            </Field>
            <Field label="Zone type">
              <Select value={draft.type} onChange={(type) => setDraft({ ...draft, type })} options={zoneTypes.map((t) => ({ value: t, label: t }))} />
            </Field>
            <Overline>CAMERAS COVERING THIS ZONE</Overline>
            <div className={s.camList}>
              {camerasIn(draft.id).map((c) => {
                const others = c.zones.filter((id) => id !== draft.id);
                return (
                  <button key={c.code} className={s.camItem} style={{ width: '100%', textAlign: 'left' }} onClick={() => selectCamera(c.code)}>
                    <Icon name="camera-row" size={14} />
                    <div style={{ flex: 1 }}>
                      <p className={s.camCode}>{c.code}</p>
                      <p className={s.camNote}>{others.length ? `Also covers ${others.map((id) => `Zone ${id}`).join(', ')} · ${c.note}` : c.note}</p>
                    </div>
                    {statusChip(c.status)}
                  </button>
                );
              })}
              {camerasIn(draft.id).length === 0 && <p className={s.camItem} style={{ color: 'var(--color-text-muted)' }}>No camera covers this zone — it is a blind spot.</p>}
            </div>
            <Field label="Min. staff on shift">
              <span className={s.stepper}>
                <button aria-label="Decrease" disabled={draft.minStaff <= 1} onClick={() => setDraft({ ...draft, minStaff: draft.minStaff - 1 })}><Icon name="minus" size={14} /></button>
                <output>{draft.minStaff}</output>
                <button aria-label="Increase" onClick={() => setDraft({ ...draft, minStaff: draft.minStaff + 1 })}><Icon name="plus" size={14} /></button>
              </span>
            </Field>
            <div className={s.toggleRow}>
              <Toggle on={draft.recordingNotice} onChange={(v) => setDraft({ ...draft, recordingNotice: v })} label="Recording notice posted" />
              Recording notice posted at zone entrances
            </div>
            <Callout tone="info" icon="info">Business rule: every zone needs at least 1 staff on each shift. The Manager assigns shifts.</Callout>
            <div style={{ flex: 1 }} />
            {saved && <p className={s.saved}>Zone saved.</p>}
            <Button size="lg" block onClick={saveZone} style={{ height: 40 }}>Save zone</Button>
            <Button variant="dangerGhost" block onClick={deleteZone} style={{ height: 30, fontSize: 12 }}>Delete zone</Button>
          </>
        ) : camera ? (
          <>
            <div>
              <p className={s.camCode} style={{ fontSize: 15 }}>{camera.code}</p>
              <p className={s.camNote} style={{ fontSize: 11 }}>{floors.find((f) => f.id === camera.floor)?.name} · {camera.model}</p>
            </div>
            <div>{statusChip(camera.status)}</div>
            <Overline>ZONES THIS CAMERA COVERS</Overline>
            <div className={s.camList}>
              {zones.filter((z) => z.floor === camera.floor).map((z) => (
                <div key={z.id} className={s.zoneChoice}>
                  <Checkbox checked={camera.zones.includes(z.id)} onChange={() => toggleCoverage(camera, z.id)} label={zoneLabel(z)} />
                  <Icon name={z.pin} size={13} />
                  {zoneLabel(z)}
                </div>
              ))}
            </div>
            <Callout tone="info" icon="info">A camera covers one or more zones on its own floor. Draw one monitored area per zone so counts are not doubled.</Callout>
          </>
        ) : (
          <p className={s.camNote} style={{ fontSize: 11.5 }}>Select a camera on the plan or in the tree.</p>
        )}
      </Card>
    </AdminLayout>
  );
}

function corners(r: Rect) {
  return [
    { x: r.x - 4, y: r.y - 4 },
    { x: r.x + r.w - 4, y: r.y - 4 },
    { x: r.x - 4, y: r.y + r.h - 4 },
    { x: r.x + r.w - 4, y: r.y + r.h - 4 },
  ];
}


import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  getCameraPreview,
  listCameraMappings,
  removeCameraMapping,
  saveCameraMapping,
  type CameraRecord,
  type CameraZoneMapping,
  type MapPoint,
  type ZoneRecord,
} from '../api/cameras';
import { clientToNormalized } from './floorPlanGeometry';
import { Button, CardHeader, Chip } from './ui';
import s from './CameraCoverageEditor.module.css';

type Tool = 'idle' | 'draw' | 'edit';

export type CameraCoverageEditorProps = {
  camera: CameraRecord;
  zones: ZoneRecord[];
  onClose: () => void;
};

const DEFAULT_COLOR = '#3B82F6';
const HISTORY_LIMIT = 50;
const MAX_POINTS = 1000;

const clonePoints = (points: MapPoint[]) => points.map((point) => ({ ...point }));
const pointsAttribute = (points: MapPoint[]) => points.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ');

export function CameraCoverageEditor({ camera, zones, onClose }: CameraCoverageEditorProps) {
  const drawingLayerRef = useRef<SVGSVGElement>(null);
  const moveDrag = useRef<{ pointerId: number; start: MapPoint; original: MapPoint[]; moved: boolean } | null>(null);
  const resizeDrag = useRef<{ pointerId: number; index: number; original: MapPoint[] } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [mappings, setMappings] = useState<CameraZoneMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [targetZoneId, setTargetZoneId] = useState('');
  const [activeZoneId, setActiveZoneId] = useState<string>();
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [history, setHistory] = useState<MapPoint[][]>([]);
  const [complete, setComplete] = useState(false);
  const [tool, setTool] = useState<Tool>('idle');
  const [saving, setSaving] = useState(false);
  const [removingZoneId, setRemovingZoneId] = useState<string>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;

    void getCameraPreview(camera.cameraId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(reason, 'Could not load a camera preview.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });

    void listCameraMappings(camera.cameraId, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setMappings(loaded);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(reason, 'Could not load camera coverage.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setMappingsLoading(false);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [camera.cameraId]);

  const zoneById = (zoneId: string) => zones.find((zone) => zone.zoneId === zoneId);
  const pointForClient = (clientX: number, clientY: number) => {
    const layer = drawingLayerRef.current;
    return layer ? clientToNormalized(layer.getBoundingClientRect(), clientX, clientY) : { x: 0, y: 0 };
  };
  const remember = (snapshot: MapPoint[]) => {
    setHistory((current) => [...current, clonePoints(snapshot)].slice(-HISTORY_LIMIT));
  };
  const clearFeedback = () => {
    setError('');
    setMessage('');
  };

  const startDrawing = () => {
    if (!targetZoneId || !previewUrl) return;
    setActiveZoneId(targetZoneId);
    setPoints([]);
    setHistory([]);
    setComplete(false);
    setTool('draw');
    clearFeedback();
  };

  const editMapping = (mapping: CameraZoneMapping) => {
    setTargetZoneId(mapping.zoneId);
    setActiveZoneId(mapping.zoneId);
    setPoints(clonePoints(mapping.roiPolygon));
    setHistory([]);
    setComplete(true);
    setTool('edit');
    clearFeedback();
  };

  const startMove = (event: PointerEvent<SVGPolygonElement>) => {
    if (tool !== 'edit') return;
    event.stopPropagation();
    moveDrag.current = {
      pointerId: event.pointerId,
      start: pointForClient(event.clientX, event.clientY),
      original: clonePoints(points),
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueMove = (event: PointerEvent<SVGPolygonElement>) => {
    const drag = moveDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!drag.moved) {
      remember(drag.original);
      drag.moved = true;
    }
    const current = pointForClient(event.clientX, event.clientY);
    const minX = Math.min(...drag.original.map((point) => point.x));
    const maxX = Math.max(...drag.original.map((point) => point.x));
    const minY = Math.min(...drag.original.map((point) => point.y));
    const maxY = Math.max(...drag.original.map((point) => point.y));
    const dx = Math.max(-minX, Math.min(1 - maxX, current.x - drag.start.x));
    const dy = Math.max(-minY, Math.min(1 - maxY, current.y - drag.start.y));
    setPoints(drag.original.map((point) => ({ x: point.x + dx, y: point.y + dy })));
  };

  const finishMove = (event: PointerEvent<SVGPolygonElement>) => {
    if (moveDrag.current?.pointerId !== event.pointerId) return;
    moveDrag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const startResize = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    event.stopPropagation();
    const original = clonePoints(points);
    remember(original);
    resizeDrag.current = { pointerId: event.pointerId, index, original };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueResize = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const next = pointForClient(event.clientX, event.clientY);
    setPoints(drag.original.map((point, index) => index === drag.index ? next : point));
  };

  const finishResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (resizeDrag.current?.pointerId !== event.pointerId) return;
    resizeDrag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const undo = () => {
    if (history.length > 0) {
      setPoints(clonePoints(history[history.length - 1]));
      setHistory((current) => current.slice(0, -1));
    } else if (tool === 'draw' && points.length > 0) {
      setPoints((current) => current.slice(0, -1));
      setComplete(false);
    }
    setError('');
  };

  const save = async () => {
    if (!activeZoneId || !complete || points.length < 3) {
      setError('Close the ROI polygon before saving.');
      return;
    }
    const zone = zoneById(activeZoneId);
    setSaving(true);
    clearFeedback();
    try {
      const saved = await saveCameraMapping(camera.cameraId, activeZoneId, { roiPolygon: points, status: 'ACTIVE' });
      setMappings((current) => [...current.filter((mapping) => mapping.zoneId !== saved.zoneId), saved]);
      setTool('edit');
      setMessage(`${zone?.name ?? 'Zone'} mapped.`);
    } catch (reason) {
      setError(messageOf(reason, 'Could not save the ROI.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (mapping: CameraZoneMapping) => {
    const zone = zoneById(mapping.zoneId);
    setRemovingZoneId(mapping.zoneId);
    clearFeedback();
    try {
      await removeCameraMapping(camera.cameraId, mapping.zoneId);
      setMappings((current) => current.filter((item) => item.zoneId !== mapping.zoneId));
      if (activeZoneId === mapping.zoneId) {
        setActiveZoneId(undefined);
        setPoints([]);
        setHistory([]);
        setComplete(false);
        setTool('idle');
      }
      setMessage(`${zone?.name ?? 'Zone'} mapping removed.`);
    } catch (reason) {
      setError(messageOf(reason, 'Could not remove the ROI.'));
    } finally {
      setRemovingZoneId(undefined);
    }
  };

  const activeColor = zoneById(activeZoneId ?? '')?.colorHex ?? DEFAULT_COLOR;
  const canUndo = history.length > 0 || (tool === 'draw' && points.length > 0);

  return (
    <section className={s.editor} aria-label={`Coverage configuration for ${camera.code}`}>
      <div className={s.header}>
        <CardHeader title="Camera coverage" subtitle={`${camera.code} · Draw each zone as it appears in this camera.`} />
        <Button variant="secondary" onClick={onClose}>Back to floor plan</Button>
      </div>

      <div className={s.layout}>
        <div className={s.previewColumn}>
          <div className={s.previewFrame}>
            {previewUrl ? (
              <img className={s.preview} src={previewUrl} alt={`Camera preview for ${camera.code}`} />
            ) : (
              <div className={s.previewState}>{previewLoading ? 'Loading camera preview…' : 'Camera preview unavailable.'}</div>
            )}
            {previewUrl && (
              <svg
                ref={drawingLayerRef}
                className={s.drawingLayer}
                data-testid="roi-drawing-layer"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label="ROI drawing area"
                onClick={(event) => {
                  if (tool !== 'draw' || complete) return;
                  if (points.length >= MAX_POINTS) {
                    setError(`An ROI can contain at most ${MAX_POINTS} points.`);
                    return;
                  }
                  setPoints((current) => [...current, pointForClient(event.clientX, event.clientY)]);
                  setError('');
                }}
              >
                {mappings.filter((mapping) => mapping.zoneId !== activeZoneId).map((mapping) => {
                  const zone = zoneById(mapping.zoneId);
                  const color = zone?.colorHex ?? DEFAULT_COLOR;
                  return <polygon key={mapping.cameraZoneId} points={pointsAttribute(mapping.roiPolygon)} fill={color} stroke={color} className={s.savedRoi} />;
                })}
                {points.length >= 2 && (
                  <polygon
                    points={pointsAttribute(points)}
                    fill={activeColor}
                    stroke={activeColor}
                    className={`${s.activeRoi} ${tool === 'edit' ? s.movable : ''}`}
                    onPointerDown={startMove}
                    onPointerMove={continueMove}
                    onPointerUp={finishMove}
                    onPointerCancel={() => { moveDrag.current = null; }}
                    onLostPointerCapture={() => { moveDrag.current = null; }}
                  />
                )}
              </svg>
            )}
            {previewUrl && points.map((point, index) => tool === 'edit' ? (
              <button
                key={`roi-${activeZoneId}-${index}`}
                type="button"
                className={s.resizeHandle}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, '--roi-color': activeColor } as CSSProperties}
                aria-label={`Resize ROI point ${index + 1}`}
                onPointerDown={(event) => startResize(event, index)}
                onPointerMove={continueResize}
                onPointerUp={finishResize}
                onPointerCancel={() => { resizeDrag.current = null; }}
                onLostPointerCapture={() => { resizeDrag.current = null; }}
              />
            ) : (
              <span
                key={`roi-draft-${index}`}
                className={s.point}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, backgroundColor: activeColor }}
                aria-hidden="true"
              />
            ))}
          </div>
          <p className={s.hint}>Draw on this camera image. The ROI is linked to a floor zone; it is not projected from the floor map.</p>
        </div>

        <aside className={s.controls}>
          <label className={s.field}>Target zone
            <select value={targetZoneId} onChange={(event) => setTargetZoneId(event.target.value)} disabled={!previewUrl || saving}>
              <option value="">Select a zone</option>
              {zones.map((zone) => <option key={zone.zoneId} value={zone.zoneId}>{zone.name} ({zone.code})</option>)}
            </select>
          </label>
          <Button block disabled={!targetZoneId || !previewUrl || saving} onClick={startDrawing}>Draw polygon ROI</Button>

          {tool === 'draw' && (
            <Button variant="secondary" block disabled={points.length < 3 || complete} onClick={() => setComplete(true)}>Close polygon</Button>
          )}
          {(tool === 'draw' || tool === 'edit') && (
            <div className={s.editActions}>
              <Button variant="secondary" disabled={!canUndo || saving} onClick={undo}>Undo</Button>
              <Button disabled={!complete || points.length < 3 || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save ROI'}</Button>
            </div>
          )}

          <div className={s.mappingHeader}>
            <strong>Mapped zones</strong>
            <Chip tone="neutral">{mappings.length}</Chip>
          </div>
          {mappingsLoading ? <p className={s.muted}>Loading mappings…</p> : mappings.length === 0 ? (
            <p className={s.muted}>No zones are mapped to this camera yet.</p>
          ) : (
            <ul className={s.mappingList}>
              {mappings.map((mapping) => {
                const zone = zoneById(mapping.zoneId);
                const name = zone?.name ?? 'Unknown zone';
                return (
                  <li key={mapping.cameraZoneId}>
                    <span className={s.zoneDot} style={{ backgroundColor: zone?.colorHex ?? DEFAULT_COLOR }} aria-hidden="true" />
                    <span><strong>{name}</strong><small>{mapping.roiPolygon.length} points</small></span>
                    {mapping.status === 'ACTIVE' && <a href={`/admin/ai-config?zoneId=${encodeURIComponent(mapping.zoneId)}`}>Configure monitoring for {name}</a>}
                    <button type="button" onClick={() => editMapping(mapping)} disabled={!previewUrl || saving}>Edit ROI for {name}</button>
                    <button type="button" className={s.remove} onClick={() => void remove(mapping)} disabled={removingZoneId === mapping.zoneId || saving}>Remove ROI for {name}</button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className={s.error} role="alert">{error}</p>}
          {message && <p className={s.success} role="status">{message}</p>}
        </aside>
      </div>
    </section>
  );
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

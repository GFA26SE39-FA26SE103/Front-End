import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { MapPoint } from '../api/floors';
import { clientToNormalized, clampNormalized } from './floorPlanGeometry';
import { Button } from './ui';
import { validateRoiPolygon, MAX_ROI_POINTS as MAX_POINTS } from './roiPolygonValidation';
import s from './CameraCoverageEditor.module.css';

export type RoiDraft = { points: MapPoint[]; complete: boolean; editing: boolean };
export type RoiBackground = { id: string; points: MapPoint[]; color: string; label?: string };
type Props = {
  previewUrl?: string; previewLoading?: boolean; cameraCode: string;
  draft: RoiDraft; onChange: (draft: RoiDraft) => void; color?: string; label?: string;
  backgroundRois?: RoiBackground[]; disabled?: boolean; canDraw?: boolean;
};
const HISTORY_LIMIT = 50;
const copy = (draft: RoiDraft): RoiDraft => ({ ...draft, points: draft.points.map(p => ({ ...p })) });
const attributes = (points: MapPoint[]) => points.map(p => `${p.x * 1000},${p.y * 1000}`).join(' ');

export function PolygonRoiEditor({ previewUrl, previewLoading = false, cameraCode, draft, onChange,
  color = '#3B82F6', label = 'ROI', backgroundRois = [], disabled = false, canDraw = true }: Props) {
  const layerRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointerId: number; original: RoiDraft; start: MapPoint; index?: number; remembered: boolean } | null>(null);
  const [history, setHistory] = useState<RoiDraft[]>([]);
  const [error, setError] = useState('');
  const { points, complete, editing } = draft;
  const remember = () => setHistory(h => [...h, copy(draft)].slice(-HISTORY_LIMIT));
  const at = (x: number, y: number) => clientToNormalized(layerRef.current!.getBoundingClientRect(), x, y);
  const startDrag = (event: PointerEvent<SVGPolygonElement | HTMLButtonElement>, index?: number) => {
    if (disabled || !editing || !canDraw) return;
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, original: copy(draft), start: at(event.clientX, event.clientY), index, remembered: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<SVGPolygonElement | HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || disabled) return;
    event.stopPropagation();
    if (!current.remembered) { setHistory(h => [...h, current.original].slice(-HISTORY_LIMIT)); current.remembered = true; }
    const next = at(event.clientX, event.clientY); const original = current.original.points;
    if (current.index !== undefined) {
      onChange({ ...draft, points: original.map((p, i) => i === current.index ? next : p) });
    } else {
      const dx = Math.max(-Math.min(...original.map(p => p.x)), Math.min(1 - Math.max(...original.map(p => p.x)), next.x - current.start.x));
      const dy = Math.max(-Math.min(...original.map(p => p.y)), Math.min(1 - Math.max(...original.map(p => p.y)), next.y - current.start.y));
      onChange({ ...draft, points: original.map(p => ({ x: p.x + dx, y: p.y + dy })) });
    }
    setError('');
  };
  const endDrag = (event: PointerEvent<SVGPolygonElement | HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const cancelDrag = () => { drag.current = null; };
  const undo = () => {
    if (!history.length) {
      if (!complete && points.length > 0) onChange({ points: points.slice(0, -1), complete: false, editing: false });
      setError(''); return;
    }
    onChange(copy(history[history.length - 1])); setHistory(h => h.slice(0, -1)); setError('');
  };

  return <div className={s.previewColumn} aria-label={`${label} polygon editor`}>
    {previewUrl && <p className={s.drawingHint}>{!canDraw ? 'Select a zone or counter to draw its ROI.'
      : complete ? 'Shape complete. Drag the area or its corner points to adjust it.'
        : points.length < 3 ? 'Click around the area on the image to place at least 3 points.'
          : 'Add more points or select Finish shape to close the outline.'}</p>}
    <div className={s.previewFrame}>
      {previewUrl ? <img className={s.preview} src={previewUrl} alt={`Camera preview for ${cameraCode}`} />
        : <div className={s.previewState}>{previewLoading ? 'Loading camera preview…' : 'Camera preview unavailable.'}</div>}
      {previewUrl && <svg ref={layerRef} className={`${s.drawingLayer} ${canDraw && !disabled && !complete ? s.drawing : ''}`} data-testid="roi-drawing-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={`${label} drawing area`}
        onClick={event => {
          if (disabled || complete || editing || !canDraw) return;
          if (points.length >= MAX_POINTS) { setError(`An ROI can contain at most ${MAX_POINTS} points.`); return; }
          remember(); onChange({ points: [...points, at(event.clientX, event.clientY)], complete: false, editing: false }); setError('');
        }}>
        {backgroundRois.map(roi => <g key={roi.id}>
          <polygon points={attributes(roi.points)} fill={roi.color} stroke={roi.color} className={s.savedRoi}><title>{roi.label}</title></polygon>
          {roi.label && roi.points.length > 0 && <text className={s.roiLabel} x={roi.points.reduce((n, p) => n + p.x, 0) / roi.points.length * 1000} y={roi.points.reduce((n, p) => n + p.y, 0) / roi.points.length * 1000} textAnchor="middle">{roi.label}</text>}
        </g>)}
        {!complete && points.length >= 2 && <polyline points={attributes(points)} fill="none" stroke={color} className={s.openRoi} />}
        {complete && points.length >= 3 && <polygon points={attributes(points)} fill={color} stroke={color} data-testid="active-roi" className={`${s.activeRoi} ${editing && !disabled ? s.movable : ''}`}
          onPointerDown={e => startDrag(e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}><title>{label}</title></polygon>}
      </svg>}
      {previewUrl && points.map((point, i) => editing ? <button key={i} type="button" className={s.resizeHandle}
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, '--roi-color': color } as CSSProperties}
        aria-label={`Resize ROI point ${i + 1}`} disabled={disabled}
        onPointerDown={e => startDrag(e, i)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
        onKeyDown={e => {
          const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (!delta) return; e.preventDefault(); remember(); const step = e.shiftKey ? .05 : .01;
          onChange({ ...draft, points: points.map((p, index) => index === i ? clampNormalized({ x: p.x + delta[0] * step, y: p.y + delta[1] * step }) : p) });
        }} /> : <span key={i} className={s.point} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, backgroundColor: color }} aria-hidden="true" />)}
    </div>
    <div className={s.polygonTools}>
      {!complete && <Button disabled={!previewUrl || disabled || !canDraw || points.length < 3} onClick={() => {
        const issue = validateRoiPolygon(points); if (issue) { setError(issue); return; }
        remember(); onChange({ ...draft, complete: true, editing: true }); setError('');
      }}>Finish shape</Button>}
      <Button variant="secondary" disabled={disabled || !canDraw || history.length === 0 && (complete || points.length === 0)} onClick={undo}>Undo</Button>
      {points.length > 0 && <Button variant="secondary" disabled={!previewUrl || disabled || !canDraw} onClick={() => {
        remember(); onChange({ points: [], complete: false, editing: false }); setError('');
      }}>Start over</Button>}
    </div>
    {complete && <p className={s.hint}>Use arrow keys to move a focused corner point. Hold Shift for larger steps.</p>}
    {error && <p role="alert" className={s.error}>{error}</p>}
  </div>;
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
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
  backgroundRois?: RoiBackground[]; disabled?: boolean; canDraw?: boolean; readOnly?: boolean;
};
const HISTORY_LIMIT = 50;
const MIN_RECTANGLE_SPAN = 0.005;
const copy = (draft: RoiDraft): RoiDraft => ({ ...draft, points: draft.points.map(p => ({ ...p })) });
const attributes = (points: MapPoint[]) => points.map(p => `${p.x * 1000},${p.y * 1000}`).join(' ');
const rectanglePoints = (a: MapPoint, b: MapPoint): MapPoint[] => [
  { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
  { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
];
const isRectangle = (points: MapPoint[]) => points.length === 4
  && points.every((point, i) => {
    const next = points[(i + 1) % 4];
    return (point.x === next.x) !== (point.y === next.y);
  });

export function PolygonRoiEditor({ previewUrl, previewLoading = false, cameraCode, draft, onChange,
  color = '#3B82F6', label = 'ROI', backgroundRois = [], disabled: temporarilyDisabled = false, canDraw = true, readOnly = false }: Props) {
  const disabled = temporarilyDisabled || readOnly;
  const layerRef = useRef<SVGSVGElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarDrag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 16, y: 16 });
  const drag = useRef<{ pointerId: number; original: RoiDraft; start: MapPoint; index?: number; remembered: boolean } | null>(null);
  const rectangleDrag = useRef<{ pointerId: number; start: MapPoint; original: RoiDraft } | null>(null);
  const [shape, setShape] = useState<'polygon' | 'rectangle'>(() => isRectangle(draft.points) ? 'rectangle' : 'polygon');
  const [history, setHistory] = useState<RoiDraft[]>([]);
  const [error, setError] = useState('');
  const clampToolbar = (x: number, y: number) => ({
    x: Math.max(0, Math.min(Math.max(0, window.innerWidth - (toolbarRef.current?.offsetWidth ?? 260)), x)),
    y: Math.max(0, Math.min(Math.max(0, window.innerHeight - (toolbarRef.current?.offsetHeight ?? 100)), y)),
  });
  useLayoutEffect(() => {
    if (!previewUrl || readOnly || !previewFrameRef.current) return;
    const frame = previewFrameRef.current.getBoundingClientRect();
    if (frame.width > 0) setToolbarPosition(clampToolbar(frame.left, frame.bottom + 16));
  }, [previewUrl, readOnly]);
  useEffect(() => {
    const keepOnScreen = () => setToolbarPosition(current => {
      const next = clampToolbar(current.x, current.y);
      return next.x === current.x && next.y === current.y ? current : next;
    });
    window.addEventListener('resize', keepOnScreen);
    return () => window.removeEventListener('resize', keepOnScreen);
  }, []);
  const moveToolbarByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
    if (!delta) return;
    event.preventDefault();
    setToolbarPosition(current => clampToolbar(current.x + delta[0], current.y + delta[1]));
  };
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
      if (isRectangle(original)) {
        const operated = original[current.index];
        const opposite = original[(current.index + 2) % 4];
        const x = operated.x < opposite.x ? Math.min(next.x, opposite.x - MIN_RECTANGLE_SPAN) : Math.max(next.x, opposite.x + MIN_RECTANGLE_SPAN);
        const y = operated.y < opposite.y ? Math.min(next.y, opposite.y - MIN_RECTANGLE_SPAN) : Math.max(next.y, opposite.y + MIN_RECTANGLE_SPAN);
        onChange({ ...draft, points: original.map(p => ({ x: p.x === operated.x ? x : p.x, y: p.y === operated.y ? y : p.y })) });
      } else onChange({ ...draft, points: original.map((p, i) => i === current.index ? next : p) });
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
    {previewUrl && <p className={s.drawingHint}>{readOnly ? 'Saved ROIs are read-only.' : !canDraw ? 'Select a zone or counter to draw its ROI.'
      : complete ? 'Shape complete. Drag the area or its corner points to adjust it.'
        : shape === 'rectangle' ? 'Drag on the image to draw a rectangle.'
        : points.length < 3 ? 'Click around the area on the image to place at least 3 points.'
          : 'Add more points or select Finish shape to close the outline.'}</p>}
    <div ref={previewFrameRef} className={s.previewFrame}>
      {previewUrl ? <img className={s.preview} src={previewUrl} alt={`Camera preview for ${cameraCode}`} />
        : <div className={s.previewState}>{previewLoading ? 'Loading camera preview…' : 'Camera preview unavailable.'}</div>}
      {previewUrl && <svg ref={layerRef} className={`${s.drawingLayer} ${canDraw && !disabled && !complete ? s.drawing : ''}`} data-testid="roi-drawing-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={`${label} drawing area`}
        onPointerDown={event => {
          if (shape !== 'rectangle' || disabled || !canDraw || complete || event.button !== 0) return;
          rectangleDrag.current = { pointerId: event.pointerId, start: at(event.clientX, event.clientY), original: copy(draft) };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => {
          const current = rectangleDrag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          onChange({ points: rectanglePoints(current.start, at(event.clientX, event.clientY)), complete: false, editing: false });
        }}
        onPointerUp={event => {
          const current = rectangleDrag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          rectangleDrag.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          const end = at(event.clientX, event.clientY);
          if (Math.abs(end.x - current.start.x) < MIN_RECTANGLE_SPAN || Math.abs(end.y - current.start.y) < MIN_RECTANGLE_SPAN) {
            onChange(current.original); return;
          }
          setHistory(h => [...h, current.original].slice(-HISTORY_LIMIT));
          onChange({ points: rectanglePoints(current.start, end), complete: true, editing: true });
          setError('');
        }}
        onPointerCancel={event => {
          const current = rectangleDrag.current;
          if (current?.pointerId !== event.pointerId) return;
          rectangleDrag.current = null;
          onChange(current.original);
        }}
        onClick={event => {
          if (shape !== 'polygon') return;
          if (disabled || complete || editing || !canDraw) return;
          if (points.length >= MAX_POINTS) { setError(`An ROI can contain at most ${MAX_POINTS} points.`); return; }
          remember(); onChange({ points: [...points, at(event.clientX, event.clientY)], complete: false, editing: false }); setError('');
        }}>
        {backgroundRois.map(roi => <g key={roi.id}>
          <polygon points={attributes(roi.points)} fill={roi.color} stroke={roi.color} className={s.savedRoi}><title>{roi.label}</title></polygon>
          {roi.label && roi.points.length > 0 && <text className={s.roiLabel} x={roi.points.reduce((n, p) => n + p.x, 0) / roi.points.length * 1000} y={roi.points.reduce((n, p) => n + p.y, 0) / roi.points.length * 1000} textAnchor="middle">{roi.label}</text>}
        </g>)}
        {!complete && shape === 'rectangle' && points.length === 4 && <polygon points={attributes(points)} fill={color} stroke={color} className={s.activeRoi} />}
        {!complete && shape === 'polygon' && points.length >= 2 && <polyline points={attributes(points)} fill="none" stroke={color} className={s.openRoi} />}
        {complete && points.length >= 3 && <polygon points={attributes(points)} fill={color} stroke={color} data-testid="active-roi" className={`${s.activeRoi} ${editing && !disabled ? s.movable : ''}`}
          onPointerDown={e => startDrag(e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}><title>{label}</title></polygon>}
      </svg>}
      {!readOnly && previewUrl && points.map((point, i) => editing ? <button key={i} type="button" className={s.resizeHandle}
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, '--roi-color': color } as CSSProperties}
        aria-label={`Resize ROI point ${i + 1}`} disabled={disabled}
        onPointerDown={e => startDrag(e, i)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
        onKeyDown={e => {
          const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (!delta) return; e.preventDefault(); remember(); const step = e.shiftKey ? .05 : .01;
          onChange({ ...draft, points: points.map((p, index) => index === i ? clampNormalized({ x: p.x + delta[0] * step, y: p.y + delta[1] * step }) : p) });
        }} /> : <span key={i} className={s.point} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, '--roi-color': color } as CSSProperties} aria-hidden="true" />)}
    </div>
    {!readOnly && previewUrl && typeof document !== 'undefined' && createPortal(<div ref={toolbarRef} className={s.roiToolbar} role="toolbar" aria-label="ROI drawing tools" style={{ left: toolbarPosition.x, top: toolbarPosition.y }}>
      <button type="button" className={s.roiToolbarHandle} aria-label="Move ROI toolbar" onKeyDown={moveToolbarByKeyboard}
        onPointerDown={event => {
          toolbarDrag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...toolbarPosition };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => {
          const start = toolbarDrag.current;
          if (start?.pointerId === event.pointerId) setToolbarPosition(clampToolbar(start.x + event.clientX - start.clientX, start.y + event.clientY - start.clientY));
        }}
        onPointerUp={event => {
          if (toolbarDrag.current?.pointerId === event.pointerId) toolbarDrag.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => { toolbarDrag.current = null; }}>
        <span aria-hidden="true">⋮⋮</span> ROI drawing
      </button>
      <div className={s.roiShapeTools} aria-label="ROI shape">
        <Button variant={shape === 'rectangle' ? 'primary' : 'secondary'} aria-pressed={shape === 'rectangle'} disabled={disabled || points.length > 0} onClick={() => setShape('rectangle')}>Rectangle</Button>
        <Button variant={shape === 'polygon' ? 'primary' : 'secondary'} aria-pressed={shape === 'polygon'} disabled={disabled || points.length > 0} onClick={() => setShape('polygon')}>Polygon</Button>
      </div>
      <div className={s.polygonTools}>
      {shape === 'polygon' && !complete && <Button disabled={!previewUrl || disabled || !canDraw || points.length < 3} onClick={() => {
        const issue = validateRoiPolygon(points); if (issue) { setError(issue); return; }
        remember(); onChange({ ...draft, complete: true, editing: true }); setError('');
      }}>Finish shape</Button>}
      <Button variant="secondary" disabled={disabled || !canDraw || history.length === 0 && (complete || points.length === 0)} onClick={undo}>Undo</Button>
      {points.length > 0 && <Button variant="secondary" disabled={!previewUrl || disabled || !canDraw} onClick={() => {
        remember(); onChange({ points: [], complete: false, editing: false }); setError('');
      }}>Start over</Button>}
      </div>
    </div>, document.body)}
    {error && <p role="alert" className={s.error}>{error}</p>}
  </div>;
}

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../api/client';
import type { MapPoint, ZoneRecord } from '../api/floors';
import { clientToNormalized } from './floorPlanGeometry';
import { ZoneUsageSummary } from './ZoneUsageSummary';
import s from './ZoneEditorOverlay.module.css';

export type ZoneEditorSave = {
  zoneId?: string;
  name: string;
  zoneType: string;
  colorHex: string;
  mapPolygon: MapPoint[];
  areaM2?: number | null;
};

export type ZoneEditorOverlayProps = {
  zones: ZoneRecord[];
  saving: boolean;
  onSave: (zone: ZoneEditorSave) => Promise<void> | void;
  onDelete: (zoneId: string) => Promise<void> | void;
  onCancel: () => void;
};

const colors = [
  ['Red', '#EF4444'],
  ['Orange', '#F97316'],
  ['Yellow', '#EAB308'],
  ['Green', '#22C55E'],
  ['Blue', '#3B82F6'],
  ['Purple', '#8B5CF6'],
  ['Pink', '#EC4899'],
  ['Gray', '#6B7280'],
] as const;

const zoneTypes = [
  { value: 'ENTRANCE', label: 'Entrance' },
  { value: 'CHECKOUT', label: 'Checkout' },
  { value: 'STORE_AISLE', label: 'Store Aisle' },
  { value: 'STAFF_SERVICE', label: 'Staff Service' },
] as const;
const zoneTypeCodes = new Set<string>(zoneTypes.map((zoneType) => zoneType.value));
const legacyAisleTypes = new Set(['AISLES', 'FRESH_FOOD', 'HOUSEHOLD', 'ELECTRONICS']);

const DEFAULT_COLOR = '#3B82F6';
const MIN_ZONE_SPAN = 0.005;
const HISTORY_LIMIT = 50;

const rectanglePoints = (start: MapPoint, end: MapPoint): MapPoint[] => {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
};

const clonePoints = (points: MapPoint[]) => points.map((point) => ({ ...point }));
const pointsAttribute = (points: MapPoint[]) => points.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ');
const nearlyEqual = (left: number, right: number) => Math.abs(left - right) < 0.000001;

const isAxisAlignedRectangle = (points: MapPoint[]) => {
  if (points.length !== 4) return false;
  const xs = [...new Set(points.map((point) => point.x))];
  const ys = [...new Set(points.map((point) => point.y))];
  return xs.length === 2 && ys.length === 2
    && xs.every((x) => ys.every((y) => points.some((point) => nearlyEqual(point.x, x) && nearlyEqual(point.y, y))));
};

const centerOf = (points: MapPoint[]): MapPoint => {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point.x * next.y - next.x * point.y;
    twiceArea += cross;
    weightedX += (point.x + next.x) * cross;
    weightedY += (point.y + next.y) * cross;
  });
  if (Math.abs(twiceArea) < 0.000001) {
    return points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 });
  }
  return { x: weightedX / (3 * twiceArea), y: weightedY / (3 * twiceArea) };
};

const percentage = (value: number) => `${Number((value * 100).toFixed(4))}%`;

const textColorFor = (color: string) => {
  const value = color.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? '#111827' : '#FFFFFF';
};

export function ZoneEditorOverlay({ zones, saving, onSave, onDelete, onCancel }: ZoneEditorOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drawingLayerRef = useRef<SVGSVGElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const rectangleDrag = useRef<{ pointerId: number; start: MapPoint; drawing: boolean } | null>(null);
  const moveDrag = useRef<{ pointerId: number; start: MapPoint; original: MapPoint[]; moved: boolean } | null>(null);
  const resizeDrag = useRef<{ pointerId: number; index: number; original: MapPoint[]; rectangle: boolean } | null>(null);
  const toolbarDrag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [history, setHistory] = useState<MapPoint[][]>([]);
  const [complete, setComplete] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [name, setName] = useState('');
  const [zoneType, setZoneType] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [areaEdited, setAreaEdited] = useState(false);
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [usageRevision, setUsageRevision] = useState(0);
  const [error, setError] = useState('');
  const [toolbarPosition, setToolbarPosition] = useState({ x: 16, y: 16 });

  const resetDraft = () => {
    setPoints([]);
    setHistory([]);
    setComplete(false);
    setSelectedZoneId(undefined);
    setName('');
    setZoneType('');
    setAreaM2('');
    setAreaEdited(false);
    setColorHex(DEFAULT_COLOR);
    setConfirmDelete(false);
    setError('');
  };

  const pointForClient = (clientX: number, clientY: number) => {
    const layer = drawingLayerRef.current;
    return layer ? clientToNormalized(layer.getBoundingClientRect(), clientX, clientY) : { x: 0, y: 0 };
  };

  const selectZone = (zone: ZoneRecord) => {
    if (selectedZoneId === zone.zoneId) return;
    setSelectedZoneId(zone.zoneId);
    const xs = zone.mapPolygon.map(point => point.x);
    const ys = zone.mapPolygon.map(point => point.y);
    setPoints(isAxisAlignedRectangle(zone.mapPolygon) ? clonePoints(zone.mapPolygon)
      : rectanglePoints({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }));
    setHistory([]);
    setComplete(true);
    setName(zone.name);
    const savedType = zone.zoneType ?? '';
    setZoneType(legacyAisleTypes.has(savedType) ? 'STORE_AISLE' : savedType);
    setAreaM2(zone.areaM2 == null ? '' : String(zone.areaM2));
    setAreaEdited(false);
    setColorHex(zone.colorHex ?? DEFAULT_COLOR);
    setConfirmDelete(false);
    setError('');
  };

  const remember = (snapshot: MapPoint[]) => {
    setHistory((current) => [...current, clonePoints(snapshot)].slice(-HISTORY_LIMIT));
  };

  const clampToolbarPosition = (x: number, y: number) => {
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();
    const width = toolbarRect?.width ?? 290;
    const height = toolbarRect?.height ?? 0;
    return {
      x: Math.max(0, Math.min(Math.max(0, window.innerWidth - width), x)),
      y: Math.max(0, Math.min(Math.max(0, window.innerHeight - height), y)),
    };
  };

  const moveToolbar = (clientX: number, clientY: number) => {
    const drag = toolbarDrag.current;
    if (!drag) return;
    setToolbarPosition(clampToolbarPosition(drag.x + clientX - drag.clientX, drag.y + clientY - drag.clientY));
  };

  const moveToolbarByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const movements: Record<string, MapPoint> = {
      ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 },
    };
    const movement = movements[event.key];
    if (!movement) return;
    event.preventDefault();
    setToolbarPosition((current) => clampToolbarPosition(current.x + movement.x, current.y + movement.y));
  };

  useEffect(() => {
    const keepToolbarOnScreen = () => setToolbarPosition((current) => {
      const next = clampToolbarPosition(current.x, current.y);
      return current.x === next.x && current.y === next.y ? current : next;
    });
    window.addEventListener('resize', keepToolbarOnScreen);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(keepToolbarOnScreen);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', keepToolbarOnScreen);
    };
  }, []);

  const startMove = (event: PointerEvent<SVGPolygonElement>, zone: ZoneRecord) => {
    event.stopPropagation();
    if (saving || event.button !== 0) return;
    const original = selectedZoneId === zone.zoneId ? clonePoints(points) : clonePoints(zone.mapPolygon);
    selectZone(zone);
    moveDrag.current = { pointerId: event.pointerId, start: pointForClient(event.clientX, event.clientY), original, moved: false };
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
    resizeDrag.current = { pointerId: event.pointerId, index, original, rectangle: isAxisAlignedRectangle(original) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueResize = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const next = pointForClient(event.clientX, event.clientY);
    if (!drag.rectangle) {
      setPoints(drag.original.map((point, index) => index === drag.index ? next : point));
      return;
    }

    const operated = drag.original[drag.index];
    const opposite = drag.original.find((point) => !nearlyEqual(point.x, operated.x) && !nearlyEqual(point.y, operated.y));
    if (!opposite) return;
    const x = operated.x < opposite.x
      ? Math.min(next.x, opposite.x - MIN_ZONE_SPAN)
      : Math.max(next.x, opposite.x + MIN_ZONE_SPAN);
    const y = operated.y < opposite.y
      ? Math.min(next.y, opposite.y - MIN_ZONE_SPAN)
      : Math.max(next.y, opposite.y + MIN_ZONE_SPAN);
    setPoints(drag.original.map((point) => ({
      x: nearlyEqual(point.x, operated.x) ? x : point.x,
      y: nearlyEqual(point.y, operated.y) ? y : point.y,
    })));
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
    } else if (!selectedZoneId) {
      setPoints([]);
      setComplete(false);
    }
    setError('');
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!complete || !isAxisAlignedRectangle(points)) return setError('Draw a rectangular zone before saving.');
    if (!trimmedName) return setError('Enter a zone name.');
    if (!zoneTypeCodes.has(zoneType)) return setError('Choose a zone type.');
    if (!/^#[0-9A-F]{6}$/i.test(colorHex)) return setError('Choose a valid zone color.');
    const areaText = areaM2.trim().replace(',', '.');
    const area = areaText ? Number(areaText) : null;
    if (areaEdited && area !== null && (!/^\d+(?:\.\d{1,2})?$/.test(areaText) || area < 0.01 || area > 9999999999.99))
      return setError('Enter a zone area from 0.01 to 9999999999.99 m² with up to two decimal places.');
    setError('');
    try {
      await onSave({ zoneId: selectedZoneId, name: trimmedName, zoneType, colorHex: colorHex.toUpperCase(), mapPolygon: points,
        ...(areaEdited ? { areaM2: area } : {}) });
      resetDraft();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Could not save the zone.');
    }
  };

  const remove = async () => {
    if (!selectedZoneId) return;
    setError('');
    try {
      await onDelete(selectedZoneId);
      resetDraft();
    } catch (reason) {
      setConfirmDelete(false);
      if (reason instanceof ApiError && reason.code === 'ZONE_IN_USE') setUsageRevision(value => value + 1);
      setError(reason instanceof Error && reason.message ? reason.message : 'Could not delete the zone.');
    }
  };

  const canUndo = history.length > 0 || (!selectedZoneId && points.length > 0);
  const toolbar = (
    <div
      ref={toolbarRef}
      className={s.toolbar}
      role="toolbar"
      aria-label="Zone drawing tools"
      style={{ position: 'fixed', left: toolbarPosition.x, top: toolbarPosition.y }}
    >
      <button
        type="button"
        className={s.dragHandle}
        aria-label="Move zone toolbar"
        onKeyDown={moveToolbarByKeyboard}
        onPointerDown={(event) => {
          toolbarDrag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...toolbarPosition };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => { if (toolbarDrag.current?.pointerId === event.pointerId) moveToolbar(event.clientX, event.clientY); }}
        onPointerUp={(event) => {
          if (toolbarDrag.current?.pointerId === event.pointerId) toolbarDrag.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => { toolbarDrag.current = null; }}
      >
        <span aria-hidden="true">⋮⋮</span> Zone editor
      </button>

      <p className={s.drawHint}>Select a zone to edit it, or drag on empty space to draw a new zone.</p>

      <div className={s.palette} aria-label="Preset zone colors">
        {colors.map(([label, value]) => (
          <button
            key={value}
            type="button"
            className={s.swatch}
            style={{ backgroundColor: value }}
            aria-label={label}
            aria-pressed={colorHex === value}
            onClick={() => setColorHex(value)}
          />
        ))}
        <label className={s.customColor}>Custom<input aria-label="Custom zone color" type="color" value={colorHex} onChange={(event) => setColorHex(event.target.value.toUpperCase())} /></label>
      </div>

      <label className={s.field}>Zone name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
      <label className={s.field}>Zone type
        <select value={zoneType} onChange={(event) => setZoneType(event.target.value)} required>
          <option value="">Select zone type</option>
          {zoneTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className={s.field}>Zone area (m²)
        <input aria-label="Zone area (m²)" aria-describedby="zone-area-help" inputMode="decimal" value={areaM2}
          onChange={(event) => { setAreaM2(event.target.value); setAreaEdited(true); }} />
        <small id="zone-area-help">Enter the measured floor area covered by the single camera ROI for crowd density.</small>
      </label>
      {selectedZoneId && <ZoneUsageSummary key={`${selectedZoneId}:${usageRevision}`} zoneId={selectedZoneId} />}
      {error && <p className={s.error} role="alert">{error}</p>}
      {confirmDelete && <div className={s.deleteConfirm} role="alert">
        <p>Delete <strong>{name}</strong>? This cannot be undone.</p>
        <div className={s.actions}>
          <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Keep zone</button>
          <button type="button" className={s.delete} disabled={saving} onClick={() => void remove()}>{saving ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
      </div>}
      <div className={s.actions}>
        <button type="button" disabled={!canUndo || saving} onClick={undo}>Undo</button>
        {selectedZoneId && !confirmDelete && <button type="button" className={s.delete} disabled={saving} onClick={() => setConfirmDelete(true)}>Delete zone</button>}
        <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" className={s.save} disabled={saving || !complete} onClick={() => void save()}>{saving ? 'Saving…' : 'Save zone'}</button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={s.root} data-testid="zone-editor-overlay">
      <svg
        ref={drawingLayerRef}
        className={s.drawingLayer}
        data-testid="zone-drawing-layer"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-label="Zone drawing area"
        onPointerDown={(event) => {
          if (saving || event.button !== 0 || rectangleDrag.current || moveDrag.current || resizeDrag.current) return;
          const start = pointForClient(event.clientX, event.clientY);
          rectangleDrag.current = { pointerId: event.pointerId, start, drawing: false };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = rectangleDrag.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const end = pointForClient(event.clientX, event.clientY);
          if (!drag.drawing && (Math.abs(end.x - drag.start.x) < MIN_ZONE_SPAN || Math.abs(end.y - drag.start.y) < MIN_ZONE_SPAN)) return;
          if (!drag.drawing) {
            drag.drawing = true;
            resetDraft();
          }
          setPoints(rectanglePoints(drag.start, end));
        }}
        onPointerUp={(event) => {
          const drag = rectangleDrag.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const end = pointForClient(event.clientX, event.clientY);
          rectangleDrag.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          const valid = Math.abs(end.x - drag.start.x) >= MIN_ZONE_SPAN && Math.abs(end.y - drag.start.y) >= MIN_ZONE_SPAN;
          if (!drag.drawing && !valid) return;
          if (!drag.drawing) resetDraft();
          setPoints(valid ? rectanglePoints(drag.start, end) : []);
          setComplete(valid);
        }}
        onPointerCancel={(event) => {
          const drag = rectangleDrag.current;
          if (drag?.pointerId !== event.pointerId) return;
          rectangleDrag.current = null;
          if (drag.drawing) resetDraft();
        }}
      >
        {zones.map((zone) => {
          const displayPoints = selectedZoneId === zone.zoneId ? points : zone.mapPolygon;
          return (
            <polygon
              key={zone.zoneId}
              points={pointsAttribute(displayPoints)}
              fill={selectedZoneId === zone.zoneId ? colorHex : zone.colorHex ?? DEFAULT_COLOR}
              stroke={selectedZoneId === zone.zoneId ? colorHex : zone.colorHex ?? DEFAULT_COLOR}
              className={`${s.zone} ${s.movable} ${selectedZoneId === zone.zoneId ? s.selected : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Edit zone ${zone.name}`}
              onPointerDown={(event) => startMove(event, zone)}
              onPointerMove={continueMove}
              onPointerUp={finishMove}
              onPointerCancel={() => { moveDrag.current = null; }}
              onClick={(event) => {
                event.stopPropagation();
                if (!saving) selectZone(zone);
              }}
              onKeyDown={(event) => {
                if (!saving && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  selectZone(zone);
                }
              }}
            />
          );
        })}
        {!selectedZoneId && points.length >= 2 && (
          <polygon
            data-testid="zone-draft"
            points={pointsAttribute(points)}
            fill={colorHex}
            stroke={colorHex}
            className={`${s.zone} ${s.draft} ${complete ? s.complete : ''}`}
          />
        )}
      </svg>

      {zones.map((zone) => {
        const displayPoints = selectedZoneId === zone.zoneId ? points : zone.mapPolygon;
        const center = centerOf(displayPoints);
        const displayColor = selectedZoneId === zone.zoneId ? colorHex : zone.colorHex ?? DEFAULT_COLOR;
        return (
          <span
            key={`label-${zone.zoneId}`}
            data-testid={`zone-label-${zone.zoneId}`}
            className={s.zoneLabel}
            style={{ left: percentage(center.x), top: percentage(center.y), backgroundColor: displayColor, color: textColorFor(displayColor) }}
          >
            {selectedZoneId === zone.zoneId ? name : zone.name}
          </span>
        );
      })}

      {points.map((point, index) => selectedZoneId ? (
        <button
          key={`resize-${selectedZoneId}-${index}`}
          type="button"
          className={s.resizeHandle}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, '--zone-color': colorHex } as CSSProperties}
          aria-label={`Resize point ${index + 1}`}
          onPointerDown={(event) => startResize(event, index)}
          onPointerMove={continueResize}
          onPointerUp={finishResize}
          onPointerCancel={() => { resizeDrag.current = null; }}
          onLostPointerCapture={() => { resizeDrag.current = null; }}
        />
      ) : (
        <span
          key={`${index}-${point.x}-${point.y}`}
          data-testid="zone-point"
          className={s.point}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, backgroundColor: colorHex }}
          aria-hidden="true"
        />
      ))}

      {typeof document !== 'undefined' && createPortal(toolbar, document.body)}
    </div>
  );
}

/** Read-only zone polygons and labels, kept on the plan while the zone editor is closed. */
export function ZoneLayer({ zones }: { zones: ZoneRecord[] }) {
  return (
    <div className={s.zoneLayer} data-testid="zone-layer" aria-hidden="true">
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
        {zones.map((zone) => {
          const color = zone.colorHex ?? DEFAULT_COLOR;
          return <polygon key={zone.zoneId} points={pointsAttribute(zone.mapPolygon)} fill={color} stroke={color} className={s.zone} />;
        })}
      </svg>
      {zones.map((zone) => {
        const center = centerOf(zone.mapPolygon);
        const color = zone.colorHex ?? DEFAULT_COLOR;
        return (
          <span
            key={`label-${zone.zoneId}`}
            className={s.zoneLabel}
            style={{ left: percentage(center.x), top: percentage(center.y), backgroundColor: color, color: textColorFor(color) }}
          >
            {zone.name}
          </span>
        );
      })}
    </div>
  );
}

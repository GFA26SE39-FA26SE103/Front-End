import type { CSSProperties, ReactNode } from 'react';
import type { CameraRecord } from '../api/cameras';
import type { ZoneRecord } from '../api/floors';
import { PdfPage } from './FloorPlanSurface';
import type { Tone } from './ui';
import s from './FloorPlanView.module.css';

export type FloorPlanViewProps = {
  mapUrl: string;
  mapContentType: string;
  zones: ZoneRecord[];
  cameras: CameraRecord[];
  zoneTone: (zone: ZoneRecord) => Tone;
  cameraTone: (camera: CameraRecord) => Tone;
  selectedCameraId?: string | null;
  highlightedZoneIds?: ReadonlySet<string>;
  onSelectCamera?: (cameraId: string) => void;
  onSelectZone?: (zoneId: string) => void;
  /** Rendered next to the selected camera, e.g. a details popup. */
  cameraPopup?: ReactNode;
  /** Minimap mode: smaller, no labels, not interactive. */
  compact?: boolean;
};

const placed = (camera: CameraRecord) => camera.mapX !== null && camera.mapY !== null;

export function FloorPlanView({
  mapUrl,
  mapContentType,
  zones,
  cameras,
  zoneTone,
  cameraTone,
  selectedCameraId = null,
  highlightedZoneIds,
  onSelectCamera,
  onSelectZone,
  cameraPopup,
  compact = false,
}: FloorPlanViewProps) {
  const selected = cameras.find((camera) => camera.cameraId === selectedCameraId && placed(camera));

  return (
    <div className={`${s.viewport} ${compact ? s.compact : ''}`}>
      <div className={s.surface} data-testid={compact ? 'floor-minimap' : 'floor-plan-view'}>
        {mapContentType === 'application/pdf'
          ? <PdfPage url={mapUrl} />
          : <img className={s.map} src={mapUrl} alt="Floor plan" draggable={false} />}

        <svg className={s.zones} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {zones.map((zone) => {
            const tone = zoneTone(zone);
            const dimmed = highlightedZoneIds && highlightedZoneIds.size > 0 && !highlightedZoneIds.has(zone.zoneId);
            return (
              <polygon
                key={zone.zoneId}
                points={zone.mapPolygon.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ')}
                className={`${s.zone} ${s[`tone-${tone}`]} ${highlightedZoneIds?.has(zone.zoneId) ? s.highlighted : ''} ${dimmed ? s.dimmed : ''} ${onSelectZone && !compact ? s.clickable : ''}`}
                onClick={onSelectZone && !compact ? () => onSelectZone(zone.zoneId) : undefined}
              />
            );
          })}
        </svg>

        {!compact && zones.map((zone) => {
          const box = bounds(zone);
          if (!box) return null;
          const tone = zoneTone(zone);
          return (
            <button
              type="button"
              key={zone.zoneId}
              className={`${s.zoneLabel} ${s[`label-${tone}`]}`}
              style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%` }}
              onClick={onSelectZone ? () => onSelectZone(zone.zoneId) : undefined}
            >
              <span className={s.dot} aria-hidden="true" />
              {zone.name}
            </button>
          );
        })}

        {cameras.filter(placed).map((camera) => {
          const tone = cameraTone(camera);
          const isSelected = camera.cameraId === selectedCameraId;
          const style = {
            left: `${(camera.mapX ?? 0) * 100}%`,
            top: `${(camera.mapY ?? 0) * 100}%`,
            '--fov-rotation': `${camera.mapRotationDeg ?? 0}deg`,
          } as CSSProperties;
          return (
            <div key={camera.cameraId} className={`${s.camera} ${s[`camera-${tone}`]} ${isSelected ? s.selected : ''}`} style={style}>
              <span className={s.fov} aria-hidden="true" />
              {compact ? (
                <span className={s.marker} aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={s.marker}
                  aria-label={`Inspect camera ${camera.code}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectCamera?.(camera.cameraId)}
                >
                  <CameraGlyph />
                </button>
              )}
            </div>
          );
        })}

        {!compact && selected && cameraPopup && (
          <div
            className={`${s.popup} ${(selected.mapX ?? 0) > 0.6 ? s.popupLeft : ''} ${(selected.mapY ?? 0) > 0.55 ? s.popupUp : ''}`}
            style={{ left: `${(selected.mapX ?? 0) * 100}%`, top: `${(selected.mapY ?? 0) * 100}%` }}
          >
            {cameraPopup}
          </div>
        )}
      </div>
    </div>
  );
}

function CameraGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2.25 6a1.5 1.5 0 0 1 1.5-1.5h1.5L6.375 3h5.25l1.125 1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="9" cy="9.375" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function bounds(zone: ZoneRecord) {
  if (zone.mapPolygon.length === 0) return null;
  return {
    x: Math.min(...zone.mapPolygon.map((p) => p.x)),
    y: Math.min(...zone.mapPolygon.map((p) => p.y)),
  };
}

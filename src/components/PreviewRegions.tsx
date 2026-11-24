import type { MapPoint } from '../api/cameras';
import s from './AnnotatedPreview.module.css';

export type PreviewRegion = {
  id: string;
  label: string;
  color: string;
  points: MapPoint[];
};

// Match the frame's pixel size so the overlay follows the letterboxed media.
export function PreviewRegions({ regions, width, height }: { regions: PreviewRegion[]; width: number; height: number }) {
  const fontSize = Math.max(12, Math.round(width * 0.016));
  return (
    <svg className={s.regions} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" data-testid="roi-overlay" aria-hidden="true">
      {regions.map((region) => {
        const anchor = region.points.reduce((top, point) => (point.y < top.y || (point.y === top.y && point.x < top.x) ? point : top));
        return (
          <g key={region.id}>
            <polygon
              className={s.region}
              points={region.points.map(({ x, y }) => `${x * width},${y * height}`).join(' ')}
              fill={region.color}
              stroke={region.color}
            />
            <text
              className={s.regionLabel}
              x={anchor.x * width + fontSize * 0.4}
              y={anchor.y * height + fontSize * 1.3}
              fontSize={fontSize}
              strokeWidth={fontSize * 0.3}
            >
              {region.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

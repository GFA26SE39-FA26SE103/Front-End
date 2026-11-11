import type { MapPoint } from '../api/floors';

export const MAX_ROI_POINTS = 1000;

/** Same bounded polygon rules as Domain Rules.Polygon; independent ROIs need not touch. */
export function validateRoiPolygon(points: MapPoint[]): string | null {
  if (points.length < 3 || points.length > MAX_ROI_POINTS) return 'A polygon requires 3 to 1000 points.';
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    return 'ROI points must be finite coordinates between 0 and 1.';
  if (new Set(points.map(p => `${p.x},${p.y}`)).size !== points.length) return 'Polygon vertices must be distinct; do not repeat the first point.';
  const cross = (a: MapPoint, b: MapPoint, c: MapPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a: MapPoint, b: MapPoint, c: MapPoint) => Math.abs(cross(a, b, c)) < 1e-14 && c.x >= Math.min(a.x, b.x) && c.x <= Math.max(a.x, b.x) && c.y >= Math.min(a.y, b.y) && c.y <= Math.max(a.y, b.y);
  const intersects = (a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) =>
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0 || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
  let area = 0;
  // At most 1000 vertices: bounded O(n²), evaluated only on close/save, never each pointer move.
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]; area += a.x * b.y - b.x * a.y;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return 'Polygon edges must not intersect.';
    }
  }
  return Math.abs(area) <= 1e-12 ? 'Polygon must have nonzero area.' : null;
}


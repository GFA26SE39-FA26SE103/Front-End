// Floor 1 plan geometry, in px of the 536 × 708 plan stage (from Figma "FloorPlan" 103:135).

export type Rect = { x: number; y: number; w: number; h: number };

export const STAGE = { w: 536, h: 708 };

export const walls: Rect = { x: 14, y: 14, w: 508, h: 636 };

export const zoneRects: Record<string, Rect> = {
  D: { x: 14, y: 14, w: 508, h: 159 },
  A: { x: 14, y: 173, w: 171.94, h: 477 },
  C: { x: 185.94, y: 173, w: 336.06, h: 339.2 },
  B: { x: 185.94, y: 512.2, w: 336.06, h: 137.8 },
};

export const zoneLabelPos: Record<string, { x: number; y: number }> = {
  D: { x: 22, y: 139.08 },
  A: { x: 22, y: 211.16 },
  C: { x: 245.94, y: 181 },
  B: { x: 193.94, y: 520.2 },
};

const shelfX = [223.06, 271.91, 320.75, 369.6, 418.45, 467.29];
const counterX = [219.15, 269.95, 320.75, 371.55, 422.35, 473.15];

export const fixtures: Rect[] = [
  ...shelfX.map((x) => ({ x, y: 215.4, w: 19.54, h: 259.7 })),
  ...counterX.map((x) => ({ x, y: 550.36, w: 29.31, h: 44.52 })),
  { x: 33.54, y: 33.08, w: 468.92, h: 25.44 }, // fresh counter
  { x: 33.54, y: 75.48, w: 23.45, h: 76.32 }, // fridge
  { x: 479.02, y: 75.48, w: 23.45, h: 76.32 }, // fridge
  { x: 141, y: 90.32, w: 107.46, h: 40.28 }, // produce island
  { x: 297.31, y: 90.32, w: 107.46, h: 40.28 }, // produce island
  { x: 56.98, y: 268.4, w: 78.15, h: 46.64 }, // promo table
  { x: 56.98, y: 363.8, w: 78.15, h: 46.64 }, // promo table
];

export const counterLabels = counterX.map((x, i) => ({ x: x + 7.82, y: 599.12, text: `C${i + 1}` }));

export const blindSpot: Rect = { x: 469.25, y: 215.4, w: 23.45, h: 259.7 };

export type CameraPlacement = {
  marker: { x: number; y: number };
  label: { x: number; y: number };
  fov: Rect & { asset: string };
};

export const cameraPlacements: Record<string, CameraPlacement> = {
  'CAM-01': { marker: { x: 14.72, y: 626.28 }, label: { x: 37.72, y: 607.28 }, fov: { x: 25.72, y: 459.82, w: 143.83, h: 177.46, asset: 'fov-cam01' } },
  'CAM-02': { marker: { x: 14.72, y: 172.6 }, label: { x: 37.72, y: 191.6 }, fov: { x: 25.72, y: 183.6, w: 143.83, h: 177.46, asset: 'fov-cam02' } },
  'CAM-03': { marker: { x: 499.28, y: 628.4 }, label: { x: 452.28, y: 609.4 }, fov: { x: 326.05, y: 518.19, w: 184.23, h: 145.75, asset: 'fov-cam03' } },
  'CAM-04': { marker: { x: 182.75, y: 509.68 }, label: { x: 205.75, y: 528.68 }, fov: { x: 193.75, y: 435.88, w: 153.93, h: 114.25, asset: 'fov-cam04' } },
  'CAM-05': { marker: { x: 499.28, y: 511.8 }, label: { x: 452.28, y: 530.8 }, fov: { x: 364.3, y: 508.94, w: 145.98, h: 105.06, asset: 'fov-cam05' } },
  'CAM-06': { marker: { x: 182.75, y: 172.6 }, label: { x: 205.75, y: 153.6 }, fov: { x: 193.75, y: 183.6, w: 149.67, h: 208.78, asset: 'fov-cam06' } },
  'CAM-07': { marker: { x: 499.28, y: 172.6 }, label: { x: 452.28, y: 153.6 }, fov: { x: 372.12, y: 183.6, w: 138.16, h: 211.19, asset: 'fov-cam07' } },
  'CAM-08': { marker: { x: 339.06, y: 172.6 }, label: { x: 362.06, y: 153.6 }, fov: { x: 295.72, y: 183.6, w: 108.68, h: 181.46, asset: 'fov-cam08' } },
  'CAM-09': { marker: { x: 257, y: 153.52 }, label: { x: 280, y: 134.52 }, fov: { x: 198.93, y: 75.2, w: 138.15, h: 89.32, asset: 'fov-cam09' } },
};

// Outline-marker icon per zone colour (from Figma); selected-zone cameras use the white icon on a filled marker.
export const markerIcon: Record<string, string> = {
  A: 'cam-marker-success',
  B: 'camera-row-active',
  C: 'cam-marker-warning',
  D: 'cam-marker-purple',
};

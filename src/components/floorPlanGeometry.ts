export type NormalizedPosition = { x: number; y: number };

const requirePositiveDimensions = (width: number, height: number) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Floor-plan surface dimensions must be positive.');
  }
};

export function clampNormalized(position: NormalizedPosition): NormalizedPosition {
  return {
    x: Math.min(1, Math.max(0, position.x)),
    y: Math.min(1, Math.max(0, position.y)),
  };
}

export function clientToNormalized(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): NormalizedPosition {
  requirePositiveDimensions(rect.width, rect.height);
  return clampNormalized({
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  });
}

export function normalizedToPixels(
  position: NormalizedPosition,
  width: number,
  height: number,
): { left: number; top: number } {
  requirePositiveDimensions(width, height);
  const clamped = clampNormalized(position);
  return { left: clamped.x * width, top: clamped.y * height };
}

export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new Error('Camera rotation must be finite.');
  return ((degrees % 360) + 360) % 360;
}

import { describe, expect, it } from 'vitest';
import {
  clampNormalized,
  clientToNormalized,
  normalizeRotation,
  normalizedToPixels,
} from './floorPlanGeometry';

const rect = {
  left: 100,
  top: 50,
  width: 800,
  height: 400,
} as DOMRect;

describe('floor-plan geometry', () => {
  it('converts client coordinates to normalized map coordinates', () => {
    expect(clientToNormalized(rect, 500, 250)).toEqual({ x: 0.5, y: 0.5 });
    expect(clientToNormalized(rect, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(clientToNormalized(rect, 900, 450)).toEqual({ x: 1, y: 1 });
  });

  it('clamps positions outside the map', () => {
    expect(clientToNormalized(rect, 0, 900)).toEqual({ x: 0, y: 1 });
    expect(clampNormalized({ x: 1.25, y: -0.2 })).toEqual({ x: 1, y: 0 });
  });

  it('rejects a surface without measurable dimensions', () => {
    expect(() => clientToNormalized({ ...rect, width: 0 } as DOMRect, 100, 50)).toThrow(/dimensions/i);
    expect(() => normalizedToPixels({ x: 0.5, y: 0.5 }, 0, 100)).toThrow(/dimensions/i);
  });

  it('converts normalized coordinates back to pixels', () => {
    expect(normalizedToPixels({ x: 0.25, y: 0.75 }, 800, 400)).toEqual({ left: 200, top: 300 });
  });

  it('normalizes rotation into the half-open 0 to 360 range', () => {
    expect(normalizeRotation(-45)).toBe(315);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(765)).toBe(45);
  });
});

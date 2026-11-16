import { describe, expect, it } from 'vitest';
import { measurementMode } from './monitoringRuleMode';

describe('monitoring measurement mode', () => {
  it('keeps the people-count rule and recognizes the density unit', () => {
    expect(measurementMode({ incidentCode: 'OVERCROWDING_CONGESTION', thresholdUnit: 'PEOPLE', parametersJson: null })).toBe('PEOPLE_COUNT');
    expect(measurementMode({ incidentCode: 'CONGESTION', thresholdUnit: 'PEOPLE_PER_M2', parametersJson: null })).toBe('CROWD_DENSITY');
  });

  it('keeps long queue as the dwell-qualified queue count', () => {
    expect(measurementMode({ incidentCode: 'LONG_QUEUE', thresholdUnit: 'PEOPLE', parametersJson: null })).toBe('QUEUE_LENGTH');
  });
});

import { describe, expect, it } from 'vitest';
import type { MonitoringRule } from '../api/monitoring';
import { convertToPeopleCount, measurementMode } from './monitoringRuleMode';

const density: MonitoringRule = { incidentTypeId: 'crowd', incidentCode: 'OVERCROWDING_CONGESTION', warningThreshold: 2, criticalThreshold: 3, thresholdUnit: 'PEOPLE_PER_M2', sustainSec: 1, cooldownSec: 300, enabled: true, parametersJson: '{"custom":7}' };
describe('explicit temporary people count mode', () => {
  it('does not convert a stored density rule or reuse its thresholds implicitly', () => {
    expect(measurementMode(density)).toBe('CROWD_DENSITY');
    const converted = convertToPeopleCount(density, '1', '2');
    expect(converted.thresholdUnit).toBe('PEOPLE');
    expect(converted.warningThreshold).toBe(1);
    expect(converted.criticalThreshold).toBe(2);
    expect(JSON.parse(converted.parametersJson!)).toEqual({ custom: 7, measurementMode: 'PEOPLE_COUNT' });
    expect(density.thresholdUnit).toBe('PEOPLE_PER_M2');
    expect(density.warningThreshold).toBe(2);
    expect(measurementMode(converted)).toBe('PEOPLE_COUNT');
    expect(measurementMode({ ...density, thresholdUnit: 'PEOPLE' })).toBe('UNSUPPORTED');
  });
  it('rejects malformed/object-incompatible parameters instead of losing custom data', () => {
    for (const parametersJson of ['[]', '[1]', 'false', 'null', '{bad']) {
      expect(() => convertToPeopleCount({ ...density, parametersJson }, '1', '2')).toThrow(/parameters/i);
    }
  });
  it('requires new valid integer counts and warning below critical', () => {
    for (const values of [['', '2'], ['1.5', '2'], ['2', '1'], ['-1', '2'], ['NaN', '2']]) {
      expect(() => convertToPeopleCount(density, values[0], values[1])).toThrow();
    }
    expect(measurementMode({ ...density, incidentCode: 'LONG_QUEUE', thresholdUnit: 'PEOPLE' })).toBe('QUEUE_LENGTH');
  });
});

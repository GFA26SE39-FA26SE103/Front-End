import type { MonitoringRule } from '../api/monitoring';

type ModeRule = Pick<MonitoringRule, 'incidentCode' | 'thresholdUnit' | 'parametersJson'>;
export function measurementMode(rule: ModeRule): 'PEOPLE_COUNT' | 'QUEUE_LENGTH' | 'CROWD_DENSITY' | 'UNSUPPORTED' {
  if (rule.incidentCode === 'LONG_QUEUE' && rule.thresholdUnit === 'PEOPLE') return 'QUEUE_LENGTH';
  if (rule.incidentCode !== 'OVERCROWDING_CONGESTION' && rule.incidentCode !== 'CONGESTION') return 'UNSUPPORTED';
  if (rule.thresholdUnit === 'PEOPLE_PER_M2') return 'CROWD_DENSITY';
  return rule.thresholdUnit === 'PEOPLE' ? 'PEOPLE_COUNT' : 'UNSUPPORTED';
}

export const modeLabel = (mode: ReturnType<typeof measurementMode>) => ({
  PEOPLE_COUNT: 'People currently in ROI', QUEUE_LENGTH: 'Queue length (5s continuous dwell)',
  CROWD_DENSITY: 'Crowd density', UNSUPPORTED: 'Runtime unsupported',
})[mode];

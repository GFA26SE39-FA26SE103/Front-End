import type { MonitoringRule } from '../api/monitoring';

type ModeRule = Pick<MonitoringRule, 'incidentCode' | 'thresholdUnit' | 'parametersJson'>;
export function measurementMode(rule: ModeRule): 'PEOPLE_COUNT' | 'QUEUE_LENGTH' | 'CROWD_DENSITY' | 'WAITING_TIME' | 'CHECKOUT_CAPACITY' | 'UNSUPPORTED' {
  if (rule.incidentCode === 'LONG_QUEUE' && rule.thresholdUnit === 'PEOPLE') return 'QUEUE_LENGTH';
  if ((rule.incidentCode === 'EXCESSIVE_WAIT' || rule.incidentCode === 'EXCESSIVE_WAITING_TIME') && rule.thresholdUnit === 'MINUTES') return 'WAITING_TIME';
  if ((rule.incidentCode === 'CHECKOUT_CAPACITY' || rule.incidentCode === 'CHECKOUT_CAPACITY_ISSUE') && rule.thresholdUnit === 'PEOPLE_PER_STAFFED_COUNTER') return 'CHECKOUT_CAPACITY';
  if (rule.incidentCode !== 'OVERCROWDING_CONGESTION' && rule.incidentCode !== 'CONGESTION') return 'UNSUPPORTED';
  if (rule.thresholdUnit === 'PEOPLE_PER_M2') return 'CROWD_DENSITY';
  return rule.thresholdUnit === 'PEOPLE' ? 'PEOPLE_COUNT' : 'UNSUPPORTED';
}

export const modeLabel = (mode: ReturnType<typeof measurementMode>) => ({
  PEOPLE_COUNT: 'Legacy people count', QUEUE_LENGTH: 'Queue length (5s continuous dwell)',
  CROWD_DENSITY: 'Crowd density', WAITING_TIME: 'Longest checkout wait',
  CHECKOUT_CAPACITY: 'Queue per staffed counter', UNSUPPORTED: 'Runtime unsupported',
})[mode];

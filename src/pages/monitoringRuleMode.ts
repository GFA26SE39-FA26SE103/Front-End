import type { MonitoringRule } from '../api/monitoring';

type ModeRule = Pick<MonitoringRule, 'eventCode' | 'thresholdUnit' | 'parametersJson'>;
export function measurementMode(rule: ModeRule): 'PEOPLE_COUNT' | 'QUEUE_LENGTH' | 'CROWD_DENSITY' | 'WAITING_TIME' | 'CHECKOUT_CAPACITY' | 'UNSUPPORTED' {
  if (rule.eventCode === 'LONG_QUEUE' && rule.thresholdUnit === 'PEOPLE') return 'QUEUE_LENGTH';
  if (rule.eventCode === 'EXCESSIVE_WAIT' && rule.thresholdUnit === 'MINUTES') return 'WAITING_TIME';
  if (rule.eventCode === 'CHECKOUT_CAPACITY' && rule.thresholdUnit === 'PEOPLE_PER_STAFFED_COUNTER') return 'CHECKOUT_CAPACITY';
  if (rule.eventCode !== 'CONGESTION') return 'UNSUPPORTED';
  if (rule.thresholdUnit === 'PEOPLE_PER_M2') return 'CROWD_DENSITY';
  return rule.thresholdUnit === 'PEOPLE' ? 'PEOPLE_COUNT' : 'UNSUPPORTED';
}

export const modeLabel = (mode: ReturnType<typeof measurementMode>) => ({
  PEOPLE_COUNT: 'People count', QUEUE_LENGTH: 'People in checkout lanes',
  CROWD_DENSITY: 'Crowd density', WAITING_TIME: 'Longest checkout wait',
  CHECKOUT_CAPACITY: 'Queue per staffed counter', UNSUPPORTED: 'Runtime unsupported',
})[mode];

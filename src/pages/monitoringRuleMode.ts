import type { MonitoringRule } from '../api/monitoring';

type ModeRule = Pick<MonitoringRule, 'incidentCode' | 'thresholdUnit' | 'parametersJson'>;
export function measurementMode(rule: ModeRule): 'PEOPLE_COUNT' | 'CROWD_DENSITY' | 'QUEUE_LENGTH' | 'UNSUPPORTED' {
  if (rule.incidentCode === 'LONG_QUEUE' && rule.thresholdUnit === 'PEOPLE') return 'QUEUE_LENGTH';
  if (rule.incidentCode !== 'OVERCROWDING_CONGESTION') return 'UNSUPPORTED';
  if (rule.thresholdUnit === 'PEOPLE_PER_M2') return 'CROWD_DENSITY';
  try {
    const parameters = JSON.parse(rule.parametersJson ?? '{}');
    if (rule.thresholdUnit === 'PEOPLE' && parameters && !Array.isArray(parameters) && parameters.measurementMode === 'PEOPLE_COUNT') return 'PEOPLE_COUNT';
  } catch { /* Invalid parameters never imply a measurement mode. */ }
  return 'UNSUPPORTED';
}

export function convertToPeopleCount(rule: MonitoringRule, warning: string, critical: string): MonitoringRule {
  if (rule.incidentCode !== 'OVERCROWDING_CONGESTION') throw new Error('Only overcrowding supports temporary people count.');
  const count = (text: string) => {
    if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(Number(text)) || Number(text) > 99999999999999) throw new Error('Enter new whole-number people counts.');
    return Number(text);
  };
  const warningThreshold = count(warning), criticalThreshold = count(critical);
  if (warningThreshold >= criticalThreshold) throw new Error('People count: warning must be less than critical.');
  let parameters: unknown;
  try { parameters = JSON.parse(rule.parametersJson ?? '{}'); }
  catch { throw new Error('Cannot convert invalid parameters JSON. Resolve the saved parameters first.'); }
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('Cannot convert non-object parameters. Existing parameters have not been changed.');
  return { ...rule, warningThreshold, criticalThreshold, thresholdUnit: 'PEOPLE', parametersJson: JSON.stringify({ ...parameters, measurementMode: 'PEOPLE_COUNT' }) };
}

export const modeLabel = (mode: ReturnType<typeof measurementMode>) => ({ PEOPLE_COUNT: 'People count in ROI (temporary)', CROWD_DENSITY: 'Density (people/m²) — runtime deferred', QUEUE_LENGTH: 'Queue length (5s continuous dwell)', UNSUPPORTED: 'Runtime unsupported' })[mode];

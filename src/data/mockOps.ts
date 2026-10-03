// Sample configuration and monitoring data copied from the Figma screens.
// Default values follow the Business Rules document (v0.7) — all are editable, none are hardcoded rules.

export type AiRule = {
  id: string;
  name: string;
  description: string;
  icon: string;
  warning: string;
  critical: string;
  appliesTo: string;
  enabled: boolean;
};

export const defaultAiRules: AiRule[] = [
  { id: 'queue', name: 'Long queue', description: 'People waiting per open counter', icon: 'rule-users', warning: '3 people', critical: '5 people', appliesTo: 'Checkout zones', enabled: true },
  { id: 'wait', name: 'Excessive waiting time', description: 'Estimated wait per customer', icon: 'rule-clock', warning: '4 min', critical: '8 min', appliesTo: 'Checkout zones', enabled: true },
  { id: 'crowd', name: 'Overcrowding / congestion', description: 'People density in a zone', icon: 'rule-layers', warning: '2 / m²', critical: '3 / m²', appliesTo: 'All zones', enabled: true },
  { id: 'capacity', name: 'Checkout capacity issue', description: 'Most open counters queued while a counter is closed', icon: 'rule-scale', warning: '≥ 50% counters', critical: 'All counters', appliesTo: 'Checkout zones', enabled: true },
];

export type Setting = { id: string; label: string; value: number; unit: string; suffix?: string };

export const defaultDetection: Setting[] = [
  { id: 'sustain', label: 'Sustain above threshold before alert', value: 30, unit: 's' },
  { id: 'cooldown', label: 'Cooldown after an incident closes', value: 5, unit: 'min' },
  { id: 'open', label: 'Open incidents per type per zone', value: 1, unit: '', suffix: '(update)' },
  { id: 'autoclose', label: 'Suggest auto-close when back to normal', value: 2, unit: 'min' },
];

export const defaultHealth: Setting[] = [
  { id: 'offline', label: 'Camera offline after no stream for', value: 30, unit: 's' },
  { id: 'latency', label: 'Stream degraded when latency >', value: 3, unit: 's' },
  { id: 'fps', label: 'Stream degraded when FPS <', value: 8, unit: 'fps' },
  { id: 'heartbeat', label: 'AI service down after no heartbeat', value: 60, unit: 's' },
];

export type ZoneOverride = { zone: string; rule: string; warning: string; critical: string };

export const defaultOverrides: ZoneOverride[] = [
  { zone: 'Zone B · Checkout', rule: 'Long queue', warning: '4 people', critical: '6 people' },
];

export const defaultRouting = {
  low: 50,
  high: 80,
  renotifySec: 60,
  maxAttempts: 3,
  vibration: 'Long × 3',
  escalateTo: 'Operator on duty',
  toggles: {
    adjacent: true,
    managerCritical: true,
    operatorCritical: true,
    reviewTimeout: true,
    withdraw: true,
  },
};

export type Tone = 'success' | 'warning' | 'danger';

export type Service = { name: string; detail: string; metric: string; status: 'HEALTHY' | 'DEGRADED' | 'DOWN' };

export const services: Service[] = [
  { name: 'Camera ingestion', detail: 'Configured cameras', metric: '', status: 'DEGRADED' },
  { name: 'AI inference', detail: 'Queue and hazard models', metric: '142 ms · 97.8% success', status: 'HEALTHY' },
  { name: 'Dispatch engine', detail: 'Eligibility and broadcast', metric: '99.99% uptime', status: 'HEALTHY' },
  { name: 'Notification service', detail: 'Push and in-app delivery', metric: '4.2% delivery failures', status: 'DEGRADED' },
  { name: 'Mobile sync', detail: 'Evidence and task state', metric: '12 queued · retrying', status: 'HEALTHY' },
  { name: 'Evidence storage', detail: 'Object storage and retention', metric: '42% capacity used', status: 'HEALTHY' },
  { name: 'Audit pipeline', detail: 'Immutable event stream', metric: '0 events dropped', status: 'HEALTHY' },
];

export const perfCharts = [
  { label: 'AI LATENCY', value: '142', unit: 'ms', tone: 'success', bars: [40, 52, 46, 59, 65, 70, 63, 68, 78] },
  { label: 'DISPATCH LATENCY', value: '1.8', unit: 'sec', tone: 'primary', bars: [37, 46, 54, 43, 63, 57, 71, 78, 73] },
  { label: 'DELIVERY FAILURES', value: '4.2', unit: '%', tone: 'warning', bars: [15, 18, 22, 20, 34, 52, 66, 78, 60] },
] as const;

export const pipeline = [
  { step: 'Camera stream', ok: false },
  { step: 'AI detection', ok: true },
  { step: 'Incident creation', ok: true },
  { step: 'Staff dispatch', ok: true },
  { step: 'Notification delivery', ok: false },
  { step: 'Evidence storage', ok: true },
];

export type AuditEvent = {
  id: string;
  time: string;
  date: string;
  title: string;
  target: string;
  actor: string;
  actorId: string;
  result: 'SUCCESS' | 'WARNING' | 'FAILED';
  source: string;
  ip: string;
  type: 'Incident' | 'Task' | 'Configuration' | 'Security';
  summary: string;
  change?: { field: string; from: string; to: string; note: string };
};

export const auditEvents: AuditEvent[] = [
  { id: 'EV-1', time: '12:54:02', date: '26 Sep 2026', title: 'Incident closed', target: 'INC-1042 · Evidence verified', actor: 'Operator Linh', actorId: 'OP-009', result: 'SUCCESS', source: 'Web console', ip: '10.10.2.18', type: 'Incident', summary: 'Operator verified the submitted evidence and closed INC-1042.', change: { field: 'status', from: 'IN REVIEW', to: 'CLOSED', note: 'Evidence set EV-2281 verified' } },
  { id: 'EV-2', time: '12:53:18', date: '26 Sep 2026', title: 'Rework requested', target: 'TASK-2281 · Evidence review', actor: 'Operator Linh', actorId: 'OP-009', result: 'SUCCESS', source: 'Web console', ip: '10.10.2.18', type: 'Task', summary: 'Operator asked the staff member to redo the task with a clearer photo.', change: { field: 'status', from: 'SUBMITTED', to: 'IN PROGRESS', note: 'Rework 1 of 2' } },
  { id: 'EV-3', time: '12:44:16', date: '26 Sep 2026', title: 'Escalation exhausted', target: 'INC-1042 · SLA breached', actor: 'System', actorId: 'SYS', result: 'WARNING', source: 'Dispatch engine', ip: '—', type: 'Incident', summary: 'No staff accepted after the maximum notify attempts; the Operator was alerted.' },
  { id: 'EV-4', time: '12:41:32', date: '26 Sep 2026', title: 'Auto-assignment paused', target: 'INC-1042 · No eligible staff', actor: 'System', actorId: 'SYS', result: 'WARNING', source: 'Dispatch engine', ip: '—', type: 'Incident', summary: 'No checked-in staff in the zone; adjacent zones were notified.' },
  { id: 'EV-5', time: '12:41:29', date: '26 Sep 2026', title: 'Task accepted', target: 'TASK-2281 · First responder', actor: 'An Khương', actorId: 'ST-014', result: 'SUCCESS', source: 'Mobile app', ip: '10.10.5.40', type: 'Task', summary: 'Staff accepted the task first; alerts to other staff were withdrawn.' },
  { id: 'EV-6', time: '12:40:11', date: '26 Sep 2026', title: 'Routing rule updated', target: 'Zone B · Dispatch policy', actor: 'Admin Thu', actorId: 'AD-002', result: 'SUCCESS', source: 'Admin console', ip: '10.10.2.4', type: 'Configuration', summary: 'Re-notify interval changed for Zone B.', change: { field: 'renotify_after', from: '90 s', to: '60 s', note: 'Reason: peak-hour checkout' } },
  { id: 'EV-7', time: '12:35:42', date: '26 Sep 2026', title: 'Evidence upload retry', target: 'TASK-2279 · Video pending', actor: 'System', actorId: 'SYS', result: 'FAILED', source: 'Mobile sync', ip: '—', type: 'Task', summary: 'Evidence upload failed on a weak connection and is queued for retry.' },
  { id: 'EV-8', time: '12:21:03', date: '26 Sep 2026', title: 'User role changed', target: 'user@store.vn · Staff → Operator', actor: 'Admin Thu', actorId: 'AD-002', result: 'SUCCESS', source: 'Admin console', ip: '10.10.2.4', type: 'Security', summary: 'Role changed by the Administrator.', change: { field: 'role', from: 'STAFF', to: 'OPERATOR', note: 'Approved by store manager' } },
];

export const setupSteps = [
  'Floor & floor plan',
  'Floors & zones',
  'Cameras',
  'Place & calibrate',
  'AI & incident rules',
  'Routing & users',
  'Activate monitoring',
] as const;

// Sample data copied from the Figma screens. Replace with API calls when the backend is ready.

export type CameraStatus = 'Online' | 'Degraded' | 'Offline';

export type Camera = {
  code: string;
  floor: 'F1' | 'F2';
  zones: string[]; // a camera may cover several zones on its floor (BR-01, N:M)
  status: CameraStatus;
  installed: string;
  warrantyUntil: string;
  warrantyNote?: string;
  lastMaintenance: string;
  model: string;
  serial: string;
  stream: string;
  installer: string;
  nextCheck: string;
  view: string; // shown in the camera detail header
  note: string; // shown in the zone's camera list
};

const base = { model: 'Dome IP · 4MP · IR 30 m', installer: 'An Phát Security' };

export const cameras: Camera[] = [
  { ...base, code: 'CAM-01', floor: 'F1', zones: ['A'], status: 'Online', installed: '12/08/2026', warrantyUntil: '12/08/2028', lastMaintenance: '02/09/2026', serial: 'DS4M-2308-11871', stream: 'rtsp://10.0.1.21/main · H.265', nextCheck: '02/12/2026', view: 'entrance door', note: 'Door and trolley bay' },
  { ...base, code: 'CAM-02', floor: 'F1', zones: ['A'], status: 'Online', installed: '12/08/2026', warrantyUntil: '12/08/2028', lastMaintenance: '02/09/2026', serial: 'DS4M-2308-11872', stream: 'rtsp://10.0.1.22/main · H.265', nextCheck: '02/12/2026', view: 'promo tables', note: 'Promo tables' },
  { ...base, code: 'CAM-03', floor: 'F1', zones: ['B'], status: 'Online', installed: '12/08/2026', warrantyUntil: '12/08/2028', lastMaintenance: '02/09/2026 · lens cleaned', serial: 'DS4M-2308-11873', stream: 'rtsp://10.0.1.23/main · H.265', nextCheck: '02/12/2026', view: 'main view', note: 'Main view · counters 1–3' },
  { ...base, code: 'CAM-04', floor: 'F1', zones: ['B', 'C'], status: 'Online', installed: '20/09/2026', warrantyUntil: '20/09/2028', lastMaintenance: '—', serial: 'DS4M-2309-12004', stream: 'rtsp://10.0.1.24/main · H.265', nextCheck: '20/12/2026', view: 'counters and aisle end', note: 'aisle end' },
  { ...base, code: 'CAM-05', floor: 'F1', zones: ['B'], status: 'Degraded', installed: '15/10/2024', warrantyUntil: '15/10/2026', warrantyNote: '20 d left', lastMaintenance: '11/06/2026', serial: 'DS4M-2410-08812', stream: 'rtsp://10.0.1.25/main · H.265', nextCheck: '11/09/2026', view: 'counters 4–6', note: 'Counters 4–6' },
  { ...base, code: 'CAM-06', floor: 'F1', zones: ['C'], status: 'Online', installed: '12/08/2026', warrantyUntil: '12/08/2028', lastMaintenance: '02/09/2026', serial: 'DS4M-2308-11876', stream: 'rtsp://10.0.1.26/main · H.265', nextCheck: '02/12/2026', view: 'aisles 1–2', note: 'Aisles 1–2' },
  { ...base, code: 'CAM-07', floor: 'F1', zones: ['C'], status: 'Offline', installed: '03/03/2025', warrantyUntil: '03/03/2027', lastMaintenance: '18/07/2026', serial: 'DS4M-2503-09931', stream: 'rtsp://10.0.1.27/main · H.265', nextCheck: '18/10/2026', view: 'aisles 5–6', note: 'Aisles 5–6' },
  { ...base, code: 'CAM-08', floor: 'F1', zones: ['C'], status: 'Online', installed: '12/08/2026', warrantyUntil: '12/08/2028', lastMaintenance: '02/09/2026', serial: 'DS4M-2308-11878', stream: 'rtsp://10.0.1.28/main · H.265', nextCheck: '02/12/2026', view: 'aisles 3–4', note: 'Aisles 3–4' },
  { ...base, code: 'CAM-09', floor: 'F1', zones: ['D'], status: 'Online', installed: '12/08/2026', warrantyUntil: '12/08/2028', lastMaintenance: '02/09/2026', serial: 'DS4M-2308-11879', stream: 'rtsp://10.0.1.29/main · H.265', nextCheck: '02/12/2026', view: 'fresh counter', note: 'Fresh counter' },
  { ...base, code: 'CAM-10', floor: 'F2', zones: ['E'], status: 'Online', installed: '01/09/2026', warrantyUntil: '01/09/2028', lastMaintenance: '—', serial: 'DS4M-2309-12010', stream: 'rtsp://10.0.2.10/main · H.265', nextCheck: '01/12/2026', view: 'household aisle', note: 'Household aisle' },
  { ...base, code: 'CAM-11', floor: 'F2', zones: ['F'], status: 'Online', installed: '01/09/2026', warrantyUntil: '01/09/2028', lastMaintenance: '—', serial: 'DS4M-2309-12011', stream: 'rtsp://10.0.2.11/main · H.265', nextCheck: '01/12/2026', view: 'electronics counter', note: 'Electronics counter' },
];

export type ZoneType = 'Entrance' | 'Checkout area' | 'Aisles' | 'Fresh food' | 'Household' | 'Electronics';

export type Zone = {
  id: string;
  name: string;
  floor: 'F1' | 'F2';
  type: ZoneType;
  pin: string; // icon colour variant from Figma
  dot: string;
  tone: 'success' | 'primary' | 'warning' | 'purple';
  minStaff: number;
  recordingNotice: boolean;
};

export const zones: Zone[] = [
  { id: 'A', name: 'Entrance', floor: 'F1', type: 'Entrance', pin: 'pin-zone-a', dot: 'dot-zone-a', tone: 'success', minStaff: 1, recordingNotice: true },
  { id: 'B', name: 'Checkout', floor: 'F1', type: 'Checkout area', pin: 'pin-zone-b', dot: 'dot-zone-b', tone: 'primary', minStaff: 1, recordingNotice: true },
  { id: 'C', name: 'Aisles', floor: 'F1', type: 'Aisles', pin: 'pin-zone-c', dot: 'dot-zone-c', tone: 'warning', minStaff: 1, recordingNotice: true },
  { id: 'D', name: 'Fresh food', floor: 'F1', type: 'Fresh food', pin: 'pin-zone-d', dot: 'dot-purple', tone: 'purple', minStaff: 1, recordingNotice: true },
  { id: 'E', name: 'Household', floor: 'F2', type: 'Household', pin: 'pin-zone-a', dot: 'dot-zone-a', tone: 'success', minStaff: 1, recordingNotice: true },
  { id: 'F', name: 'Electronics', floor: 'F2', type: 'Electronics', pin: 'pin-zone-c', dot: 'dot-zone-c', tone: 'warning', minStaff: 1, recordingNotice: true },
  { id: 'G', name: 'Home & garden', floor: 'F2', type: 'Household', pin: 'pin-zone-d', dot: 'dot-purple', tone: 'purple', minStaff: 1, recordingNotice: false },
];

export const floors = [
  { id: 'F1', name: 'Floor 1 — Ground', short: 'Floor 1' },
  { id: 'F2', name: 'Floor 2 — Upper', short: 'Floor 2' },
] as const;

export const zoneLabel = (z: Zone) => `Zone ${z.id} · ${z.name}`;

export type IncidentType = {
  id: string;
  name: string;
  source: 'AI' | 'STAFF';
  basedOn: string;
  thresholds: string;
  enabled: boolean;
};

export const incidentTypes: IncidentType[] = [
  { id: 'queue', name: 'Long queue', source: 'AI', basedOn: 'Queue length', thresholds: '3 / 5 people per counter', enabled: true },
  { id: 'wait', name: 'Excessive waiting time', source: 'AI', basedOn: 'Waiting time', thresholds: '4 / 8 min', enabled: true },
  { id: 'crowd', name: 'Overcrowding / congestion', source: 'AI', basedOn: 'Crowd density', thresholds: '2 / 3 per m²', enabled: true },
  { id: 'capacity', name: 'Checkout capacity issue', source: 'AI', basedOn: 'Checkout utilisation', thresholds: '≥ 50% / all counters', enabled: true },
  { id: 'spill', name: 'Spill / broken equipment', source: 'STAFF', basedOn: 'Staff report', thresholds: 'Staff sets', enabled: true },
  { id: 'equipment', name: 'Equipment malfunction', source: 'STAFF', basedOn: 'Staff report', thresholds: 'Staff sets', enabled: true },
  { id: 'pathway', name: 'Pathway obstruction', source: 'STAFF', basedOn: 'Staff report', thresholds: 'Staff sets', enabled: true },
  { id: 'clean', name: 'Cleanliness issue', source: 'STAFF', basedOn: 'Staff report', thresholds: 'Staff sets', enabled: true },
  { id: 'safety', name: 'Safety hazard', source: 'STAFF', basedOn: 'Staff report', thresholds: 'Staff sets', enabled: true },
  { id: 'other', name: 'Other operational issue', source: 'STAFF', basedOn: 'Staff report', thresholds: 'Staff sets', enabled: true },
];

export const measurements = [
  'People count (per zone)',
  'Zone entry / exit',
  'Queue length',
  'Waiting time',
  'Crowd density',
  'Checkout utilisation',
] as const;

export type Role = 'Administrator' | 'Manager' | 'Operator' | 'Staff';

export type User = { name: string; email: string; role: Role; status: 'Active' | 'Invited' };

export const users: User[] = [
  { name: 'Huỳnh An Khương', email: 'huynhankhuong@…', role: 'Administrator', status: 'Active' },
  { name: 'Nguyễn Quốc Huy', email: 'sasukevsmatadi@…', role: 'Manager', status: 'Active' },
  { name: 'Hoàng Lê Thành Đức', email: 'fptuduchoang@…', role: 'Operator', status: 'Active' },
  { name: 'Đặng Nguyễn Phước Lộc', email: 'dangnguyenloc@…', role: 'Staff', status: 'Active' },
  { name: 'Trần Thị Bình', email: 'tranthibinh@…', role: 'Staff', status: 'Invited' },
];

export const permissions = [
  'View live cameras',
  'Manage incidents',
  'Assign & reassign tasks',
  'Verify completion evidence',
  'Manage cameras & zones',
  'Configure AI parameters',
  'Manage users & roles',
  'Export reports',
] as const;

export const defaultPermissions: Record<Role, string[]> = {
  Administrator: ['Manage cameras & zones', 'Configure AI parameters', 'Manage users & roles'],
  Manager: ['View live cameras', 'Manage incidents', 'Export reports'],
  Operator: ['View live cameras', 'Manage incidents', 'Assign & reassign tasks', 'Verify completion evidence'],
  Staff: [],
};

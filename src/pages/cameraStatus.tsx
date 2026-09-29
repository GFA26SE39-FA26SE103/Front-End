import { Chip } from '../components/ui';
import type { CameraStatus } from '../data/mock';

const map = {
  Online: { tone: 'success', dot: 'dot-success' },
  Degraded: { tone: 'warning', dot: 'dot-warning' },
  Offline: { tone: 'danger', dot: 'dot-danger' },
} as const;

export function statusChip(status: CameraStatus) {
  const m = map[status];
  return <Chip tone={m.tone} dot={m.dot}>{status}</Chip>;
}

import { Chip } from '../components/ui';
import type { Tone } from '../components/ui';

export type CameraDisplayStatus = 'Online' | 'Offline' | 'Not checked' | 'Inactive';

const map: Record<CameraDisplayStatus, { tone: Tone; dot?: string }> = {
  Online: { tone: 'success', dot: 'dot-success' },
  Offline: { tone: 'danger', dot: 'dot-danger' },
  'Not checked': { tone: 'neutral' },
  Inactive: { tone: 'neutral' },
};

export function statusChip(status: CameraDisplayStatus) {
  const m = map[status];
  return <Chip tone={m.tone} dot={m.dot}>{status}</Chip>;
}

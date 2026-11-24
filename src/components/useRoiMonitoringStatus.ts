import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getMonitoring } from '../api/monitoring';

type Status = 'editable' | 'active' | 'unavailable';

export function useRoiMonitoringStatus(zoneIds: string[]) {
  const key = JSON.stringify([...new Set(zoneIds.filter(Boolean))].sort());
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; revision: number; statuses: Map<string, Status> }>();

  useEffect(() => {
    const ids: string[] = JSON.parse(key);
    if (!ids.length) return;
    const controller = new AbortController();
    void Promise.all(ids.map(async (id): Promise<[string, Status]> => {
      try {
        const config = await getMonitoring(id, controller.signal);
        return [id, config.status === 'ACTIVE' ? 'active' : 'editable'];
      } catch (error) {
        return [id, error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND' ? 'editable' : 'unavailable'];
      }
    })).then(entries => {
      if (!controller.signal.aborted) setResult({ key, revision, statuses: new Map(entries) });
    });
    const reload = () => setRevision(value => value + 1);
    window.addEventListener('focus', reload);
    return () => { controller.abort(); window.removeEventListener('focus', reload); };
  }, [key, revision]);

  const current = result?.key === key && result.revision === revision ? result.statuses : undefined;
  return {
    status: (zoneId: string) => current?.get(zoneId) ?? 'checking',
    reload: () => setRevision(value => value + 1),
  };
}

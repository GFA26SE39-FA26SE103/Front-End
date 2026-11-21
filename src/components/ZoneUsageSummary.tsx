import { useEffect, useState } from 'react';
import { getZoneUsage, type ZoneUsage } from '../api/floors';
import s from './ZoneEditorOverlay.module.css';

export function ZoneUsageSummary({ zoneId }: { zoneId: string }) {
  const [usage, setUsage] = useState<ZoneUsage>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getZoneUsage(zoneId, controller.signal).then(
      data => { if (!controller.signal.aborted) setUsage(data); },
      () => { if (!controller.signal.aborted) setFailed(true); },
    );
    return () => controller.abort();
  }, [zoneId, attempt]);

  const monitoring = usage?.monitoring;
  return (
    <section className={s.usage} aria-label="Zone usage">
      <strong>Used by</strong>
      {failed ? (
        <p role="status">Could not load zone usage.{' '}
          <button type="button" className={s.usageLink} onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Retry</button>
        </p>
      ) : !usage ? <p role="status">Checking zone usage…</p> : usage.dependencies.length === 0 ? <p>No linked records.</p> : (
        <>
          {monitoring && (
            <div className={s.monitoringUsage}>
              <p><strong>{monitoring.name}</strong> <span className={s.usageStatus}>{monitoring.status}</span></p>
              {monitoring.rules.length > 0 && <ul>
                {monitoring.rules.map(rule => <li key={rule.ruleId}>{rule.name} · {rule.enabled ? 'Enabled' : 'Disabled'}</li>)}
              </ul>}
              <a className={s.usageLink} href={`/admin/ai-config?zoneId=${encodeURIComponent(zoneId)}`} target="_blank" rel="noopener noreferrer"
                aria-label="View AI configuration (opens in a new tab)">View AI configuration</a>
            </div>
          )}
          <ul>
            {usage.dependencies.filter(dependency => dependency.kind !== 'MONITORING' || !monitoring).map(dependency => (
              <li key={dependency.kind}>
                {dependency.label} ({dependency.count})
                {dependency.kind === 'SHIFT' && usage.recentStaffNames.length > 0 && (
                  <small>Recent staff: {usage.recentStaffNames.join(', ')}</small>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

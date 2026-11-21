import { useEffect, useState } from 'react';
import { getCheckoutRuntime, listCheckoutCounters, type CheckoutCounter, type CheckoutRuntime } from '../api/checkout';
import type { ZoneRecord } from '../api/floors';
import { Card, CardHeader, Chip } from './ui';
import s from './CheckoutRuntimePanel.module.css';

const count = (value: number | null | undefined) => value == null ? 'Unavailable' : String(value);

export function CheckoutRuntimePanel({ zone }: { zone: ZoneRecord }) {
  if (zone.zoneType !== 'CHECKOUT') return null;
  return <Card className={s.panel}>
    <CardHeader title="Checkout measurements" subtitle={zone.name} />
    <CheckoutRuntimeContent key={zone.zoneId} zoneId={zone.zoneId} />
  </Card>;
}

function CheckoutRuntimeContent({ zoneId }: { zoneId: string }) {
  const [counters, setCounters] = useState<CheckoutCounter[]>([]);
  const [runtime, setRuntime] = useState<CheckoutRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!zoneId) return;
    let active = true;
    let current: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      current = new AbortController();
      try {
        const [saved, live] = await Promise.all([
          listCheckoutCounters(zoneId, current.signal), getCheckoutRuntime(zoneId, current.signal),
        ]);
        if (!active) return;
        setCounters(saved); setRuntime(live); setError('');
      } catch (reason) {
        if (active && !current.signal.aborted) setError(reason instanceof Error ? reason.message : 'Checkout runtime unavailable.');
      } finally {
        if (active) { setLoading(false); timer = setTimeout(refresh, 5000); }
      }
    };
    void refresh();
    return () => { active = false; current?.abort(); clearTimeout(timer); };
  }, [zoneId]);

  const observations = new Map(runtime?.counters.map(counter => [counter.counterId, counter]));
  const stateLabel = runtime?.state === 'READY' ? 'Ready' : runtime?.state === 'NOT_ACTIVE' ? 'Not active' : 'Unavailable';
  return <>
    {loading && <p role="status">Loading checkout runtime…</p>}
    {error && <p role="alert">{error} {runtime && 'Showing last received data; it may be stale.'}</p>}
    {runtime && <>
      <div className={s.state}>
        <Chip tone={runtime.state === 'READY' ? 'success' : 'neutral'}>{stateLabel}</Chip>
        {runtime.state === 'NOT_ACTIVE' && <span>Review and activate a checkout measurement rule to start collecting data.</span>}
        {runtime.state === 'UNAVAILABLE' && <span>Check the checkout counter mappings and camera source.</span>}
        {runtime.noStaffedCapacity && <span>Queue detected while no counter is staffed.</span>}
      </div>
      <dl className={s.metrics}>
        <div><dt>People in queue</dt><dd>{count(runtime.queueCount)}</dd></div>
        <div><dt>Staffed counters</dt><dd>{count(runtime.staffedCounterCount)}</dd></div>
        <div><dt>Queue per staffed counter</dt><dd>{count(runtime.queuePerStaffedCounter)}</dd></div>
        <div><dt>Longest wait</dt><dd>{runtime.maxWaitSeconds == null ? 'Unavailable' : `${Math.round(runtime.maxWaitSeconds)} s`}</dd></div>
      </dl>
    </>}
    {!loading && !error && counters.length === 0 && <p>No checkout counters configured for this Zone.</p>}
    {counters.length > 0 && <div className={s.scroll}><table className={s.table}>
      <thead><tr><th scope="col">Counter</th><th scope="col">Configuration</th><th scope="col">Presence</th><th scope="col">Queue</th></tr></thead>
      <tbody>{counters.map(counter => {
        const observed = observations.get(counter.checkoutCounterId);
        return <tr key={counter.checkoutCounterId}>
          <th scope="row">{counter.code} · {counter.name}</th><td>{counter.isEnabled ? 'Enabled' : 'Disabled'}</td>
          <td>{observed?.disagreement ? 'Conflicting cameras' : observed?.presence ?? 'UNKNOWN'}</td><td>{count(observed?.queueCount)}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </>;
}

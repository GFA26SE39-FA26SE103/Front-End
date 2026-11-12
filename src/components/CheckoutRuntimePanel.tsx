import { useEffect, useState } from 'react';
import { getCheckoutRuntime, listCheckoutCounters, type CheckoutCounter, type CheckoutRuntime } from '../api/checkout';
import type { ZoneRecord } from '../api/floors';
import { Card, CardHeader } from './ui';
import s from './CheckoutRuntimePanel.module.css';

const count = (value: number | null | undefined) => value == null ? 'Unavailable' : String(value);

export function CheckoutRuntimePanel({ zones }: { zones: ZoneRecord[] }) {
  const checkoutZones = zones.filter(zone => zone.zoneType === 'CHECKOUT');
  const [selectedId, setSelectedId] = useState('');
  const zoneId = checkoutZones.some(zone => zone.zoneId === selectedId) ? selectedId : checkoutZones[0]?.zoneId;
  if (!zoneId) return null;
  return <Card className={s.panel}>
    <CardHeader title="Checkout runtime" subtitle="Observed camera measurements, not confirmed staff identity or transactions." />
    <label className={s.selector}>Checkout Zone
      <select value={zoneId} onChange={event => setSelectedId(event.target.value)}>
        {checkoutZones.map(zone => <option key={zone.zoneId} value={zone.zoneId}>{zone.name}</option>)}
      </select>
    </label>
    <CheckoutRuntimeContent key={zoneId} zoneId={zoneId} />
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
  return <>
    {loading && <p role="status">Loading checkout runtime…</p>}
    {error && <p role="alert">{error} {runtime && 'Showing last received data; it may be stale.'}</p>}
    {runtime && <p className={s.summary}>State: {runtime.state} · Queue Q: {count(runtime.queueCount)} · Staffed S: {count(runtime.staffedCounterCount)} · Q/S: {count(runtime.queuePerStaffedCounter)} · Longest wait: {runtime.maxWaitSeconds == null ? 'Unavailable' : `${Math.round(runtime.maxWaitSeconds)}s`}{runtime.noStaffedCapacity ? ' · No staffed capacity' : ''}{runtime.issueCode ? ` · ${runtime.issueCode}` : ''}</p>}
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

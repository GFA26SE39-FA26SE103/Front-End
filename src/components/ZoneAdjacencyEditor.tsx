import { useEffect, useMemo, useState } from 'react';
import { listZoneAdjacency, replaceZoneAdjacency, type ZoneRecord } from '../api/floors';
import { Button, Callout } from './ui';
import { Dialog } from './Dialog';
import s from './ZoneAdjacencyEditor.module.css';

export function ZoneAdjacencyEditor({ zones, onClose, onSaved }: {
  zones: ZoneRecord[];
  onClose: () => void;
  onSaved: (zoneName: string) => void;
}) {
  const [sourceId, setSourceId] = useState(zones[0]?.zoneId ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const source = zones.find(zone => zone.zoneId === sourceId);
  const candidates = useMemo(() => zones
    .filter(zone => zone.zoneId !== sourceId && zone.floorId === source?.floorId)
    .sort((a, b) => a.name.localeCompare(b.name)), [source?.floorId, sourceId, zones]);

  useEffect(() => {
    if (!sourceId) {
      return;
    }
    const controller = new AbortController();
    void listZoneAdjacency(sourceId, controller.signal).then(adjacent => {
      if (!controller.signal.aborted) setSelectedIds(new Set(adjacent.map(zone => zone.zoneId)));
    }).catch(reason => {
      if (!controller.signal.aborted) setError(messageOf(reason, 'Could not load zone adjacency.'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reloadKey, sourceId]);

  const load = (nextSourceId = sourceId) => {
    setSourceId(nextSourceId);
    setLoading(Boolean(nextSourceId));
    setError('');
    setMessage('');
    setSelectedIds(new Set());
    setReloadKey(key => key + 1);
  };

  const toggle = (zoneId: string, checked: boolean) => setSelectedIds(current => {
    const next = new Set(current);
    if (checked) next.add(zoneId);
    else next.delete(zoneId);
    return next;
  });

  const save = async () => {
    if (!source) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const ids = candidates.filter(zone => selectedIds.has(zone.zoneId)).map(zone => zone.zoneId);
      const saved = await replaceZoneAdjacency(source.zoneId, ids);
      setSelectedIds(new Set(saved.map(zone => zone.zoneId)));
      setMessage(`Adjacency saved for ${source.name}.`);
      onSaved(source.name);
    } catch (reason) {
      setError(messageOf(reason, 'Could not save zone adjacency.'));
    } finally {
      setSaving(false);
    }
  };

  return <Dialog title="Zone adjacency" busy={saving} onClose={onClose}>
    <p className={s.help}>Choose the zones directly next to one another. Saving replaces this zone's current set and stores every link in both directions.</p>
    <label className={s.field}>
      <span>Zone to configure</span>
      <select value={sourceId} disabled={loading || saving} onChange={event => load(event.target.value)}>
        {zones.map(zone => <option key={zone.zoneId} value={zone.zoneId}>{zone.name} ({zone.code})</option>)}
      </select>
    </label>

    <fieldset className={s.candidates} disabled={loading || saving}>
      <legend>Adjacent zones on the same floor</legend>
      {candidates.map(zone => <label key={zone.zoneId} className={s.candidate}>
        <input type="checkbox" aria-label={`${zone.name} (${zone.code})`} checked={selectedIds.has(zone.zoneId)} onChange={event => toggle(zone.zoneId, event.target.checked)} />
        <span><strong>{zone.name}</strong><small>{zone.code}</small></span>
      </label>)}
      {!loading && candidates.length === 0 && <p className={s.empty}>Add another zone on this floor before configuring adjacency.</p>}
      {loading && <p className={s.empty} role="status">Loading adjacency…</p>}
    </fieldset>

    {error && <Callout tone="warning" icon="alert-warning" action={<Button variant="secondary" disabled={saving} onClick={() => load()}>Retry</Button>}><span role="alert">{error}</span></Callout>}
    {message && <p className={s.success} role="status">{message}</p>}
    <div className={s.actions}>
      <Button variant="secondary" data-autofocus disabled={saving} onClick={onClose}>Close</Button>
      <Button disabled={loading || saving || !source} onClick={() => void save()}>{saving ? 'Saving…' : 'Save adjacency'}</Button>
    </div>
  </Dialog>;
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

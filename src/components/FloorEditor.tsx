import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createFloor, updateFloorDetails, type FloorRecord } from '../api/floors';
import { ApiError } from '../api/client';
import { Dialog } from './Dialog';
import { Button } from './ui';
import s from './FloorEditor.module.css';

export function FloorEditor({ storeId, floor, suggestedNumber, onClose, onSaved }: {
  storeId: string; floor?: FloorRecord; suggestedNumber: number; onClose: () => void; onSaved: (saved: FloorRecord) => void;
}) {
  const [name, setName] = useState(floor?.name ?? '');
  const [number, setNumber] = useState(String(floor?.floorNumber ?? suggestedNumber));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const floorNumber = Number(number.trim());
    if (!/^-?\d+$/.test(number.trim()) || !Number.isSafeInteger(floorNumber) || floorNumber < -2147483648 || floorNumber > 2147483647) {
      setError('Enter a whole floor number.'); return;
    }
    if (!name.trim()) { setError('Floor name is required.'); return; }
    if (name.trim().length > 100) { setError('Floor name must be at most 100 characters.'); return; }
    setBusy(true); setError('');
    const request = { floorNumber, name: name.trim() };
    const abort = new AbortController(); controller.current = abort;
    try {
      const saved = floor ? await updateFloorDetails(floor.floorId, request, abort.signal) : await createFloor(storeId, request, abort.signal);
      if (!abort.signal.aborted) onSaved(saved);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof ApiError && e.code === 'DUPLICATE' ? 'This floor number already exists. Choose a different number.' : e instanceof Error ? e.message : 'Could not save the floor.');
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <Dialog title={floor ? 'Edit floor' : 'Create floor'} busy={busy} onClose={onClose}>
    <form className={s.form} noValidate onSubmit={event => void save(event)}>
      <fieldset disabled={busy}>
        <label>Floor name<input aria-label="Floor name" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Floor number<input aria-label="Floor number" type="number" step="1" value={number} onChange={e => setNumber(e.target.value)} /></label>
      </fieldset>
      <p className={s.note}>Each floor in this store must have a different number.{floor ? ' Your uploaded floor plan, zones and cameras are kept.' : ' Upload a floor plan after creating the floor.'}</p>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : floor ? 'Save floor' : 'Create floor'}</Button></div>
    </form>
  </Dialog>;
}

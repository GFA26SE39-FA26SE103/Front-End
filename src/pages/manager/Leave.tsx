import { useState, type FormEvent } from 'react';
import { addUnavailability, listUnavailability, removeUnavailability, type Unavailability } from '../../api/planning';
import { Dialog } from '../../components/Dialog';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Button, Card, CardHeader } from '../../components/ui';
import { addDays, dateTime, isoDate, problem } from './dates';
import { listStaff } from './planningData';
import { useLoad } from './useLoad';
import s from './manager.module.css';

export default function Leave() {
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => addDays(isoDate(new Date()), 30));
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);
  const { data: rows, error: loadError } = useLoad(`${from}|${to}|${reload}`, (signal) => listUnavailability(from, to, signal));
  const error = actionError || loadError;

  async function remove(row: Unavailability) {
    if (!window.confirm(`Remove ${row.fullName}'s leave from ${dateTime(row.startAt)}?`)) return;
    try {
      await removeUnavailability(row.unavailabilityId);
      setActionError('');
      setNotice(`${row.fullName}'s leave was removed. They can be scheduled again in that period.`);
      setReload((n) => n + 1);
    } catch (reason) {
      setActionError(problem(reason));
    }
  }

  return (
    <ManagerLayout title="Leave" subtitle="Manage staff availability" actions={<Button onClick={() => setAdding(true)}>Add leave</Button>}>
      <div className={s.page}>
        {notice && <p className={s.success} role="status">{notice}</p>}
        <Card>
          <CardHeader title="Recorded leave" />
          <div className={s.actions}>
            <label className={s.note}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className={s.note}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          {error ? <p className={s.error} role="alert">{error}</p>
            : !rows ? <p className={s.note} role="status">Loading leave…</p>
            : rows.length === 0 ? <p className={s.note}>No leave recorded in this period.</p>
            : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Staff</th><th>From</th><th>To</th><th>Note</th><th /></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.unavailabilityId}>
                        <td><b>{row.fullName}</b></td>
                        <td>{dateTime(row.startAt)}</td>
                        <td>{dateTime(row.endAt)}</td>
                        <td className={s.muted}>{row.note ?? '—'}</td>
                        <td><Button variant="dangerGhost" onClick={() => void remove(row)} aria-label={`Remove leave for ${row.fullName}`}>Remove</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
      {adding && <AddLeave onClose={() => setAdding(false)} onDone={(name) => { setAdding(false); setNotice(`Leave saved for ${name}.`); setReload((n) => n + 1); }} />}
    </ManagerLayout>
  );
}

function AddLeave({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const { data: staff, error: staffError } = useLoad('staff', listStaff);
  const [userId, setUserId] = useState('');
  const [start, setStart] = useState(() => `${isoDate(new Date())}T00:00`);
  const [end, setEnd] = useState(() => `${addDays(isoDate(new Date()), 1)}T00:00`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setError] = useState('');
  const error = formError || staffError;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!userId) return setError('Choose a Staff member.');
    const startAt = new Date(start);
    const endAt = new Date(end);
    if (!(endAt > startAt)) return setError('The end must be after the start.');
    setBusy(true);
    setError('');
    try {
      const saved = await addUnavailability({ userId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), note: note.trim() || null });
      onDone(saved.fullName);
    } catch (reason) {
      setError(problem(reason));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add leave" busy={busy} onClose={onClose}>
      <form className={s.form} onSubmit={(e) => void save(e)}>
        <label>
          Staff member
          <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={busy || !staff}>
            <option value="">{staff ? 'Choose…' : 'Loading staff…'}</option>
            {staff?.map((p) => <option key={p.userId} value={p.userId}>{p.fullName}</option>)}
          </select>
        </label>
        <label>From<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} /></label>
        <label>To<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy} /></label>
        <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family event" disabled={busy} /></label>
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.formActions}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save leave'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

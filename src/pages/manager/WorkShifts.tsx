import { useState, type FormEvent } from 'react';
import { copyWorkShiftWeek, createWorkShift, listWorkShifts, updateWorkShift, type WorkShift } from '../../api/planning';
import { Dialog } from '../../components/Dialog';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Badge, Button, Card, CardHeader, Select } from '../../components/ui';
import { addDays, clock, longDayLabel, problem, weekStart } from './dates';
import { ALLOWED_HOURS, shiftHours } from './planningData';
import { useLoad } from './useLoad';
import s from './manager.module.css';

export default function WorkShifts() {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<WorkShift | 'new' | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [reload, setReload] = useState(0);
  const to = addDays(week, 6);
  const { data: workShifts, error } = useLoad(`${week}|${reload}`,
    async (signal) => [...await listWorkShifts(week, signal)].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  const visibleWorkShifts = workShifts?.filter((shift) => statusFilter === 'ALL' || shift.status === statusFilter);
  const statusOptions = [
    { value: 'ALL' as const, label: `All${workShifts ? ` (${workShifts.length})` : ''}` },
    { value: 'ACTIVE' as const, label: `Active${workShifts ? ` (${workShifts.filter((shift) => shift.status === 'ACTIVE').length})` : ''}` },
    { value: 'INACTIVE' as const, label: `Inactive${workShifts ? ` (${workShifts.filter((shift) => shift.status === 'INACTIVE').length})` : ''}` },
  ];

  async function copyPreviousWeek() {
    setCopying(true); setActionError(''); setNotice('');
    try {
      await copyWorkShiftWeek(addDays(week, -7), week);
      setNotice(`Work Shifts copied to ${longDayLabel(week)} – ${longDayLabel(to)}. Staff assignments were not copied.`);
      setReload((value) => value + 1);
    } catch (reason) { setActionError(problem(reason)); }
    finally { setCopying(false); }
  }

  const actions = (
    <div className={s.actions}>
      <Button variant="secondary" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>‹</Button>
      <span className={s.weekLabel}>{longDayLabel(week)} – {longDayLabel(to)}</span>
      <Button variant="secondary" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>›</Button>
      <Button variant="secondary" onClick={() => setWeek(weekStart(new Date()))}>This week</Button>
      <Button onClick={() => setEditing('new')}>New Work Shift</Button>
    </div>
  );

  return (
    <ManagerLayout title="Work Shifts" subtitle="Configure 4, 6 or 8-hour shifts for each week" actions={actions}>
      <div className={s.page}>
        {notice && <p className={s.success} role="status">{notice}</p>}
        {actionError && <p className={s.error} role="alert">{actionError}</p>}
        <Card>
          <CardHeader title={`Work Shifts · ${longDayLabel(week)} – ${longDayLabel(to)}`}>
            <div className={s.filterControl}>
              <Select value={statusFilter} options={statusOptions} onChange={setStatusFilter} ariaLabel="Filter Work Shifts by status" height={34} />
            </div>
          </CardHeader>
          {error ? <p className={s.error} role="alert">{error}</p>
            : !workShifts ? <p className={s.note} role="status">Loading Work Shifts…</p>
            : workShifts.length === 0 ? (
              <div className={s.empty}>
                <h2>No Work Shifts configured for this week</h2>
                <p>Copy names and hours from the previous week, or create this week manually. Staff assignments are never copied by this action.</p>
                <div className={s.actions}>
                  <Button variant="secondary" disabled={copying} onClick={() => void copyPreviousWeek()}>{copying ? 'Copying…' : 'Copy from previous week'}</Button>
                  <Button onClick={() => setEditing('new')}>Create Work Shift</Button>
                </div>
              </div>
            )
            : visibleWorkShifts?.length === 0 ? <p className={s.note}>No {statusFilter.toLowerCase()} Work Shifts.</p>
            : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Name</th><th>Time</th><th>Length</th><th>Status</th><th>In use</th><th /></tr></thead>
                  <tbody>
                    {visibleWorkShifts?.map((t) => (
                      <tr key={t.shiftId}>
                        <td><b>{t.name}</b></td>
                        <td>{clock(t.startTime)}–{clock(t.endTime)}</td>
                        <td>{t.hours} h</td>
                        <td><Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></td>
                        <td className={s.muted}>{t.inUse ? 'Yes' : 'No'}</td>
                        <td><Button variant="secondary" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
      {editing && (
        <WorkShiftDialog workShift={editing === 'new' ? null : editing} week={week} onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); setNotice(message); setReload((n) => n + 1); }} />
      )}
    </ManagerLayout>
  );
}

function WorkShiftDialog({ workShift, week, onClose, onDone }: { workShift: WorkShift | null; week: string; onClose: () => void; onDone: (message: string) => void }) {
  const [name, setName] = useState(workShift?.name ?? '');
  const [start, setStart] = useState(clock(workShift?.startTime ?? '06:00'));
  const [end, setEnd] = useState(clock(workShift?.endTime ?? '14:00'));
  const [active, setActive] = useState((workShift?.status ?? 'ACTIVE') === 'ACTIVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hours = shiftHours(start, end);
  const lengthOk = ALLOWED_HOURS.includes(hours);
  const timesLocked = !!workShift?.inUse;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Give the shift a name, e.g. Morning.');
    if (!lengthOk) return setError('A shift must last 4, 6 or 8 hours.');
    setBusy(true);
    setError('');
    try {
      if (workShift) {
        const timesChanged = clock(workShift.startTime) !== start || clock(workShift.endTime) !== end;
        await updateWorkShift(workShift.shiftId, {
          name: name.trim(),
          ...(timesChanged ? { startTime: `${start}:00`, endTime: `${end}:00` } : {}),
          status: active ? 'ACTIVE' : 'INACTIVE',
        });
        onDone(`${name.trim()} saved.`);
      } else {
        await createWorkShift({ weekStart: week, name: name.trim(), startTime: `${start}:00`, endTime: `${end}:00` });
        onDone(`${name.trim()} created for this week. It now has a row on the schedule.`);
      }
    } catch (reason) {
      setError(problem(reason));
      setBusy(false);
    }
  }

  return (
    <Dialog title={workShift ? `Edit ${workShift.name}` : 'New Work Shift'} busy={busy} onClose={onClose}>
      <form className={s.form} onSubmit={(e) => void save(e)}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning" disabled={busy} /></label>
        <div className={s.actions}>
          <label className={s.grow}>Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy || timesLocked} /></label>
          <label className={s.grow}>End<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy || timesLocked} /></label>
        </div>
        <p className={lengthOk ? s.note : s.error}>
          {hours} hours{end <= start ? ', ends the next day' : ''}. {lengthOk ? '' : 'Choose 4, 6 or 8 hours.'}
          {timesLocked ? ' Times are locked because Staff are already assigned to this Work Shift for this week.' : ''}
        </p>
        {workShift && (
          <label className={s.checkRow}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} />
            Active (inactive shifts take no new assignments)
          </label>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.formActions}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : workShift ? 'Save' : 'Create Work Shift'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

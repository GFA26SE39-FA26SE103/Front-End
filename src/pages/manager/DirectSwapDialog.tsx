import { useState, type FormEvent } from 'react';
import { directShiftChange, getSchedule, type ScheduledShift } from '../../api/planning';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui';
import { addDays, longDayLabel, problem, range, weekStart } from './dates';
import { useLoad } from './useLoad';
import s from './manager.module.css';

function shiftLabel(shift: ScheduledShift) {
  const time = range(shift.startsAt, shift.endsAt);
  const zones = shift.zones.map((zone) => zone.zoneName).join(', ');
  return [shift.shiftName, longDayLabel(shift.workDate), time, zones].filter(Boolean).join(' · ');
}

export function DirectSwapDialog({ initialWeek, initialAssignmentId, onClose, onDone }: {
  initialWeek?: string;
  initialAssignmentId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [week, setWeek] = useState(() => initialWeek ?? weekStart(new Date()));
  const [reload, setReload] = useState(0);
  const [sourceId, setSourceId] = useState(initialAssignmentId ?? '');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = addDays(week, 6);
  const { data, error: loadError } = useLoad(`${week}|${reload}`, (signal) => getSchedule(week, end, signal));
  const assignments = (data?.assignments ?? [])
    .filter((shift) => shift.status === 'SCHEDULED' && shift.editable && !shift.checkInAt)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.fullName.localeCompare(b.fullName));
  const source = assignments.find((shift) => shift.shiftAssignmentId === sourceId);
  const targets = source ? assignments.filter((shift) => shift.userId !== source.userId
    && (shift.shiftId !== source.shiftId || shift.workDate !== source.workDate)) : [];
  const target = targets.find((shift) => shift.shiftAssignmentId === targetId);

  function changeWeek(nextWeek: string) {
    setWeek(nextWeek);
    setSourceId('');
    setTargetId('');
    setError('');
  }

  async function swap(event: FormEvent) {
    event.preventDefault();
    if (busy || !source || !target || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await directShiftChange({ type: 'SWAP', requesterShiftAssignmentId: source.shiftAssignmentId,
        targetUserId: target.userId, targetShiftAssignmentId: target.shiftAssignmentId, note: reason.trim() });
      onDone(`Shifts swapped for ${source.fullName} and ${target.fullName}.`);
    } catch (cause) {
      setError(problem(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Swap two shifts" busy={busy} onClose={onClose}>
      <form className={s.form} onSubmit={(event) => void swap(event)}>
        {!initialAssignmentId && (
          <div className={s.tabs}>
            <Button variant="secondary" aria-label="Previous swap week" disabled={busy} onClick={() => changeWeek(addDays(week, -7))}>‹</Button>
            <span className={s.weekLabel}>{longDayLabel(week)} – {longDayLabel(end)}</span>
            <Button variant="secondary" aria-label="Next swap week" disabled={busy} onClick={() => changeWeek(addDays(week, 7))}>›</Button>
          </div>
        )}
        {loadError ? (
          <p className={s.error} role="alert">{loadError} <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>Retry</Button></p>
        ) : !data ? (
          <p className={s.note} role="status">Loading published shifts…</p>
        ) : initialAssignmentId && !source ? (
          <p className={s.note}>This shift is no longer available to swap.</p>
        ) : (
          <>
            {initialAssignmentId && source ? (
              <dl className={s.facts}><dt>First shift</dt><dd>{source.fullName} · {shiftLabel(source)}</dd></dl>
            ) : (
              <label>
                First shift
                <select value={sourceId} disabled={busy || !assignments.length} onChange={(event) => {
                  setSourceId(event.target.value);
                  setTargetId('');
                  setError('');
                }}>
                  <option value="" disabled>Choose the first shift</option>
                  {assignments.map((shift) => <option key={shift.shiftAssignmentId} value={shift.shiftAssignmentId}>{shift.fullName} · {shiftLabel(shift)}</option>)}
                </select>
              </label>
            )}
            {!assignments.length && <p className={s.note}>There are no published shifts available to swap this week.</p>}
            <label>
              Second shift
              <select value={targetId} disabled={busy || !targets.length} onChange={(event) => { setTargetId(event.target.value); setError(''); }}>
                <option value="" disabled>Choose the second shift</option>
                {targets.map((shift) => <option key={shift.shiftAssignmentId} value={shift.shiftAssignmentId}>{shift.fullName} · {shiftLabel(shift)}</option>)}
              </select>
            </label>
            {source && targets.length === 0 && <p className={s.note}>There is no other published shift available to swap this week.</p>}
            {source && target && <p className={s.info}>{source.fullName} takes {shiftLabel(target)}. {target.fullName} takes {shiftLabel(source)}.</p>}
            <label>
              Reason for swap (required)
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required disabled={busy} />
            </label>
          </>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.formActions}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !source || !target || !reason.trim()}>{busy ? 'Swapping…' : 'Apply direct swap'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

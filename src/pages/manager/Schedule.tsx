import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  assignShift, cancelAssignment, getSchedule, getStaffOptions, listShiftTemplates, listSwapRequests, publishSchedule, updateAssignment,
  type ScheduleView, type ScheduledShift, type ShiftTemplate, type StaffOption,
} from '../../api/planning';
import { Dialog } from '../../components/Dialog';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Button, Card, CardHeader, StatCard } from '../../components/ui';
import { addDays, clock, dayLabel, isoDate, longDayLabel, problem, range, weekStart } from './dates';
import { listStoreZones, type StoreZone } from './planningData';
import { useLoad } from './useLoad';
import s from './manager.module.css';

type Loaded = { schedule: ScheduleView; templates: ShiftTemplate[]; zones: StoreZone[]; pendingSwaps: number };
type Editing = { kind: 'assign'; shift: ShiftTemplate; workDate: string } | { kind: 'edit'; assignment: ScheduledShift } | { kind: 'publish' };

const live = (a: ScheduledShift) => a.status !== 'CANCELLED';

export default function Schedule() {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [today] = useState(() => isoDate(new Date()));
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [reload, setReload] = useState(0);
  const to = addDays(week, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const { data, error: loadError } = useLoad<Loaded>(`${week}|${reload}`, async (signal) => {
    const [schedule, templates, zones, pendingSwaps] = await Promise.all([
      getSchedule(week, to, signal),
      listShiftTemplates(signal),
      listStoreZones(signal),
      listSwapRequests(undefined, signal).then((r) => r.length, () => 0),
    ]);
    return { schedule, templates, zones, pendingSwaps };
  });

  const refresh = (message = '') => {
    setEditing(null);
    setNotice(message);
    setReload((n) => n + 1);
  };

  const assignments = data?.schedule.assignments.filter(live) ?? [];
  // Active templates, plus inactive ones still used this week, earliest first.
  const rows = (data?.templates ?? [])
    .filter((t) => t.status === 'ACTIVE' || assignments.some((a) => a.shiftId === t.shiftId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const actions = (
    <div className={s.actions}>
      <Button variant="secondary" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>‹</Button>
      <span className={s.weekLabel}>{longDayLabel(week)} – {longDayLabel(to)}</span>
      <Button variant="secondary" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>›</Button>
      <Button variant="secondary" onClick={() => setWeek(weekStart(new Date()))}>This week</Button>
      <Button disabled={!data || data.schedule.draftCount === 0} onClick={() => setEditing({ kind: 'publish' })}>
        Publish week{data?.schedule.draftCount ? ` (${data.schedule.draftCount})` : ''}
      </Button>
    </div>
  );

  return (
    <ManagerLayout title="Schedule" subtitle="Plan and publish weekly shifts" actions={actions}>
      <div className={s.page}>
        {notice && <p className={s.success} role="status">{notice}</p>}
        {loadError ? (
          <div className={s.error} role="alert">{loadError} <Button variant="secondary" onClick={() => refresh()}>Retry</Button></div>
        ) : !data ? (
          <p className={s.note} role="status">Loading the schedule…</p>
        ) : (
          <>
            <div className={s.stats}>
              <StatCard label="Assigned shifts" value={String(assignments.length)} note={`${assignments.length - data.schedule.draftCount} published`} tone="primary" />
              <StatCard label="Drafts" value={String(data.schedule.draftCount)} note="Staff cannot see drafts yet" tone={data.schedule.draftCount ? 'warning' : 'success'} />
              <StatCard label="Coverage gaps" value={String(data.schedule.gapCount)} note="Zones below minimum staff" tone={data.schedule.gapCount ? 'danger' : 'success'} />
              <StatCard label="Swaps to approve" value={String(data.pendingSwaps)} note="Accepted by a colleague" tone={data.pendingSwaps ? 'warning' : 'success'} />
            </div>
            {data.pendingSwaps > 0 && (
              <p className={s.info}>{data.pendingSwaps === 1 ? '1 swap request waits' : `${data.pendingSwaps} swap requests wait`} for your decision. <Link className={s.back} to="/manager/swaps">Review swaps</Link></p>
            )}
            <Card>
              <CardHeader title="Week plan" />
              {rows.length === 0 ? (
                <p className={s.note}>No active shifts. <Link className={s.back} to="/manager/shifts">Set up shifts</Link> first.</p>
              ) : (
                <div className={s.gridWrap}>
                  <table className={s.grid}>
                    <thead>
                      <tr>
                        <th className={s.shiftHead}>Shift</th>
                        {days.map((d) => <th key={d} className={d === today ? s.today : undefined}>{dayLabel(d)}{d === today ? ' · today' : ''}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((shift) => (
                        <tr key={shift.shiftId}>
                          <td>
                            <div className={s.shiftName}>{shift.name}</div>
                            <div className={s.shiftTime}>{clock(shift.startTime)}–{clock(shift.endTime)} · {shift.hours} h</div>
                          </td>
                          {days.map((day) => {
                            const people = assignments.filter((a) => a.shiftId === shift.shiftId && a.workDate === day);
                            const coverage = data.schedule.coverage.filter((c) => c.shiftId === shift.shiftId && c.workDate === day && (c.minStaff > 0 || c.planned > 0));
                            const past = day < today;
                            return (
                              <td key={day} className={past ? s.past : undefined}>
                                <div className={s.cell}>
                                  {people.map((a) => (
                                    <button key={a.shiftAssignmentId} type="button" className={`${s.person} ${a.status === 'DRAFT' ? s.draft : ''}`}
                                      onClick={() => setEditing({ kind: 'edit', assignment: a })}
                                      aria-label={`${a.fullName}, ${shift.name} ${dayLabel(day)}, ${a.status === 'DRAFT' ? 'draft' : 'published'}`}>
                                      <strong>{a.fullName}</strong>
                                      <span>{a.zones.map((z) => z.zoneName).join(', ') || 'No zone'}</span>
                                      {a.status === 'DRAFT' && <span>Draft</span>}
                                      {a.pendingSwapRequestId && <span className={s.flag}>Swap pending</span>}
                                      {a.checkInAt && <span>Checked in</span>}
                                    </button>
                                  ))}
                                  {coverage.length > 0 && (
                                    <div className={s.coverage}>
                                      {coverage.map((c) => (
                                        <span key={c.zoneId} className={c.belowMinimum ? s.covGap : s.cov} title={`${c.zoneName}: ${c.planned} planned, ${c.published} published, minimum ${c.minStaff}`}>
                                          {c.zoneName} {c.planned}/{c.minStaff}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {!past && shift.status === 'ACTIVE' && (
                                    <button type="button" className={s.add} onClick={() => setEditing({ kind: 'assign', shift, workDate: day })}
                                      aria-label={`Assign staff to ${shift.name} on ${dayLabel(day)}`}>+ Assign</button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className={s.legend}>
                <span>Dashed = draft</span>
                <span>Zone chips = planned / minimum</span>
              </div>
            </Card>
          </>
        )}
      </div>
      {editing?.kind === 'publish' && data && (
        <PublishDialog from={week} to={to} drafts={data.schedule.draftCount} gaps={data.schedule.gapCount}
          onClose={() => setEditing(null)}
          onDone={(published, notified) => refresh(`Published ${published} shift${published === 1 ? '' : 's'}; ${notified} staff member${notified === 1 ? ' was' : 's were'} notified.`)} />
      )}
      {editing?.kind === 'assign' && data && (
        <AssignmentDialog shiftId={editing.shift.shiftId} title={`Assign · ${editing.shift.name} · ${longDayLabel(editing.workDate)}`}
          workDate={editing.workDate} zones={data.zones} onClose={() => setEditing(null)}
          onDone={(name) => refresh(`${name} added as a draft. Publish the week so they can see it.`)} />
      )}
      {editing?.kind === 'edit' && data && (
        <AssignmentDialog shiftId={editing.assignment.shiftId} assignment={editing.assignment}
          title={`${editing.assignment.shiftName} · ${longDayLabel(editing.assignment.workDate)}`}
          workDate={editing.assignment.workDate} zones={data.zones} onClose={() => setEditing(null)}
          onDone={(name) => refresh(`${name}'s shift was updated.`)} />
      )}
    </ManagerLayout>
  );
}

function PublishDialog({ from, to, drafts, gaps, onClose, onDone }: {
  from: string; to: string; drafts: number; gaps: number; onClose: () => void; onDone: (published: number, notified: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function publish() {
    setBusy(true);
    setError('');
    try {
      const result = await publishSchedule(from, to);
      onDone(result.published, result.notified);
    } catch (reason) {
      setError(problem(reason));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Publish this week?" busy={busy} onClose={onClose}>
      <p className={s.note}>
        {drafts === 1 ? '1 draft shift' : `${drafts} draft shifts`} from {longDayLabel(from)} to {longDayLabel(to)} {drafts === 1 ? 'becomes' : 'become'} visible to Staff, and each Staff member gets a notification.
        Shifts that already started stay as drafts.
      </p>
      {gaps > 0 && <p className={s.error}>{gaps} zone shift{gaps === 1 ? ' is' : 's are'} below the minimum staff. The server refuses to publish until they are covered.</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.formActions}>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish'}</Button>
      </div>
    </Dialog>
  );
}

/** Adds a Staff member to a shift, or changes the person or Zone of an existing one. */
function AssignmentDialog({ shiftId, workDate, title, zones, assignment, onClose, onDone }: {
  shiftId: string; workDate: string; title: string; zones: StoreZone[];
  assignment?: ScheduledShift; onClose: () => void; onDone: (name: string) => void;
}) {
  const [options, setOptions] = useState<StaffOption[] | null>(null);
  const [userId, setUserId] = useState(assignment?.userId ?? '');
  const [zoneId, setZoneId] = useState(assignment?.zones[0]?.zoneId ?? (zones.length === 1 ? zones[0].zoneId : ''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = assignment && !assignment.editable;

  useEffect(() => {
    if (locked) return;
    const controller = new AbortController();
    void getStaffOptions(shiftId, workDate, assignment?.shiftAssignmentId, controller.signal)
      .then((list) => { if (!controller.signal.aborted) setOptions(list); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(problem(reason)); });
    return () => controller.abort();
  }, [shiftId, workDate, assignment?.shiftAssignmentId, locked]);

  const sorted = [...(options ?? [])].sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.fullName.localeCompare(b.fullName));
  const chosen = options?.find((o) => o.userId === userId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!userId) return setError('Choose a Staff member.');
    if (!zoneId) return setError('Choose a Zone.');
    setBusy(true);
    setError('');
    try {
      const saved = assignment
        ? await updateAssignment(assignment.shiftAssignmentId, { ...(userId !== assignment.userId ? { userId } : {}), zoneIds: [zoneId] })
        : await assignShift({ userId, shiftId, workDate, zoneIds: [zoneId] });
      onDone(saved.fullName);
    } catch (reason) {
      setError(problem(reason));
      setBusy(false);
    }
  }

  async function cancel() {
    if (!assignment) return;
    setBusy(true);
    setError('');
    try {
      await cancelAssignment(assignment.shiftAssignmentId, reason.trim() || null);
      onDone(assignment.fullName);
    } catch (reason) {
      setError(problem(reason));
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <Dialog title={title} busy={false} onClose={onClose}>
        <dl className={s.facts}>
          <dt>Staff</dt><dd>{assignment.fullName}</dd>
          <dt>Time</dt><dd>{range(assignment.startsAt, assignment.endsAt)}</dd>
          <dt>Zones</dt><dd>{assignment.zones.map((z) => z.zoneName).join(', ')}</dd>
          <dt>Status</dt><dd>{assignment.checkInAt ? 'Checked in' : assignment.status === 'DRAFT' ? 'Draft' : 'Published'}</dd>
        </dl>
        <p className={s.info}>
          {assignment.pendingSwapRequestId
            ? 'A swap request for this shift is waiting. Decide it first, then edit the shift.'
            : 'This shift has started or the Staff member checked in, so it can no longer be changed (BR-35).'}
        </p>
        {assignment.pendingSwapRequestId && <Link className={s.back} to={`/manager/swaps/${assignment.pendingSwapRequestId}`}>Open the swap request</Link>}
        <div className={s.formActions}><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} busy={busy} onClose={onClose}>
      <form className={s.form} onSubmit={(e) => void save(e)}>
        <fieldset className={s.fieldset}>
          <legend>Staff member</legend>
          {!options && !error && <p className={s.note} role="status">Checking who can work this shift…</p>}
          {options && options.length === 0 && <p className={s.note}>There are no active Staff accounts.</p>}
          <div className={s.options}>
            {sorted.map((o) => (
              <label key={o.userId} className={`${s.option} ${o.userId === userId ? s.selected : ''} ${o.eligible ? '' : s.blocked}`}>
                <input type="radio" name="staff" value={o.userId} checked={o.userId === userId} disabled={!o.eligible || busy}
                  onChange={() => setUserId(o.userId)} />
                <span>
                  <span className={s.optionName}>{o.fullName}</span>
                  <span className={s.optionNote}> · {o.weeklyHoursAfter} / 48 h that week</span>
                  {o.problems.map((p) => <span key={p} className={s.optionProblem} style={{ display: 'block' }}>{p}</span>)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Zone
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={busy || zones.length === 0}>
            <option value="" disabled>Choose a zone</option>
            {zones.map((z) => <option key={z.zoneId} value={z.zoneId}>{z.name}</option>)}
          </select>
          {zones.length === 0 && <span className={s.note}>No active zones. The Administrator sets them up in Store layout.</span>}
        </label>
        {assignment && (
          <label>
            Reason if you remove this shift (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Store event" disabled={busy} />
          </label>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={assignment ? s.split : s.formActions}>
          {assignment && <Button variant="dangerGhost" disabled={busy} onClick={() => void cancel()}>Remove from shift</Button>}
          <div className={s.actions}>
            <Button variant="secondary" disabled={busy} onClick={onClose}>Close</Button>
            <Button type="submit" disabled={busy || !chosen?.eligible}>{busy ? 'Saving…' : assignment ? 'Save changes' : 'Add as draft'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

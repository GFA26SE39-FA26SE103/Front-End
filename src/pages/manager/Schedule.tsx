import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  assignShift, cancelAssignment, directShiftChange, getSchedule, getStaffOptions, listWorkShifts, listSwapRequests, publishSchedule, updateAssignment,
  type ScheduleView, type ScheduledShift, type WorkShift, type StaffOption, type ZoneCoverage,
} from '../../api/planning';
import { Dialog } from '../../components/Dialog';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Badge, Button, Card, CardHeader, StatCard } from '../../components/ui';
import { addDays, clock, dateTime, dayLabel, isoDate, longDayLabel, problem, range, time, weekStart } from './dates';
import { DirectSwapDialog } from './DirectSwapDialog';
import { listStoreZones, shiftHasStarted, type StoreZone } from './planningData';
import { useLoad } from './useLoad';
import s from './manager.module.css';

type Loaded = { schedule: ScheduleView; workShifts: WorkShift[]; zones: StoreZone[]; pendingSwaps: number };
type ShiftSlot = { shift: WorkShift; workDate: string };
type Editing =
  | (ShiftSlot & { kind: 'assign' | 'roster' })
  | (ShiftSlot & { kind: 'edit' | 'swap'; assignment: ScheduledShift })
  | { kind: 'publish' };

const live = (a: ScheduledShift) => a.status !== 'CANCELLED';

function AssignmentCheckIn({ assignment }: { assignment: ScheduledShift }) {
  const { checkInAt, startsAt } = assignment;
  if (!checkInAt) return null;
  const checkedAt = Date.parse(checkInAt);
  if (!Number.isFinite(checkedAt)) return <span className={s.checkedIn}>Checked in</span>;

  const delay = checkedAt - Date.parse(startsAt);
  const minutes = Math.floor(delay / 60_000);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  const lateBy = minutes === 0 ? '<1m' : [hours && `${hours}h`, remaining && `${remaining}m`].filter(Boolean).join(' ');

  return (
    <span className={s.checkInDetails}>
      <time dateTime={checkInAt} title={dateTime(checkInAt)} className={s.checkedIn}>Checked in at {time(checkInAt)}</time>
      {delay > 0 && <>{' '}<span className={s.lateCheckIn}>Late by {lateBy}</span></>}
    </span>
  );
}

function coverageForSlot(coverage: ZoneCoverage[], shiftId: string, workDate: string) {
  return coverage.filter((zone) => zone.shiftId === shiftId && zone.workDate === workDate && (zone.minStaff > 0 || zone.planned > 0));
}

export default function Schedule() {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [today] = useState(() => isoDate(new Date()));
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [reload, setReload] = useState(0);
  const to = addDays(week, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const { data, error: loadError } = useLoad<Loaded>(`${week}|${reload}`, async (signal) => {
    const [schedule, workShifts, zones, pendingSwaps] = await Promise.all([
      getSchedule(week, to, signal),
      listWorkShifts(week, signal),
      listStoreZones(signal),
      listSwapRequests(undefined, signal).then((r) => r.length, () => 0),
    ]);
    return { schedule, workShifts, zones, pendingSwaps };
  });

  const refresh = (message = '') => {
    setEditing(null);
    setNotice(message);
    setReload((n) => n + 1);
  };

  const assignments = data?.schedule.assignments.filter(live) ?? [];
  const activeZoneIds = new Set(data?.zones.map((zone) => zone.zoneId) ?? []);
  const inactiveZones = [...new Map(assignments
    .flatMap((assignment) => assignment.zones)
    .filter((zone) => !activeZoneIds.has(zone.zoneId))
    .map((zone) => [zone.zoneId, zone])).values()];
  // Active Work Shifts, plus inactive ones still used this week, earliest first.
  const rows = (data?.workShifts ?? [])
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
    <ManagerLayout title="Schedule" actions={actions}>
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
              <StatCard label="Pending shift changes" value={String(data.pendingSwaps)} note="Need Manager action" tone={data.pendingSwaps ? 'warning' : 'success'} />
            </div>
            {data.pendingSwaps > 0 && (
              <p className={s.info}>{data.pendingSwaps === 1 ? '1 shift change request needs your attention.' : `${data.pendingSwaps} shift change requests need your attention.`} <Link className={s.back} to="/manager/swaps">Review requests</Link></p>
            )}
            {inactiveZones.length > 0 && (
              <p className={s.warning} role="status">
                Published assignments in this week still reference inactive {inactiveZones.length === 1 ? 'Zone' : 'Zones'}: {inactiveZones.map((zone) => zone.zoneName).join(', ')}.
                {' '}They remain visible as schedule history, but cannot be selected for new assignments. Update or remove future assignments that still use them.
              </p>
            )}
            <Card>
              <CardHeader title="Week plan" />
              {rows.length === 0 ? (
                <p className={s.note}>No Work Shifts are configured for this week. <Link className={s.back} to="/manager/shifts">Configure or copy Work Shifts</Link> first.</p>
              ) : (
                <div className={s.gridWrap}>
                  <table className={s.grid}>
                    <thead>
                      <tr>
                        <th className={s.shiftHead}>Work Shift</th>
                        {days.map((d) => <th key={d} className={d === today ? s.today : undefined}>{dayLabel(d)}{d === today ? ' · today' : ''}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((shift) => (
                        <tr key={shift.shiftId}>
                          <td>
                            <div className={s.shiftTitle}>
                              <span className={s.shiftName}>{shift.name}</span>
                              {shift.status !== 'ACTIVE' && <Badge tone="neutral">Inactive</Badge>}
                            </div>
                            <div className={s.shiftTime}>{clock(shift.startTime)}–{clock(shift.endTime)} · {shift.hours} h</div>
                          </td>
                          {days.map((day) => {
                            const people = assignments.filter((a) => a.shiftId === shift.shiftId && a.workDate === day);
                            const coverage = coverageForSlot(data.schedule.coverage, shift.shiftId, day);
                            const zoneCount = new Set([
                              ...coverage.map((zone) => zone.zoneId),
                              ...people.flatMap((person) => person.zones.map((zone) => zone.zoneId)),
                            ]).size;
                            const gapCount = coverage.filter((zone) => zone.belowMinimum).length;
                            const draftCount = people.filter((person) => person.status === 'DRAFT').length;
                            const summary = `${people.length} staff · ${zoneCount} ${zoneCount === 1 ? 'zone' : 'zones'}`;
                            const gapLabel = `${gapCount} ${gapCount === 1 ? 'zone' : 'zones'} below minimum`;
                            const draftLabel = `${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'}`;
                            const past = day < today;
                            return (
                              <td key={day} className={past ? s.past : undefined}>
                                <div className={s.cell}>
                                  {(people.length > 0 || zoneCount > 0) && (
                                    <button type="button" className={s.slotSummary}
                                      onClick={() => setEditing({ kind: 'roster', shift, workDate: day })}
                                      aria-haspopup="dialog"
                                      aria-label={[`View roster for ${shift.name} on ${dayLabel(day)}`, summary, gapCount > 0 && gapLabel, draftCount > 0 && draftLabel].filter(Boolean).join(', ')}>
                                      <span className={s.slotSummaryLine}>
                                        <strong>{summary}</strong><span aria-hidden="true">›</span>
                                      </span>
                                      {gapCount > 0 && <span className={s.coverageGap}>{gapLabel}</span>}
                                      {draftCount > 0 && <span className={s.draftCount}>{draftLabel}</span>}
                                    </button>
                                  )}
                                  {!shiftHasStarted(day, shift.startTime) && shift.status === 'ACTIVE' && (
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
      {editing?.kind === 'roster' && data && (
        <ShiftRosterDialog slot={editing}
          people={assignments.filter((person) => person.shiftId === editing.shift.shiftId && person.workDate === editing.workDate)}
          coverage={coverageForSlot(data.schedule.coverage, editing.shift.shiftId, editing.workDate)}
          activeZoneIds={activeZoneIds} onClose={() => setEditing(null)}
          onSelect={(assignment) => setEditing({ ...editing, kind: 'edit', assignment })} />
      )}
      {editing?.kind === 'edit' && data && (
        <AssignmentDialog shiftId={editing.assignment.shiftId} assignment={editing.assignment}
          title={`${editing.assignment.shiftName} · ${longDayLabel(editing.assignment.workDate)}`}
          workDate={editing.assignment.workDate} zones={data.zones}
          onSwap={() => setEditing({ ...editing, kind: 'swap' })}
          onClose={() => setEditing({ kind: 'roster', shift: editing.shift, workDate: editing.workDate })}
          onDone={(name) => refresh(`${name}'s shift was updated.`)} />
      )}
      {editing?.kind === 'swap' && (
        <DirectSwapDialog initialWeek={week} initialAssignmentId={editing.assignment.shiftAssignmentId}
          onClose={() => setEditing({ ...editing, kind: 'edit' })} onDone={refresh} />
      )}
    </ManagerLayout>
  );
}

type RosterGroup = { name: string; coverage?: ZoneCoverage; people: ScheduledShift[] };

function ShiftRosterDialog({ slot, people, coverage, activeZoneIds, onClose, onSelect }: {
  slot: ShiftSlot; people: ScheduledShift[]; coverage: ZoneCoverage[]; activeZoneIds: Set<string>;
  onClose: () => void; onSelect: (assignment: ScheduledShift) => void;
}) {
  const groups = new Map<string | null, RosterGroup>();
  for (const zone of coverage) {
    groups.set(zone.zoneId, { name: zone.zoneName, coverage: zone, people: [] });
  }
  for (const person of people) {
    const zones = person.zones.length ? person.zones : [{ zoneId: null, zoneName: 'No zone' }];
    for (const zone of zones) {
      const group = groups.get(zone.zoneId) ?? { name: zone.zoneName, people: [] };
      group.people.push(person);
      groups.set(zone.zoneId, group);
    }
  }
  const orderedGroups = [...groups].sort(([leftId, left], [rightId, right]) =>
    Number(!!right.coverage?.belowMinimum) - Number(!!left.coverage?.belowMinimum)
    || Number(leftId === null) - Number(rightId === null)
    || left.name.localeCompare(right.name));

  return (
    <Dialog title={`Roster · ${slot.shift.name} · ${longDayLabel(slot.workDate)}`}
      className={s.rosterDialog} busy={false} onClose={onClose}>
      <div className={s.rosterList}>
        {orderedGroups.map(([zoneId, group]) => {
          const minStaff = group.coverage?.minStaff ?? 0;
          const planned = group.coverage?.planned ?? group.people.length;
          const inactive = zoneId !== null && !activeZoneIds.has(zoneId);
          return (
            <section key={zoneId ?? 'unassigned'} className={s.rosterGroup}>
              <div className={s.rosterGroupHeader}>
                <h3>{group.name}{inactive ? ' (inactive)' : ''}</h3>
                <span className={group.coverage?.belowMinimum ? s.coverageGap : s.rosterCount}
                  title={group.coverage ? `${planned} planned, ${group.coverage.published} published` : undefined}>
                  {minStaff > 0 ? `${planned} of ${minStaff} staff` : `${planned} staff`}
                  {group.coverage?.belowMinimum && ' · Below minimum'}
                </span>
              </div>
              {group.people.length > 0 ? (
                <ul className={s.rosterPeople}>
                  {group.people.map((person) => (
                    <li key={person.shiftAssignmentId}>
                      <button type="button" className={s.rosterPerson} onClick={() => onSelect(person)} aria-haspopup="dialog">
                        <strong>{person.fullName}</strong>{' '}
                        <span className={s.rosterPersonStatus}>
                          {person.status === 'DRAFT' && <><span className={s.draftCount}>Draft</span>{' '}</>}
                          {person.pendingSwapRequestId && <><span className={s.draftCount}>Change pending</span>{' '}</>}
                          {person.checkInAt
                            ? <AssignmentCheckIn assignment={person} />
                            : person.status !== 'DRAFT' && <span className={s.rosterCount}>Not checked in</span>}
                          <span className={s.rosterChevron} aria-hidden="true">›</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className={s.rosterEmpty}>No staff assigned</p>}
            </section>
          );
        })}
      </div>
      <div className={s.formActions}><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </Dialog>
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
function AssignmentDialog({ shiftId, workDate, title, zones, assignment, onSwap, onClose, onDone }: {
  shiftId: string; workDate: string; title: string; zones: StoreZone[];
  assignment?: ScheduledShift; onSwap?: () => void; onClose: () => void; onDone: (name: string) => void;
}) {
  const [options, setOptions] = useState<StaffOption[] | null>(null);
  const [userId, setUserId] = useState(assignment?.userId ?? '');
  const [zoneId, setZoneId] = useState(assignment?.zones[0]?.zoneId ?? (zones.length === 1 ? zones[0].zoneId : ''));
  const [reason, setReason] = useState('');
  const [showReplacement, setShowReplacement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = assignment && !assignment.editable;
  const published = assignment?.status === 'SCHEDULED';
  const showStaff = !published || showReplacement;

  useEffect(() => {
    if (locked || !showStaff) return;
    const controller = new AbortController();
    void getStaffOptions(shiftId, workDate, assignment?.shiftAssignmentId, controller.signal)
      .then((list) => { if (!controller.signal.aborted) setOptions(list); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(problem(reason)); });
    return () => controller.abort();
  }, [shiftId, workDate, assignment?.shiftAssignmentId, locked, showStaff]);

  const replacing = published && showReplacement;
  const sorted = (options ?? []).filter((option) => !replacing || option.userId !== assignment.userId)
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.fullName.localeCompare(b.fullName));
  const chosen = sorted.find((o) => o.userId === userId);
  const canSave = replacing ? chosen?.eligible && userId !== assignment.userId && reason.trim().length > 0
    : !showStaff || chosen?.eligible;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !canSave) return;
    if (!replacing && !zoneId) return setError('Choose a Zone.');
    setBusy(true);
    setError('');
    try {
      if (replacing) {
        await directShiftChange({ type: 'COVER', requesterShiftAssignmentId: assignment.shiftAssignmentId,
          targetUserId: userId, targetShiftAssignmentId: null, note: reason.trim() });
        onDone(chosen?.fullName ?? 'Staff');
      } else {
        const saved = assignment
          ? await updateAssignment(assignment.shiftAssignmentId, { ...(userId !== assignment.userId ? { userId } : {}), zoneIds: [zoneId] })
          : await assignShift({ userId, shiftId, workDate, zoneIds: [zoneId] });
        onDone(saved.fullName);
      }
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
          <dt>Status</dt><dd>{assignment.status === 'DRAFT' ? 'Draft' : 'Published'}</dd>
          {assignment.status !== 'DRAFT' && (
            <>
              <dt className={s.checkInLabel}>Check-in</dt>
              <dd className={s.checkInValue}>
                {assignment.checkInAt
                  ? <AssignmentCheckIn assignment={assignment} />
                  : <span className={s.notCheckedIn}>Not checked in</span>}
              </dd>
            </>
          )}
        </dl>
        <p className={s.info}>
          {assignment.pendingSwapRequestId
            ? 'A shift change request is pending for this assignment. Resolve it before editing.'
            : 'This shift has started or the Staff member checked in, so it can no longer be changed (BR-35).'}
        </p>
        {assignment.pendingSwapRequestId && <Link className={s.back} to={`/manager/swaps/${assignment.pendingSwapRequestId}`}>Open request</Link>}
        <div className={s.formActions}><Button variant="secondary" onClick={onClose}>Back to roster</Button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} busy={busy} onClose={onClose}>
      <form className={s.form} onSubmit={(e) => void save(e)}>
        {published && (
          <>
            <dl className={s.facts}>
              <dt>Staff</dt><dd>{assignment.fullName}</dd>
              {replacing && <><dt>Zone</dt><dd>{assignment.zones.map((zone) => zone.zoneName).join(', ') || 'No zone'}</dd></>}
            </dl>
            <div className={s.tabs}>
              <Button variant="secondary" aria-expanded={showReplacement} disabled={busy} onClick={() => {
                setShowReplacement(!showReplacement);
                setUserId(assignment.userId);
                setReason('');
                setError('');
              }}>Assign replacement</Button>
              <Button variant="secondary" aria-haspopup="dialog" disabled={busy} onClick={onSwap}>Swap two shifts</Button>
            </div>
          </>
        )}
        {showStaff && (
        <fieldset className={s.fieldset}>
          <legend>{replacing ? 'Replacement staff member' : 'Staff member'}</legend>
          {replacing && <p className={s.note}>The replacement must have the same specialty as {assignment.fullName}.</p>}
          {!options && !error && <p className={s.note} role="status">Checking who can work this shift…</p>}
          {options && sorted.length === 0 && <p className={s.note}>{replacing ? 'There are no other active Staff accounts.' : 'There are no active Staff accounts.'}</p>}
          <div className={s.options}>
            {sorted.map((o) => (
              <label key={o.userId} className={`${s.option} ${o.userId === userId ? s.selected : ''} ${o.eligible ? '' : s.blocked}`}>
                <input type="radio" name="staff" value={o.userId} checked={o.userId === userId} disabled={!o.eligible || busy}
                  onChange={() => setUserId(o.userId)} />
                <span>
                  <span className={s.optionName}>{o.fullName}</span>
                  {o.specialtyName === null && <span className={s.optionNote}> · No specialty assigned</span>}
                  {o.specialtyName && <span className={s.optionNote}> · {o.specialtyName}{o.specialtyCode && ` (${o.specialtyCode})`}</span>}
                  <span className={s.optionNote}> · {o.weeklyHoursAfter} / 48 h{(!replacing || o.eligible) && ` · ${o.weeklyHoursAfter <= 40 ? 'recommended' : 'high workload'}`}</span>
                  {o.problems.map((p) => <span key={p} className={s.optionProblem} style={{ display: 'block' }}>{p}</span>)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        )}
        {!replacing && <label>
          Zone
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={busy || zones.length === 0}>
            <option value="" disabled>Choose a zone</option>
            {zones.map((z) => <option key={z.zoneId} value={z.zoneId}>{z.name}</option>)}
          </select>
          {zones.length === 0 && <span className={s.note}>No active zones. The Administrator sets them up in Store layout.</span>}
        </label>}
        {assignment && (
          <label>
            {replacing ? 'Manager assignment reason (required)' : 'Reason if you remove this shift (optional)'}
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Emergency coverage adjustment" required={replacing} disabled={busy} />
          </label>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={assignment ? s.split : s.formActions}>
          {assignment && <Button variant="dangerGhost" disabled={busy} onClick={() => void cancel()}>Remove from shift</Button>}
          <div className={s.actions}>
            <Button variant="secondary" disabled={busy} onClick={onClose}>{assignment ? 'Back to roster' : 'Close'}</Button>
            <Button type="submit" disabled={busy || !canSave}>
              {busy ? 'Saving…' : replacing ? 'Assign cover' : assignment ? 'Save changes' : 'Add as draft'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { getSchedule, listShiftTemplates, type ScheduleView, type ShiftTemplate } from '../../api/planning';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Button, StatCard } from '../../components/ui';
import { clock, isoDate } from './dates';
import { buildStaffingOverview, loadStaffingFloors, type StaffingFloor, type StaffingState } from './zoneStaffingData';
import { useLoad } from './useLoad';
import s from './ZoneStaffing.module.css';

type Loaded = { floors: StaffingFloor[]; templates: ShiftTemplate[]; schedule: ScheduleView };

const stateClass: Record<StaffingState, string> = {
  'Checked in': s.checkedIn,
  'Draft': s.draft,
  'Published': s.published,
};

const minutes = (time: string) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

function isRunningNow(shift: ShiftTemplate, now: Date) {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(shift.startTime);
  const end = minutes(shift.endTime);
  return end > start ? current >= start && current < end : current >= start || current < end;
}

export default function ZoneStaffing() {
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [shiftId, setShiftId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [reload, setReload] = useState(0);
  const today = isoDate(new Date());
  const { data, error } = useLoad<Loaded>(`${date}|${reload}`, async (signal) => {
    const [floors, templates, schedule] = await Promise.all([
      loadStaffingFloors(signal),
      listShiftTemplates(signal),
      getSchedule(date, date, signal),
    ]);
    return { floors, templates, schedule };
  });

  const shifts = useMemo(() => {
    if (!data) return [];
    return data.templates
      .filter((shift) => shift.status === 'ACTIVE' || data.schedule.assignments.some((assignment) => assignment.status !== 'CANCELLED' && assignment.shiftId === shift.shiftId))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [data]);

  useEffect(() => {
    if (!data || shifts.some((shift) => shift.shiftId === shiftId)) return;
    const running = date === today ? shifts.find((shift) => shift.status === 'ACTIVE' && isRunningNow(shift, new Date())) : undefined;
    setShiftId(running?.shiftId ?? shifts[0]?.shiftId ?? '');
  }, [data, date, shiftId, shifts, today]);

  useEffect(() => {
    if (data && floorId && !data.floors.some((floor) => floor.floorId === floorId)) setFloorId('');
  }, [data, floorId]);

  const overview = useMemo(
    () => data && shiftId ? buildStaffingOverview(data.floors, data.schedule, shiftId, floorId) : null,
    [data, floorId, shiftId],
  );
  const selectedShift = shifts.find((shift) => shift.shiftId === shiftId);

  return (
    <ManagerLayout title="Zone staffing" subtitle="Review Staff coverage by date, shift and floor">
      <div className={s.page}>
        <section className={s.filters} aria-label="Staffing filters">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Shift</span>
            <select aria-label="Shift" value={shiftId} onChange={(event) => setShiftId(event.target.value)} disabled={!data || shifts.length === 0}>
              {shifts.length === 0 && <option value="">No shifts available</option>}
              {shifts.map((shift) => <option key={shift.shiftId} value={shift.shiftId}>{shift.name} · {clock(shift.startTime)}–{clock(shift.endTime)}</option>)}
            </select>
          </label>
          <label>
            <span>Floor</span>
            <select aria-label="Floor" value={floorId} onChange={(event) => setFloorId(event.target.value)} disabled={!data || data.floors.length === 0}>
              <option value="">All floors</option>
              {(data?.floors ?? []).map((floor) => <option key={floor.floorId} value={floor.floorId}>Floor {floor.floorNumber} · {floor.floorName}</option>)}
            </select>
          </label>
          {selectedShift && <p className={s.context}>Showing {selectedShift.name} on {date}</p>}
        </section>

        {error ? (
          <div className={s.error} role="alert">{error} <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>Retry</Button></div>
        ) : !data ? (
          <p className={s.note} role="status">Loading Zone staffing…</p>
        ) : shifts.length === 0 ? (
          <div className={s.empty}><h2>No shifts available</h2><p>Create or activate a shift in Shift setup before reviewing Zone staffing.</p></div>
        ) : overview ? (
          <>
            <div className={s.stats}>
              <StatCard label="Floors" value={String(overview.floorCount)} note="Active floors in view" tone="primary" />
              <StatCard label="Zones" value={String(overview.zoneCount)} note="Active zones in view" tone="primary" />
              <StatCard label="Assigned Staff" value={String(overview.assignedStaff)} note="Distinct Staff in this shift" tone="success" />
              <StatCard label="Coverage gaps" value={String(overview.gapCount)} note="Zones below minimum" tone={overview.gapCount ? 'danger' : 'success'} />
            </div>

            {overview.floors.length === 0 ? (
              <div className={s.empty}><h2>No active floors</h2><p>The Administrator can add floors and Zones in Store layout.</p></div>
            ) : (
              <div className={s.floorList}>
                {overview.floors.map((floor) => (
                  <section key={floor.floorId} className={s.floorCard} aria-labelledby={`floor-${floor.floorId}`}>
                    <header className={s.floorHeader}>
                      <div>
                        <p className={s.eyebrow}>Floor</p>
                        <h2 id={`floor-${floor.floorId}`}>Floor {floor.floorNumber} · {floor.floorName}</h2>
                      </div>
                      <div className={s.floorSummary}>
                        <span><strong>{floor.zoneCount}</strong> Zone{floor.zoneCount === 1 ? '' : 's'}</span>
                        <span><strong>{floor.assignedStaff}</strong> Staff</span>
                      </div>
                    </header>
                    <div className={s.zoneList}>
                      {floor.zones.map((zone) => (
                        <article key={zone.zoneId} className={s.zoneRow} data-testid={`zone-${zone.zoneId}`}>
                          <div className={s.zoneIdentity}>
                            <span className={s.branch} aria-hidden>└─</span>
                            <div>
                              <h3>{zone.zoneName}</h3>
                              <span className={s.zoneCode}>{zone.code}</span>
                            </div>
                          </div>
                          <div className={s.coverage}>
                            <strong>{zone.assigned} / {zone.minimum}</strong>
                            <span className={zone.gap ? s.gap : s.covered}>{zone.minimum === 0 ? 'No minimum' : zone.gap ? 'Needs Staff' : 'Covered'}</span>
                          </div>
                          <div className={s.people}>
                            {zone.staff.length === 0 ? <span className={s.noStaff}>No Staff assigned</span> : zone.staff.map((person) => (
                              <div key={person.userId} className={s.person}>
                                <span className={s.personName}>└─ {person.fullName}</span>
                                <span className={`${s.state} ${stateClass[person.state]}`}>{person.state}</span>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </ManagerLayout>
  );
}

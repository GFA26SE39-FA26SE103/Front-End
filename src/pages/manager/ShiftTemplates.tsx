import { useState, type FormEvent } from 'react';
import { createShiftTemplate, listShiftTemplates, updateShiftTemplate, type ShiftTemplate } from '../../api/planning';
import { Dialog } from '../../components/Dialog';
import { ManagerLayout } from '../../components/ManagerLayout';
import { Badge, Button, Card, CardHeader } from '../../components/ui';
import { clock, problem } from './dates';
import { ALLOWED_HOURS, shiftHours } from './planningData';
import { useLoad } from './useLoad';
import s from './manager.module.css';

export default function ShiftTemplates() {
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);
  const [reload, setReload] = useState(0);
  const { data: templates, error } = useLoad(String(reload),
    async (signal) => [...await listShiftTemplates(signal)].sort((a, b) => a.startTime.localeCompare(b.startTime)));

  return (
    <ManagerLayout title="Shift templates" subtitle="Shifts last 4, 6 or 8 hours (BR-33)" actions={<Button onClick={() => setEditing('new')}>New template</Button>}>
      <div className={s.page}>
        {notice && <p className={s.success} role="status">{notice}</p>}
        <Card>
          <CardHeader title="Templates" subtitle="The schedule shows one row per active template. Times are locked while someone is scheduled on the template." />
          {error ? <p className={s.error} role="alert">{error}</p>
            : !templates ? <p className={s.note} role="status">Loading templates…</p>
            : templates.length === 0 ? <p className={s.note}>No shift templates yet.</p>
            : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Name</th><th>Time</th><th>Length</th><th>Status</th><th>In use</th><th /></tr></thead>
                  <tbody>
                    {templates.map((t) => (
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
        <TemplateDialog template={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); setNotice(message); setReload((n) => n + 1); }} />
      )}
    </ManagerLayout>
  );
}

function TemplateDialog({ template, onClose, onDone }: { template: ShiftTemplate | null; onClose: () => void; onDone: (message: string) => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [start, setStart] = useState(clock(template?.startTime ?? '06:00'));
  const [end, setEnd] = useState(clock(template?.endTime ?? '14:00'));
  const [active, setActive] = useState((template?.status ?? 'ACTIVE') === 'ACTIVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hours = shiftHours(start, end);
  const lengthOk = ALLOWED_HOURS.includes(hours);
  const timesLocked = !!template?.inUse;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Give the template a name, e.g. Morning.');
    if (!lengthOk) return setError('A shift must last 4, 6 or 8 hours.');
    setBusy(true);
    setError('');
    try {
      if (template) {
        const timesChanged = clock(template.startTime) !== start || clock(template.endTime) !== end;
        await updateShiftTemplate(template.shiftId, {
          name: name.trim(),
          ...(timesChanged ? { startTime: `${start}:00`, endTime: `${end}:00` } : {}),
          status: active ? 'ACTIVE' : 'INACTIVE',
        });
        onDone(`${name.trim()} saved.`);
      } else {
        await createShiftTemplate({ name: name.trim(), startTime: `${start}:00`, endTime: `${end}:00` });
        onDone(`${name.trim()} created. It now has a row on the schedule.`);
      }
    } catch (reason) {
      setError(problem(reason));
      setBusy(false);
    }
  }

  return (
    <Dialog title={template ? `Edit ${template.name}` : 'New shift template'} busy={busy} onClose={onClose}>
      <form className={s.form} onSubmit={(e) => void save(e)}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning" disabled={busy} /></label>
        <div className={s.actions}>
          <label className={s.grow}>Start<input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy || timesLocked} /></label>
          <label className={s.grow}>End<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy || timesLocked} /></label>
        </div>
        <p className={lengthOk ? s.note : s.error}>
          {hours} hours{end <= start ? ', ends the next day' : ''}. {lengthOk ? '' : 'Choose 4, 6 or 8 hours.'}
          {timesLocked ? ' Times are locked because Staff are scheduled on this template.' : ''}
        </p>
        {template && (
          <label className={s.checkRow}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} />
            Active (inactive templates take no new assignments)
          </label>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.formActions}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : template ? 'Save' : 'Create template'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

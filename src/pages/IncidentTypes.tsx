import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createIncidentType, listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import {
  createOperationalEventType, deactivateOperationalEventType, listOperationalEventTypes, updateOperationalEventType,
  type OperationalEventType,
} from '../api/operationalEventTypes';
import { listSlaPolicies, type IncidentSlaPolicy } from '../api/slaPolicies';
import { AdminLayout } from '../components/AdminLayout';
import { Dialog } from '../components/Dialog';
import { Badge, Button, Card, CardHeader, SearchBox, Segmented } from '../components/ui';
import s from './IncidentTypes.module.css';

type StaffType = Pick<IncidentType, 'incidentTypeId' | 'code' | 'name' | 'description' | 'requiresBeforePhoto' | 'status'>;
type CatalogueType = StaffType | OperationalEventType;
type TypeDraft = {
  existing?: CatalogueType;
  code: string;
  name: string;
  description: string;
  requiresBeforePhoto: boolean;
  measurementType: string;
};
const emptyType: TypeDraft = { code: '', name: '', description: '', requiresBeforePhoto: false, measurementType: '' };
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const categories = [
  { value: 'STAFF_REPORTED', label: 'Staff incident types' },
  { value: 'OPERATIONAL_EVENT', label: 'Operational event types' },
] as const;
type Category = typeof categories[number]['value'];
const typeId = (type: CatalogueType) => 'eventTypeId' in type ? type.eventTypeId : type.incidentTypeId;

async function loadStaffCatalogue(signal?: AbortSignal): Promise<{ types: StaffType[]; policies: IncidentSlaPolicy[] }> {
  const [types, policies] = await Promise.all([listIncidentTypes(signal), listSlaPolicies(signal)]);
  return { types: types.filter(type => type.sourceType === 'STAFF_REPORTED'), policies };
}

function PolicyLink({ type, policies }: { type: CatalogueType; policies: IncidentSlaPolicy[] }) {
  if ('eventTypeId' in type) {
    return <Link className={s.policyLink} to="/admin/sla-policies?scope=event">Operational event SLA</Link>;
  }

  const matches = policies.filter(policy => policy.incidentTypeId === type.incidentTypeId);
  const [policy] = matches;
  const label = matches.length > 1 ? 'Multiple incident SLAs'
    : !policy ? 'Missing incident SLA'
      : policy.isEnabled ? `${policy.priorityCode} · Active` : 'Incident SLA disabled';
  return <Link className={s.policyLink} to="/admin/sla-policies?scope=incident" aria-label={`${label} for ${type.name}`}>{label}</Link>;
}

export default function IncidentTypes() {
  const [staff, setStaff] = useState<Awaited<ReturnType<typeof loadStaffCatalogue>>>();
  const [eventTypes, setEventTypes] = useState<OperationalEventType[]>();
  const [staffLoadError, setStaffLoadError] = useState('');
  const [eventLoadError, setEventLoadError] = useState('');
  const [category, setCategory] = useState<Category>('STAFF_REPORTED');
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState<TypeDraft>();
  const [deactivating, setDeactivating] = useState<CatalogueType>();
  const [formError, setFormError] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [updatingType, setUpdatingType] = useState<string>();
  const cameraEvents = category === 'OPERATIONAL_EVENT';
  useEffect(() => {
    const controller = new AbortController();
    void loadStaffCatalogue(controller.signal).then(data => {
      if (!controller.signal.aborted) setStaff(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setStaffLoadError(problem(cause));
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!cameraEvents || eventTypes) return;
    const controller = new AbortController();
    void listOperationalEventTypes(controller.signal).then(data => {
      if (!controller.signal.aborted) setEventTypes(data);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setEventLoadError(cause instanceof ApiError && cause.status === 404
          ? 'Operational event type management is unavailable on this backend version.'
          : problem(cause));
      }
    });
    return () => controller.abort();
  }, [cameraEvents, eventTypes]);
  const types = cameraEvents ? eventTypes : staff?.types;
  const policies = staff?.policies ?? [];
  const loadError = cameraEvents ? eventLoadError : staffLoadError;
  const visible = (types ?? []).filter(type => `${type.code} ${type.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const chosen = types?.find(type => typeId(type) === selected);
  function switchCategory(next: Category) {
    if (next === category || busy) return;
    setCategory(next);
    setSelected(undefined);
    setQuery('');
    setError('');
    setEventLoadError('');
  }
  function openEditor(type?: CatalogueType) {
    setFormError('');
    setEditor(type ? {
      existing: type, code: type.code, name: type.name, description: type.description ?? '',
      requiresBeforePhoto: 'eventTypeId' in type ? false : type.requiresBeforePhoto ?? false,
      measurementType: 'eventTypeId' in type ? type.measurementType : '',
    } : emptyType);
  }
  function applyStaffUpdate(saved: StaffType) {
    setStaff(current => current && { ...current, types: current.types.some(row => row.incidentTypeId === saved.incidentTypeId)
      ? current.types.map(row => row.incidentTypeId === saved.incidentTypeId ? saved : row)
      : [...current.types, saved].sort((a, b) => a.code.localeCompare(b.code)) });
  }
  function applyEventUpdate(saved: OperationalEventType) {
    setEventTypes(current => current && (current.some(row => row.eventTypeId === saved.eventTypeId)
      ? current.map(row => row.eventTypeId === saved.eventTypeId ? saved : row)
      : [...current, saved].sort((a, b) => a.code.localeCompare(b.code))));
  }
  async function saveType(draft: TypeDraft) {
    const { existing } = draft;
    const code = draft.code.trim();
    const name = draft.name.trim();
    const measurementType = draft.measurementType.trim();
    if (!code || !name) return setFormError('Code and name are required.');
    if (cameraEvents && !measurementType) return setFormError('Measurement type is required.');
    const fields = { name, description: draft.description.trim() || null };
    setBusy(true);
    setFormError('');
    setError('');
    try {
      if (cameraEvents) {
        if (existing && 'eventTypeId' in existing) {
          applyEventUpdate(await updateOperationalEventType(existing.eventTypeId, { ...fields, measurementType, status: existing.status }));
        } else {
          applyEventUpdate(await createOperationalEventType({ ...fields, code, measurementType, status: 'INACTIVE' }));
        }
      } else {
        const incidentFields = { ...fields, requiresBeforePhoto: draft.requiresBeforePhoto };
        if (existing && 'incidentTypeId' in existing) {
          applyStaffUpdate(await updateIncidentType(existing.incidentTypeId, {
            ...incidentFields, status: existing.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
          }));
        } else {
          applyStaffUpdate(await createIncidentType({ ...incidentFields, code, status: 'ACTIVE' }));
        }
      }
      setEditor(undefined);
    } catch (cause) { setFormError(problem(cause)); }
    finally { setBusy(false); }
  }
  async function saveAvailability(type: CatalogueType, status: OperationalEventType['status']) {
    const fields = { name: type.name, description: type.description, status };
    if ('incidentTypeId' in type) {
      applyStaffUpdate(await updateIncidentType(type.incidentTypeId, {
        ...fields, requiresBeforePhoto: type.requiresBeforePhoto ?? false,
      }));
    } else if (status === 'INACTIVE') {
      await deactivateOperationalEventType(type.eventTypeId);
      applyEventUpdate({ ...type, status });
    } else {
      applyEventUpdate(await updateOperationalEventType(type.eventTypeId, { ...fields, measurementType: type.measurementType }));
    }
  }
  function confirmDeactivation(type: CatalogueType) {
    setFormError('');
    setError('');
    setDeactivating(type);
  }
  async function deactivate(type: CatalogueType) {
    setBusy(true);
    setFormError('');
    try {
      await saveAvailability(type, 'INACTIVE');
      setDeactivating(undefined);
    } catch (cause) { setFormError(problem(cause)); }
    finally { setBusy(false); }
  }
  async function activate(type: CatalogueType) {
    setBusy(true); setError(''); setUpdatingType(typeId(type));
    try {
      await saveAvailability(type, 'ACTIVE');
    } catch (cause) { setError(problem(cause)); }
    finally { setUpdatingType(undefined); setBusy(false); }
  }
  return <AdminLayout title="Event & incident types">
    <Card className={s.list}>
      <div className={s.toolbar}>
        <Segmented value={category} options={categories} onChange={switchCategory} />
        <div className={s.actions}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search code or name" width={190} />
          <Button disabled={busy || !types} onClick={() => openEditor()}>
            {cameraEvents ? 'Add operational event type' : 'Add incident type'}
          </Button>
        </div>
      </div>
      {(loadError || error) && <p className={s.error} role="alert">{loadError || error}</p>}
      {!types && !loadError && <p className={s.muted}>Loading catalogue…</p>}
      <div className={s.tableWrap}>
        <table className={s.table} aria-label={cameraEvents ? 'Operational event types' : 'Staff incident types'}>
          <thead><tr><th scope="col">Type</th>{cameraEvents && <th scope="col">Measurement</th>}
            <th scope="col">SLA policy</th>
            <th scope="col" className={s.status}>Status</th>
            <th scope="col" className={s.action}>Action</th>
          </tr></thead>
          <tbody>{visible.map(type => {
            const isEvent = 'eventTypeId' in type;
            const active = type.status === 'ACTIVE';
            return <tr key={typeId(type)} aria-busy={updatingType === typeId(type)}>
              <td><button type="button" className={s.name} onClick={() => setSelected(typeId(type))}>
                {type.name}
                {isEvent && <small className={s.muted}>{type.code}</small>}
              </button></td>
              {isEvent && <td className={s.muted}>{type.measurementType}</td>}
              <td><PolicyLink type={type} policies={policies} /></td>
              <td className={s.status}>
                <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>
              </td>
              <td className={s.action}>
                <div className={s.rowActions}>
                  <Button variant="secondary" aria-label={`Edit ${type.name}`} disabled={busy} onClick={() => openEditor(type)}>Edit</Button>
                  {active
                    ? <Button variant="dangerGhost" aria-label={`Deactivate ${type.name}`} disabled={busy}
                      onClick={() => confirmDeactivation(type)}>Deactivate</Button>
                    : <Button variant="secondary" aria-label={`Activate ${type.name}`} disabled={busy}
                      onClick={() => void activate(type)}>Activate</Button>}
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {types && !visible.length && <p className={s.muted}>{query.trim() ? 'No types match this search.' : 'No types in this category.'}</p>}
    </Card>
    {chosen && <Card className={s.drawer}>
      <CardHeader title={chosen.name} />
      {chosen.description && <p className={s.help}>{chosen.description}</p>}
      {'eventTypeId' in chosen ? <p className={s.help}>Measurement: {chosen.measurementType}</p>
        : <p className={s.help}>Before photo: {chosen.requiresBeforePhoto ? 'Required' : 'Not required'}</p>}
      <p className={s.help}><PolicyLink type={chosen} policies={policies} /></p>
      <Button variant="secondary" onClick={() => setSelected(undefined)}>Close details</Button>
    </Card>}
    {editor && <Dialog title={cameraEvents ? (editor.existing ? 'Edit operational event type' : 'Add operational event type')
      : (editor.existing ? 'Edit staff incident type' : 'Add staff incident type')}
      busy={busy} onClose={() => setEditor(undefined)}>
      <form className={s.form} onSubmit={event => { event.preventDefault(); void saveType(editor); }}>
        <label>Code<input required maxLength={cameraEvents ? 100 : 50} readOnly={Boolean(editor.existing)} disabled={busy} value={editor.code}
          onChange={event => setEditor({ ...editor, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} /></label>
        <label>Name<input required maxLength={cameraEvents ? 200 : 120} disabled={busy} value={editor.name}
          onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        {cameraEvents && <>
          <label>Measurement type<input required maxLength={100} list="operational-measurements" disabled={busy} value={editor.measurementType}
            onChange={event => setEditor({ ...editor, measurementType: event.target.value.toUpperCase() })} /></label>
          <datalist id="operational-measurements">
            <option value="QUEUE_LENGTH" /><option value="CROWD_DENSITY" />
            <option value="WAITING_TIME" /><option value="CHECKOUT_CAPACITY" />
          </datalist>
          {!editor.existing && <p className={s.help}>New types start inactive. You can activate a type when the backend supports its code and measurement.</p>}
        </>}
        <label>Description<textarea maxLength={1000} disabled={busy} value={editor.description}
          onChange={event => setEditor({ ...editor, description: event.target.value })} /></label>
        {!cameraEvents && <label className={s.check}><input type="checkbox" disabled={busy} checked={editor.requiresBeforePhoto}
          onChange={event => setEditor({ ...editor, requiresBeforePhoto: event.target.checked })} /> Require before photo</label>}
        {formError && <p className={s.error} role="alert">{formError}</p>}
        <div className={s.actions}>
          <Button variant="secondary" disabled={busy} onClick={() => setEditor(undefined)}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editor.existing ? 'Save changes'
            : cameraEvents ? 'Create operational event type' : 'Create incident type'}</Button>
        </div>
      </form>
    </Dialog>}
    {deactivating && <Dialog title={`Deactivate ${deactivating.name}?`} busy={busy} onClose={() => setDeactivating(undefined)}>
      <div className={s.form}>
        <p>{'eventTypeId' in deactivating
          ? 'The type will become unavailable for monitoring. Existing event history stays accessible.'
          : 'Staff will no longer be able to select this type for new reports. Existing reports and incidents stay accessible.'}</p>
        {formError && <p className={s.error} role="alert">{formError}</p>}
        <div className={s.actions}>
          <Button variant="secondary" disabled={busy} onClick={() => setDeactivating(undefined)}>Cancel</Button>
          <Button variant="dangerGhost" disabled={busy} onClick={() => void deactivate(deactivating)}>
            {busy ? 'Deactivating…' : 'Deactivate type'}
          </Button>
        </div>
      </div>
    </Dialog>}
  </AdminLayout>;
}

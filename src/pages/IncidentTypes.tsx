import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createIncidentType, listIncidentTypes, updateIncidentType, type IncidentType } from '../api/monitoring';
import { listSlaPolicies, type IncidentSlaPolicy } from '../api/slaPolicies';
import { AdminLayout } from '../components/AdminLayout';
import { Dialog } from '../components/Dialog';
import { Button, Card, CardHeader, SearchBox, Segmented } from '../components/ui';
import s from './IncidentTypes.module.css';

type CatalogueType = Pick<IncidentType, 'incidentTypeId' | 'code' | 'name' | 'description' | 'requiresBeforePhoto'
  | 'status' | 'sourceType' | 'measurementType' | 'supported' | 'unsupportedReason'>;
type TypeDraft = { id?: string; code: string; name: string; description: string; requiresBeforePhoto: boolean };
const emptyType: TypeDraft = { code: '', name: '', description: '', requiresBeforePhoto: false };
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const categories = [
  { value: 'STAFF_REPORTED', label: 'Staff incident types' },
  { value: 'AI_DETECTED', label: 'Operational event types' },
] as const;
type Category = typeof categories[number]['value'];

async function loadCatalogue(signal?: AbortSignal): Promise<{ types: CatalogueType[]; policies: IncidentSlaPolicy[] }> {
  const [types, policies] = await Promise.all([listIncidentTypes(signal), listSlaPolicies(signal)]);
  return { types, policies };
}

function PolicyLink({ type, policies }: { type: CatalogueType; policies: IncidentSlaPolicy[] }) {
  if (type.sourceType === 'AI_DETECTED') {
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
  const [catalogue, setCatalogue] = useState<Awaited<ReturnType<typeof loadCatalogue>>>();
  const [category, setCategory] = useState<Category>('STAFF_REPORTED');
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState<TypeDraft>();
  const [formError, setFormError] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [updatingType, setUpdatingType] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void loadCatalogue(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalogue(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(problem(cause));
    });
    return () => controller.abort();
  }, []);
  const types = catalogue?.types;
  const policies = catalogue?.policies ?? [];
  const cameraEvents = category === 'AI_DETECTED';
  const visible = useMemo(() => (types ?? []).filter(type => type.sourceType === category
    && `${type.code} ${type.name}`.toLowerCase().includes(query.trim().toLowerCase())), [types, query, category]);
  const chosen = types?.find(type => type.incidentTypeId === selected);
  const editingType = types?.find(type => type.incidentTypeId === editor?.id);
  function switchCategory(next: Category) {
    if (next === category) return;
    setCategory(next);
    setSelected(undefined);
    setQuery('');
  }
  function openEditor(type?: CatalogueType) {
    setFormError('');
    setEditor(type ? {
      id: type.incidentTypeId, code: type.code, name: type.name,
      description: type.description ?? '', requiresBeforePhoto: type.requiresBeforePhoto ?? false,
    } : emptyType);
  }
  function applyUpdate(saved: Awaited<ReturnType<typeof updateIncidentType>>) {
    setCatalogue(current => current && {
      ...current,
      types: current.types.map(row => row.incidentTypeId === saved.incidentTypeId ? { ...row, ...saved } : row),
    });
  }
  async function saveType(draft: TypeDraft) {
    const code = draft.code.trim();
    const name = draft.name.trim();
    if (!code || !name) return setFormError('Code and name are required.');
    const fields = { name, description: draft.description.trim() || null, requiresBeforePhoto: draft.requiresBeforePhoto };
    setBusy(true);
    setFormError('');
    try {
      if (editingType) {
        applyUpdate(await updateIncidentType(editingType.incidentTypeId, {
          ...fields, status: editingType.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        }));
      } else {
        const saved = await createIncidentType({ ...fields, code, status: 'ACTIVE' });
        const created: CatalogueType = { ...saved, sourceType: 'STAFF_REPORTED', measurementType: null, supported: true, unsupportedReason: null };
        setCatalogue(current => current && {
          ...current, types: [...current.types, created].sort((a, b) => a.code.localeCompare(b.code)),
        });
      }
      setEditor(undefined);
    } catch (cause) { setFormError(problem(cause)); }
    finally { setBusy(false); }
  }
  async function toggle(type: CatalogueType, enabled: boolean) {
    setBusy(true); setError(''); setUpdatingType(type.incidentTypeId);
    try {
      applyUpdate(await updateIncidentType(type.incidentTypeId, {
        name: type.name, description: type.description, requiresBeforePhoto: type.requiresBeforePhoto ?? false,
        status: enabled ? 'ACTIVE' : 'INACTIVE',
      }));
    } catch (cause) { setError(problem(cause)); }
    finally { setUpdatingType(undefined); setBusy(false); }
  }
  return <AdminLayout title="Event & incident types">
    <Card className={s.list}>
      <div className={s.toolbar}>
        <Segmented value={category} options={categories} onChange={switchCategory} />
        <div className={s.actions}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search code or name" width={190} />
          {!cameraEvents && <Button disabled={busy || !types} onClick={() => openEditor()}>Add incident type</Button>}
        </div>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      {!types && !error && <p className={s.muted}>Loading catalogue…</p>}
      <div className={s.tableWrap}>
        <table className={s.table} aria-label={cameraEvents ? 'Operational event types' : 'Staff incident types'}>
          <thead><tr><th scope="col">Type</th>{cameraEvents && <th scope="col">Measurement</th>}
            <th scope="col">SLA policy</th><th scope="col" className={s.available}>Available</th><th scope="col" className={s.action}>Action</th>
          </tr></thead>
          <tbody>{visible.map(type => <tr key={type.incidentTypeId}>
            <td><button type="button" className={s.name} onClick={() => setSelected(type.incidentTypeId)}>
              {type.name}
            </button></td>
            {cameraEvents && <td className={s.muted}>{type.measurementType ?? '—'}</td>}
            <td><PolicyLink type={type} policies={policies} /></td>
            <td className={s.available} aria-busy={updatingType === type.incidentTypeId}>
              <input type="checkbox" aria-label={`${type.name} enabled`} checked={type.status === 'ACTIVE'} disabled={busy}
                onChange={event => void toggle(type, event.target.checked)} />
            </td>
            <td className={s.action}><Button variant="secondary" aria-label={`Edit ${type.name}`} disabled={busy}
              onClick={() => openEditor(type)}>Edit</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {types && !visible.length && <p className={s.muted}>{query.trim() ? 'No types match this search.' : 'No types in this category.'}</p>}
    </Card>
    {chosen && <Card className={s.drawer}>
      <CardHeader title={chosen.name} />
      {chosen.description && <p className={s.help}>{chosen.description}</p>}
      {cameraEvents ? <>
        {chosen.measurementType && <p className={s.help}>Measurement: {chosen.measurementType}</p>}
        {!chosen.supported && chosen.unsupportedReason && <p className={s.help}>{chosen.unsupportedReason}</p>}
      </> : <p className={s.help}>Before photo: {chosen.requiresBeforePhoto ? 'Required' : 'Not required'}</p>}
      <p className={s.help}><PolicyLink type={chosen} policies={policies} /></p>
      <Button variant="secondary" onClick={() => setSelected(undefined)}>Close details</Button>
    </Card>}
    {editor && <Dialog title={editingType ? (cameraEvents ? 'Edit operational event type' : 'Edit staff incident type') : 'Add staff incident type'}
      busy={busy} onClose={() => setEditor(undefined)}>
      <form className={s.form} onSubmit={event => { event.preventDefault(); void saveType(editor); }}>
        <label>Code<input required maxLength={50} readOnly={Boolean(editingType)} disabled={busy} value={editor.code}
          onChange={event => setEditor({ ...editor, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} /></label>
        <label>Name<input required maxLength={120} disabled={busy} value={editor.name}
          onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        <label>Description<textarea maxLength={1000} disabled={busy} value={editor.description}
          onChange={event => setEditor({ ...editor, description: event.target.value })} /></label>
        {!cameraEvents && <label className={s.check}><input type="checkbox" disabled={busy} checked={editor.requiresBeforePhoto}
          onChange={event => setEditor({ ...editor, requiresBeforePhoto: event.target.checked })} /> Require before photo</label>}
        {formError && <p className={s.error} role="alert">{formError}</p>}
        <div className={s.actions}>
          <Button variant="secondary" disabled={busy} onClick={() => setEditor(undefined)}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editingType ? 'Save changes' : 'Create incident type'}</Button>
        </div>
      </form>
    </Dialog>}
  </AdminLayout>;
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cameraUpdateRequest, updateCamera, type CameraRecord } from '../api/cameras';
import { ApiError } from '../api/client';
import { Dialog } from './Dialog';
import { Button } from './ui';
import s from './CameraEditor.module.css';

const dateInput = (value: string | null) => value ? value.slice(0, 10) : '';
const isoDate = (value: string) => new Date(`${value}T00:00:00`).toISOString();

export function CameraEditor({ camera, floorLabel, onClose, onSaved }: {
  camera: CameraRecord;
  floorLabel: string;
  onClose: () => void;
  onSaved: (camera: CameraRecord) => void;
}) {
  const [code, setCode] = useState(camera.code);
  const [name, setName] = useState(camera.name);
  const [manufacturer, setManufacturer] = useState(camera.manufacturer ?? '');
  const [model, setModel] = useState(camera.model ?? '');
  const [serial, setSerial] = useState(camera.serialNumber ?? '');
  const [installedAt, setInstalledAt] = useState(dateInput(camera.installedAt));
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(dateInput(camera.warrantyExpiresAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!code.trim()) return setError('Camera code is required.');
    if (!name.trim()) return setError('Camera name is required.');
    if (!installedAt || !warrantyExpiresAt) return setError('Installation and warranty dates are required.');
    if (warrantyExpiresAt < installedAt) return setError('Warranty date must be on or after the installation date.');

    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    try {
      const saved = await updateCamera(camera.cameraId, {
        ...cameraUpdateRequest(camera),
        code: code.trim(),
        name: name.trim(),
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serialNumber: serial.trim() || null,
        installedAt: isoDate(installedAt),
        warrantyExpiresAt: isoDate(warrantyExpiresAt),
      }, abort.signal);
      if (!abort.signal.aborted) onSaved(saved);
    } catch (reason) {
      if (!abort.signal.aborted) setError(reason instanceof ApiError && reason.code === 'DUPLICATE'
        ? 'This camera code is already in use.'
        : reason instanceof Error ? reason.message : 'Could not update the camera.');
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  return <Dialog title="Edit camera" busy={busy} onClose={onClose}>
    <form className={s.form} noValidate onSubmit={event => void save(event)}>
      <fieldset disabled={busy}>
        <label>Camera code<input aria-label="Camera code" maxLength={50} value={code} onChange={event => setCode(event.target.value)} /></label>
        <label>Camera name<input aria-label="Camera name" maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Manufacturer<input aria-label="Manufacturer" maxLength={100} value={manufacturer} onChange={event => setManufacturer(event.target.value)} /></label>
        <label>Model<input aria-label="Model" maxLength={100} value={model} onChange={event => setModel(event.target.value)} /></label>
        <label>Serial number<input aria-label="Serial number" maxLength={150} value={serial} onChange={event => setSerial(event.target.value)} /></label>
        <label>Installed date<input aria-label="Installed date" type="date" value={installedAt} onChange={event => setInstalledAt(event.target.value)} /></label>
        <label>Warranty expires<input aria-label="Warranty expires" type="date" value={warrantyExpiresAt} onChange={event => setWarrantyExpiresAt(event.target.value)} /></label>
      </fieldset>
      <p className={s.note}>Floor: <strong>{floorLabel}</strong>. Move the camera and edit its placement from Store layout.</p>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save camera'}</Button></div>
    </form>
  </Dialog>;
}

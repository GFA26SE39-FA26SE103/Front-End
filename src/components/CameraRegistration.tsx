import { useState } from 'react';
import {
  configureCameraConnection,
  createCamera,
  type CameraRecord,
} from '../api/cameras';
import { ApiError } from '../api/client';
import { Button, Field, Select, TextInput } from './ui';
import s from './CameraRegistration.module.css';

export type CameraFloorOption = { id: string; key: string; label: string };

type Props = {
  floors: CameraFloorOption[];
  onCancel: () => void;
  onRegistered: (camera: CameraRecord, recorded?: boolean) => void;
};

const dateValue = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const registrationDate = new Date();
const registrationWarrantyDate = new Date(registrationDate);
registrationWarrantyDate.setFullYear(registrationWarrantyDate.getFullYear() + 1);
const defaultInstalledAt = dateValue(registrationDate);
const defaultWarrantyExpiresAt = dateValue(registrationWarrantyDate);

export function CameraRegistration({ floors, onCancel, onRegistered }: Props) {
  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const [source, setSource] = useState('LIVE');
  const [code, setCode] = useState('');
  const [name, setName] = useState('IP Webcam');
  const [streamUrl, setStreamUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [installedAt, setInstalledAt] = useState(defaultInstalledAt);
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(defaultWarrantyExpiresAt);
  const [created, setCreated] = useState<CameraRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changeSource = (value: string) => {
    setSource(value);
    setName((current) => current === 'IP Webcam' || current === 'Recorded video'
      ? value === 'RECORDED' ? 'Recorded video' : 'IP Webcam' : current);
  };

  const submit = async () => {
    setError('');
    if (!floorId) return setError('Create a floor before registering a camera.');
    if (!code.trim()) return setError('Camera code is required.');
    if (!name.trim()) return setError('Camera name is required.');
    let parsed: URL | undefined;
    if (source === 'LIVE') {
      try {
        parsed = new URL(streamUrl.trim());
      } catch {
        return setError('Use an http:// or https:// IP Webcam URL.');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return setError('Use an http:// or https:// IP Webcam URL.');
      if (parsed.username || parsed.password) return setError('Enter camera credentials in the separate username and password fields.');
      if (parsed.search || parsed.hash) return setError('IP Webcam URL cannot contain a query string or fragment.');
      if (streamUrl.trim().length > 1000) return setError('IP Webcam URL must be 1000 characters or fewer.');
    }
    if (!installedAt || !warrantyExpiresAt || warrantyExpiresAt < installedAt) return setError('Warranty date must be on or after the installation date.');

    setSaving(true);
    let camera = created;
    try {
      camera ??= await createCamera(floorId, {
        code: code.trim(),
        name: name.trim(),
        manufacturer: null,
        model: null,
        serialNumber: null,
        installedAt: new Date(`${installedAt}T00:00:00`).toISOString(),
        warrantyExpiresAt: new Date(`${warrantyExpiresAt}T00:00:00`).toISOString(),
        mapX: null,
        mapY: null,
        mapRotationDeg: null,
        status: 'ACTIVE',
      });
      setCreated(camera);
      if (source === 'LIVE') await configureCameraConnection(camera.cameraId, {
        sourceType: 'LIVE',
        protocol: 'HTTP',
        streamUri: parsed!.toString(),
        snapshotUri: null,
        username: username.trim() || null,
        password: password || null,
      });
      onRegistered(camera, source === 'RECORDED');
    } catch (reason) {
      const detail = reason instanceof ApiError ? reason.message : 'Could not register the camera.';
      setError(camera ? `Camera exists, but its connection was not saved. Retry: ${detail}` : detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={s.form} aria-label="Add camera" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className={s.heading}>
        <div><h3>Add camera</h3><p>{source === 'LIVE' ? 'Use the /video stream URL from IP Webcam.' : 'Register the camera, then upload an MP4 as its source.'}</p></div>
        <Button variant="secondary" onClick={onCancel} disabled={saving || Boolean(created)}>Cancel</Button>
      </div>
      <div className={s.grid}>
        <Field label="Camera source"><Select value={source} onChange={changeSource} disabled={saving || Boolean(created)} options={[{ value: 'LIVE', label: 'IP Webcam (live)' }, { value: 'RECORDED', label: 'Uploaded video (test source)' }]} /></Field>
        <Field label="Floor"><Select value={floorId} onChange={setFloorId} disabled={saving || Boolean(created)} options={floors.map((floor) => ({ value: floor.id, label: `${floor.key} · ${floor.label}` }))} /></Field>
        <Field label="Camera code"><TextInput value={code} onChange={setCode} placeholder="CAM-PHONE" disabled={saving || Boolean(created)} /></Field>
        <Field label="Camera name"><TextInput value={name} onChange={setName} disabled={saving || Boolean(created)} /></Field>
        {source === 'LIVE' && <>
          <Field label="IP Webcam URL"><TextInput value={streamUrl} onChange={setStreamUrl} disabled={saving} placeholder="http://192.168.1.25:8080/video" /></Field>
          <Field label="Username (optional)"><TextInput value={username} onChange={setUsername} disabled={saving} autoComplete="section-camera username" /></Field>
          <Field label="Password (optional)"><TextInput value={password} onChange={setPassword} disabled={saving} type="password" autoComplete="section-camera new-password" /></Field>
        </>}
        <Field label="Installed date"><TextInput value={installedAt} onChange={setInstalledAt} type="date" disabled={saving || Boolean(created)} /></Field>
        <Field label="Warranty expires"><TextInput value={warrantyExpiresAt} onChange={setWarrantyExpiresAt} type="date" disabled={saving || Boolean(created)} /></Field>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><Button type="submit" disabled={saving || floors.length === 0}>{saving ? 'Saving…' : created ? 'Retry connection' : 'Save camera'}</Button></div>
    </form>
  );
}

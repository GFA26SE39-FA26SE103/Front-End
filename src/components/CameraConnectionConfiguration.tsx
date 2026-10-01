import { useState } from 'react';
import { configureCameraConnection } from '../api/cameras';
import { ApiError } from '../api/client';
import { Button, Field, TextInput } from './ui';
import s from './CameraRegistration.module.css';

type Props = {
  cameraId: string;
  onCancel: () => void;
  onSaved: () => void;
};

export function CameraConnectionConfiguration({ cameraId, onCancel, onSaved }: Props) {
  const [streamUrl, setStreamUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    let parsed: URL;
    try {
      parsed = new URL(streamUrl.trim());
    } catch {
      return setError('Use an http:// or https:// IP Webcam URL.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return setError('Use an http:// or https:// IP Webcam URL.');
    if (parsed.username || parsed.password) return setError('Enter camera credentials in the separate username and password fields.');
    if (parsed.search || parsed.hash) return setError('IP Webcam URL cannot contain a query string or fragment.');
    if (streamUrl.trim().length > 1000) return setError('IP Webcam URL must be 1000 characters or fewer.');

    setSaving(true);
    try {
      await configureCameraConnection(cameraId, {
        sourceType: 'LIVE',
        protocol: 'HTTP',
        streamUri: parsed.toString(),
        snapshotUri: null,
        username: username.trim() || null,
        password: password || null,
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Could not save the camera connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={s.form} aria-label="Configure camera connection" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className={s.heading}>
        <div><h3>Configure IP Webcam connection</h3><p>Saving replaces the current stream details and credentials.</p></div>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
      <div className={s.grid}>
        <Field label="IP Webcam URL"><TextInput value={streamUrl} onChange={setStreamUrl} placeholder="http://192.168.1.25:8080/video" /></Field>
        <Field label="Username (optional)"><TextInput value={username} onChange={setUsername} autoComplete="section-camera username" /></Field>
        <Field label="Password (optional)"><TextInput value={password} onChange={setPassword} type="password" autoComplete="section-camera new-password" /></Field>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save connection'}</Button></div>
    </form>
  );
}

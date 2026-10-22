import { useEffect, useState } from 'react';
import { configureCameraConnection, getCameraConnection } from '../api/cameras';
import { ApiError } from '../api/client';
import { Dialog } from './Dialog';
import { Button, Field, TextInput } from './ui';
import s from './CameraRegistration.module.css';

type Props = {
  cameraId: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
};

export function CameraConnectionConfiguration({ cameraId, onCancel, onSaved }: Props) {
  const [streamUrl, setStreamUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [removeStoredPassword, setRemoveStoredPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void getCameraConnection(cameraId, controller.signal)
      .then((current) => {
        if (controller.signal.aborted) return;
        setStreamUrl(current.streamUri);
        setUsername(current.username ?? '');
        setHasStoredPassword(current.hasCredentials);
      })
      .catch((reason) => {
        if (controller.signal.aborted || reason instanceof ApiError && reason.status === 404) return;
        setError(reason instanceof Error ? reason.message : 'Could not load the current camera connection.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cameraId]);

  const submit = async () => {
    setError('');
    let parsed: URL;
    try {
      parsed = new URL(streamUrl.trim());
    } catch {
      return setError('Use an http://, https://, or rtsp:// stream URL.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'rtsp:') return setError('Use an http://, https://, or rtsp:// stream URL.');
    if (parsed.username || parsed.password) return setError('Enter camera credentials in the separate username and password fields.');
    if (parsed.search || parsed.hash) return setError('Stream URL cannot contain a query string or fragment.');
    if (streamUrl.trim().length > 1000) return setError('Stream URL must be 1000 characters or fewer.');

    setSaving(true);
    try {
      await configureCameraConnection(cameraId, {
        sourceType: 'LIVE',
        protocol: parsed.protocol === 'rtsp:' ? 'RTSP' : 'HTTP',
        streamUri: parsed.toString(),
        snapshotUri: null,
        username: username.trim() || null,
        password: removeStoredPassword ? null : password || null,
        preservePassword: hasStoredPassword && !removeStoredPassword && password.length === 0,
      });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Could not save the camera connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Configure camera connection" busy={saving || loading} onClose={onCancel}>
      <form className={s.dialogForm} aria-label="Configure camera connection" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className={s.dialogIntro}>Review the current HTTP/HTTPS or RTSP source. The saved password is never displayed.</p>
        <div className={s.grid}>
          <Field label="Stream URL"><TextInput value={streamUrl} onChange={setStreamUrl} disabled={loading} placeholder="rtsp://192.168.1.198:554/stream2" /></Field>
          <Field label="Username (optional)"><TextInput value={username} onChange={setUsername} disabled={loading} autoComplete="section-camera username" /></Field>
          <Field label={hasStoredPassword ? 'New password (optional)' : 'Password (optional)'}><TextInput value={password} onChange={(value) => { setPassword(value); if (value) setRemoveStoredPassword(false); }} disabled={loading || removeStoredPassword} type="password" autoComplete="section-camera new-password" /></Field>
        </div>
        {hasStoredPassword && <div className={s.credentialNote}>
          <span>Leave the new password blank to keep the stored password.</span>
          <label><input type="checkbox" checked={removeStoredPassword} disabled={saving} onChange={(event) => { setRemoveStoredPassword(event.target.checked); setPassword(''); }} /> Remove stored password</label>
        </div>}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || loading}>{loading ? 'Loading…' : saving ? 'Saving…' : 'Save connection'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState } from 'react';
import { uploadRecordedVideo } from '../api/cameras';
import { Button } from './ui';
import s from './CameraRegistration.module.css';

type Props = {
  cameraId: string;
  onCancel: () => void;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
};

export function RecordedVideoUpload({ cameraId, onCancel, onSaved, onBusy }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!file || !file.name.toLowerCase().endsWith('.mp4')) return setError('Choose an MP4 video.');
    if (!file.size || file.size > 200 * 1024 * 1024) return setError('Choose a non-empty video of at most 200 MB.');
    setSaving(true);
    onBusy(true);
    try {
      await uploadRecordedVideo(cameraId, file);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Video upload failed.');
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  return (
    <form className={s.form} aria-label="Upload recorded video" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className={s.heading}><div><h3>Upload video as camera source</h3><p>MP4 · maximum 200 MB. Processing starts only when you start AI preview.</p></div></div>
      <p>This replaces the current source and resets its connection test. Existing zone mappings remain: review their ROI if the scene changes. Deactivate monitoring before replacing its source.</p>
      <label>Video file <input type="file" accept=".mp4,video/mp4" disabled={saving} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancel upload</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Uploading & validating…' : 'Save video source'}</Button>
      </div>
    </form>
  );
}

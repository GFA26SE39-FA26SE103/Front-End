import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { getEvidenceImage, getTaskEvidence, rejectTask, verifyTask, type EvidencePhoto, type OperationalTask, type TaskEvidence, type TaskSubmission } from '../../api/tasks';
import { Button, Card, CardHeader, Chip } from '../../components/ui';
import s from './OperatorTasks.module.css';

const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
const problem = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const photoLabel = { BEFORE_PHOTO: 'Before', AFTER_PHOTO: 'After' } as const;
const reviewTone = { PENDING: 'purple', VERIFIED: 'success', REJECTED: 'danger' } as const;
const reviewLabel = { PENDING: 'Waiting for review', VERIFIED: 'Verified', REJECTED: 'Rejected' } as const;

/** A stored photo; the image route needs the session token, so it is loaded as a blob. */
function EvidenceThumb({ photo }: { photo: EvidencePhoto }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void getEvidenceImage(photo.imageUrl, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.imageUrl]);
  return <figure className={s.photo}>
    {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${photoLabel[photo.evidenceType]} photo`} /></a>
      : <div className={s.photoPlaceholder}>{failed ? 'Photo unavailable' : 'Loading photo…'}</div>}
    <figcaption>{photoLabel[photo.evidenceType]} · {date(photo.capturedAt)}</figcaption>
  </figure>;
}

function Submission({ submission }: { submission: TaskSubmission }) {
  return <div className={s.submission}>
    <div className={s.badges}><Chip tone={reviewTone[submission.reviewStatus]}>{reviewLabel[submission.reviewStatus]}</Chip>
      <span className={s.muted}>{submission.submittedByName ?? 'Staff'} · {date(submission.submittedAt)}</span></div>
    <p className={s.instructions}>{submission.note}</p>
    {submission.photos.length > 0 ? <div className={s.photos}>{submission.photos.map(photo => <EvidenceThumb key={photo.evidenceId} photo={photo} />)}</div>
      : <p className={s.muted}>No photos attached.</p>}
    {submission.rejectReason && <p className={s.error}>Rejection reason: {submission.rejectReason}</p>}
  </div>;
}

/**
 * Report 3 Figure 21 Operator Evidence Verification: the pending completion record with its before/after photos and
 * Verify / Reject controls, plus earlier submissions. The performer cannot verify their own work (BR-27).
 */
export function TaskVerification({ task, canReview, onDecided }: { task: OperationalTask; canReview: boolean; onDecided: (message: string) => void }) {
  const [evidence, setEvidence] = useState<TaskEvidence>();
  const [loadError, setLoadError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getTaskEvidence(task.taskId, controller.signal).then(next => {
      if (!controller.signal.aborted) { setEvidence(next); setLoadError(''); }
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(problem(cause)); });
    return () => controller.abort();
  }, [task.taskId, task.updatedAt]);

  if (loadError) return <Card><CardHeader title="Evidence" /><p className={s.error} role="alert">{loadError}</p></Card>;
  if (!evidence) return <Card><CardHeader title="Evidence" /><p className={s.message} role="status">Loading evidence…</p></Card>;

  const pending = task.status === 'SUBMITTED' ? evidence.submissions.find(x => x.reviewStatus === 'PENDING') : undefined;
  const earlier = evidence.submissions.filter(x => x !== pending);
  const has = (type: EvidencePhoto['evidenceType']) => !!pending?.photos.some(p => p.evidenceType === type);
  const missing = [evidence.requiresBeforePhoto && !has('BEFORE_PHOTO') && 'before photo', evidence.requiresAfterPhoto && !has('AFTER_PHOTO') && 'after photo'].filter(Boolean);
  const priorRejections = pending ? evidence.submissions.filter(x => x.reviewStatus === 'REJECTED' && x.submittedByUserId === pending.submittedByUserId).length : 0;

  async function decide(action: 'verify' | 'reject') {
    if (action === 'reject' && !reason.trim()) return setError('Write why the work is rejected so the Staff member can fix it.');
    setBusy(true); setError('');
    try {
      const result = action === 'verify' ? await verifyTask(task.taskId, task.updatedAt) : await rejectTask(task.taskId, reason.trim(), task.updatedAt);
      setEvidence(result.evidence); setRejecting(false); setReason('');
      onDecided(action === 'verify' ? 'Task verified.' : result.status === 'OFFERED'
        ? 'Rejected twice: the task now needs a different Staff member. Assign it below.'
        : 'Task returned to the Staff member for rework.');
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'TASK_CHANGED' ? 'This task changed while you were reviewing. Refresh it and review again.' : problem(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!pending && earlier.length === 0) return null;
  return <Card>
    <CardHeader title={pending ? 'Evidence verification' : 'Submissions'} subtitle={pending ? 'Check the completion record before verifying' : 'Completion records and review decisions'} />
    {pending && <>
      <div className={s.badges}>
        {evidence.requiresBeforePhoto && <Chip tone={has('BEFORE_PHOTO') ? 'success' : 'danger'}>Before photo required</Chip>}
        {evidence.requiresAfterPhoto && <Chip tone={has('AFTER_PHOTO') ? 'success' : 'danger'}>After photo required</Chip>}
        {!evidence.requiresBeforePhoto && !evidence.requiresAfterPhoto && <Chip tone="neutral">Completion note required · photos optional</Chip>}
      </div>
      <Submission submission={pending} />
      {missing.length > 0 && <p className={s.error}>Missing {missing.join(' and ')}. Reject the submission so the Staff member can add it.</p>}
      {priorRejections > 0 && <p className={s.info}>This Staff member's work was rejected {priorRejections === 1 ? 'once' : `${priorRejections} times`} before. Another rejection sends the task to a different Staff member.</p>}
      {canReview ? <>
        {rejecting && <label className={s.form}>Rejection reason (required)<textarea rows={3} maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="What still needs to be done?" /></label>}
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          {rejecting ? <>
            <Button variant="secondary" disabled={busy} onClick={() => { setRejecting(false); setError(''); }}>Cancel</Button>
            <Button variant="dangerGhost" disabled={busy} onClick={() => void decide('reject')}>{busy ? 'Rejecting…' : 'Confirm rejection'}</Button>
          </> : <>
            <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
            <Button disabled={busy || missing.length > 0} onClick={() => void decide('verify')}>{busy ? 'Verifying…' : 'Verify task'}</Button>
          </>}
        </div>
      </> : <p className={s.muted}>Verification requires an Operator account.</p>}
    </>}
    {earlier.length > 0 && <div className={s.stack}>{pending && <h3 className={s.subheading}>Earlier submissions</h3>}
      {earlier.map(x => <Submission key={x.submissionId} submission={x} />)}</div>}
  </Card>;
}

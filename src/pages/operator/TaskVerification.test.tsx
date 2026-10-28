import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { getEvidenceImage, getTaskEvidence, rejectTask, verifyTask, type OperationalTask, type TaskEvidence } from '../../api/tasks';
import { TaskVerification } from './TaskVerification';
vi.mock('../../api/tasks', () => ({ getTaskEvidence: vi.fn(), getEvidenceImage: vi.fn(), verifyTask: vi.fn(), rejectTask: vi.fn() }));

const task: OperationalTask = {
  taskId: 'task-1', origin: 'INCIDENT', sourceCode: 'INC-12345678', eventTypeCode: null,
  title: 'Clean spill at entrance', instructions: null, priority: 'WARNING', raisedFrom: null,
  zoneId: 'zone-1', zoneName: 'Entrance', cameraCode: null, status: 'SUBMITTED', assignmentType: 'OFFER',
  assigneeUserId: 'staff-1', assigneeName: 'Linh', createdAt: '2026-10-25T04:00:00Z', assignedAt: '2026-10-25T04:01:00Z',
  acceptedAt: '2026-10-25T04:01:00Z', plannedStartAt: null, startedAt: '2026-10-25T04:02:00Z', submittedAt: '2026-10-25T04:20:00Z',
  eventClearedAt: null, needsAssignment: false, updatedAt: '2026-10-25T04:20:00Z',
};
const photo = (id: string, type: 'BEFORE_PHOTO' | 'AFTER_PHOTO') => ({ evidenceId: id, evidenceType: type, imageUrl: `/api/tasks/task-1/evidence/${id}/image`, capturedAt: '2026-10-25T04:15:00Z' });
const evidence = (photos = [photo('ev-1', 'BEFORE_PHOTO'), photo('ev-2', 'AFTER_PHOTO')], earlier: TaskEvidence['submissions'] = []): TaskEvidence => ({
  taskId: 'task-1', taskStatus: 'SUBMITTED', requiresBeforePhoto: true, requiresAfterPhoto: true, rejectionCount: earlier.length, drafts: [],
  submissions: [{ submissionId: 'sub-2', submittedByUserId: 'staff-1', submittedByName: 'Linh', note: 'Mopped and dried the floor', submittedAt: '2026-10-25T04:20:00Z',
    reviewStatus: 'PENDING', rejectReason: null, photos }, ...earlier],
});
const result = (status: OperationalTask['status']) => ({ taskId: 'task-1', status, submittedAt: null, verifiedAt: null, rejectionCount: 1, assigneeUserId: null, updatedAt: 'later', evidence: evidence() });

describe('Operator evidence verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEvidenceImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows the note and photos, then verifies with the version the Operator reviewed', async () => {
    const user = userEvent.setup(); const decided = vi.fn();
    vi.mocked(getTaskEvidence).mockResolvedValue(evidence());
    vi.mocked(verifyTask).mockResolvedValue(result('VERIFIED'));
    render(<TaskVerification task={task} canReview onDecided={decided} />);

    expect(await screen.findByText('Mopped and dried the floor')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Before photo' })).toHaveAttribute('src', 'blob:photo');
    expect(screen.getByRole('img', { name: 'After photo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify task' }));
    expect(verifyTask).toHaveBeenCalledWith('task-1', task.updatedAt);
    expect(decided).toHaveBeenCalledWith('Task verified.');
  });

  it('requires a reason to reject and warns before the rejection that reassigns the task', async () => {
    const user = userEvent.setup(); const decided = vi.fn();
    const earlier = [{ submissionId: 'sub-1', submittedByUserId: 'staff-1', submittedByName: 'Linh', note: 'Mopped', submittedAt: '2026-10-25T04:10:00Z',
      reviewStatus: 'REJECTED' as const, rejectReason: 'Still wet', photos: [] }];
    vi.mocked(getTaskEvidence).mockResolvedValue(evidence(undefined, earlier));
    vi.mocked(rejectTask).mockResolvedValue(result('OFFERED'));
    render(<TaskVerification task={task} canReview onDecided={decided} />);

    expect(await screen.findByText(/rejected once before/)).toBeInTheDocument();
    expect(screen.getByText('Rejection reason: Still wet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write why the work is rejected');
    expect(rejectTask).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Rejection reason/), 'Floor is still wet');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(rejectTask).toHaveBeenCalledWith('task-1', 'Floor is still wet', task.updatedAt);
    expect(decided).toHaveBeenCalledWith(expect.stringContaining('different Staff member'));
  });

  it('blocks verification when a required photo is missing and shows server conflicts', async () => {
    const user = userEvent.setup();
    vi.mocked(getTaskEvidence).mockResolvedValue(evidence([photo('ev-2', 'AFTER_PHOTO')]));
    render(<TaskVerification task={task} canReview onDecided={vi.fn()} />);
    expect(await screen.findByText(/Missing before photo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify task' })).toBeDisabled();

    vi.mocked(rejectTask).mockRejectedValue(new ApiError(409, 'TASK_CHANGED', 'changed'));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(screen.getByLabelText(/Rejection reason/), 'Add the before photo');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This task changed while you were reviewing'));
  });

  it('lets a Manager read submissions without review controls', async () => {
    vi.mocked(getTaskEvidence).mockResolvedValue(evidence());
    render(<TaskVerification task={task} canReview={false} onDecided={vi.fn()} />);
    expect(await screen.findByText('Verification requires an Operator account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify task' })).not.toBeInTheDocument();
  });
});

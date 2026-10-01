import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import {
  getAiPreviewFrame,
  getAiPreviewStatus,
  startAiPreview,
  stopAiPreview,
} from '../api/cameras';
import { AnnotatedPreview } from './AnnotatedPreview';

vi.mock('../api/cameras', () => ({
  startAiPreview: vi.fn(),
  getAiPreviewStatus: vi.fn(),
  getAiPreviewFrame: vi.fn(),
  stopAiPreview: vi.fn(),
}));

const start = vi.mocked(startAiPreview);
const status = vi.mocked(getAiPreviewStatus);
const frame = vi.mocked(getAiPreviewFrame);
const stop = vi.mocked(stopAiPreview);

const live = (cameraId = 'camera-a') => ({
  cameraId,
  state: 'LIVE' as const,
  startedAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:01Z',
  frameSequence: 1,
  errorCode: null,
});

describe('AnnotatedPreview', () => {
  let urlIndex = 0;

  beforeEach(() => {
    urlIndex = 0;
    start.mockResolvedValue(live());
    status.mockResolvedValue(live());
    frame.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    stop.mockResolvedValue({ ...live(), state: 'STOPPED' });
    URL.createObjectURL = vi.fn(() => `blob:frame-${++urlIndex}`);
    URL.revokeObjectURL = vi.fn();
  });

  it('polls status and frames only while active', async () => {
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled={false} pollInterval={5} />);
    expect(start).not.toHaveBeenCalled();

    view.rerender(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);

    await waitFor(() => expect(frame).toHaveBeenCalled());
    expect(start).toHaveBeenCalledWith('camera-a');
    expect(status).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /tracked preview/i })).toBeInTheDocument();
  });

  it('revokes the previous blob URL after replacement', async () => {
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);

    await waitFor(() => expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBeGreaterThanOrEqual(2));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame-1');
  });

  it('aborts requests and revokes the final URL on unmount', async () => {
    let observedSignal: AbortSignal | undefined;
    frame.mockImplementation(async (_cameraId, signal) => {
      observedSignal = signal;
      return new Blob(['jpeg'], { type: 'image/jpeg' });
    });
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={50} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    view.unmount();

    expect(observedSignal?.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame-1');
    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a'));
  });

  it('stops the old camera before switching selection', async () => {
    const calls: string[] = [];
    let finishStop!: () => void;
    start.mockImplementation(async (id) => { calls.push(`start:${id}`); return live(id); });
    stop.mockImplementation((id) => {
      calls.push(`stop:${id}`);
      return new Promise((resolve) => {
        finishStop = () => resolve({ ...live(id), state: 'STOPPED' });
      });
    });
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={20} />);
    await waitFor(() => expect(calls).toContain('start:camera-a'));

    view.rerender(<AnnotatedPreview cameraId="camera-b" enabled pollInterval={20} />);
    await waitFor(() => expect(calls).toContain('stop:camera-a'));
    expect(calls).not.toContain('start:camera-b');
    finishStop();
    await waitFor(() => expect(calls).toContain('start:camera-b'));

    expect(calls.indexOf('stop:camera-a')).toBeLessThan(calls.indexOf('start:camera-b'));
  });

  it('discards a frame that resolves after preview cleanup', async () => {
    let finishFrame!: (blob: Blob) => void;
    frame.mockImplementation(() => new Promise((resolve) => { finishFrame = resolve; }));
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={20} />);
    await waitFor(() => expect(frame).toHaveBeenCalled());

    view.rerender(<AnnotatedPreview cameraId="camera-a" enabled={false} pollInterval={20} />);
    finishFrame(new Blob(['late-jpeg'], { type: 'image/jpeg' }));

    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a'));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('waits for an in-flight start before sending cleanup stop', async () => {
    let finishStart!: () => void;
    start.mockImplementation(() => new Promise((resolve) => {
      finishStart = () => resolve(live());
    }));
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={20} />);
    await waitFor(() => expect(start).toHaveBeenCalled());

    view.unmount();
    expect(stop).not.toHaveBeenCalled();
    finishStart();

    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a'));
  });

  it('renders unauthorized and no-frame states', async () => {
    start.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    const first = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    expect(await screen.findByText('Session expired')).toBeInTheDocument();
    first.unmount();

    start.mockResolvedValue(live());
    status.mockResolvedValue(live());
    frame.mockRejectedValue(new ApiError(503, 'AI_FRAME_NOT_READY', 'Not ready'));
    render(<AnnotatedPreview cameraId="camera-b" enabled pollInterval={5} />);

    expect(await screen.findByText('Waiting for first tracked frame…')).toBeInTheDocument();
  });
});

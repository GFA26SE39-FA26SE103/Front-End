import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const sessionA = '00000000-0000-0000-0000-000000000001';
const sessionB = '00000000-0000-0000-0000-000000000002';
const leaseA = '00000000-0000-0000-0000-0000000000a1';
const leaseB = '00000000-0000-0000-0000-0000000000b2';

const live = (cameraId = 'camera-a', viewerLeaseId = leaseA) => ({
  cameraId,
  state: 'LIVE' as const,
  startedAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:01Z',
  frameSequence: 1,
  errorCode: null,
  viewerLeaseId,
});

describe('AnnotatedPreview', () => {
  let urlIndex = 0;

  beforeEach(() => {
    urlIndex = 0;
    start.mockResolvedValue(live());
    status.mockResolvedValue(live());
    let delivered = false;
    frame.mockImplementation(async () => {
      if (delivered) return null;
      delivered = true;
      return { blob: new Blob(['jpeg'], { type: 'image/jpeg' }), frameSequence: 1, sessionId: sessionA };
    });
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

  it('keeps the previous decoded frame until the replacement image loads', async () => {
    let sequence = 0;
    frame.mockImplementation(async () => sequence < 2
      ? { blob: new Blob(['jpeg'], { type: 'image/jpeg' }), frameSequence: ++sequence, sessionId: sessionA }
      : null);
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);

    await waitFor(() => expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:frame-1');
    fireEvent.load(screen.getByRole('img', { name: /tracked preview/i }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame-1');
  });

  it('requests the next sequence without redrawing a duplicate frame', async () => {
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    await waitFor(() => expect(frame.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(frame.mock.calls[1][3]).toBe(1);
    expect(frame.mock.calls[1][4]).toBe(sessionA);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('draws zone ROIs while using the selected zone confidence', async () => {
    const regions = [{ id: 'm1', label: 'Checkout', color: '#F97316', points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.6 }] }];
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={50} zoneId="zone-checkout" regions={regions} />);
    const image = await screen.findByRole('img', { name: /tracked preview/i });
    expect(start).toHaveBeenCalledWith('camera-a', undefined, 'zone-checkout');
    expect(screen.queryByTestId('roi-overlay')).not.toBeInTheDocument();

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1280 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 720 });
    fireEvent.load(image);

    const overlay = await screen.findByTestId('roi-overlay');
    expect(overlay).toHaveAttribute('viewBox', '0 0 1280 720');
    expect(overlay.querySelector('polygon')).toHaveAttribute('points', '128,144 640,144 640,432');
    expect(overlay).toHaveTextContent('Checkout');
  });

  it('keeps the final annotated frame and stops polling at recorded-video completion', async () => {
    status.mockResolvedValue({ ...live(), state: 'COMPLETED' });
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    expect(await screen.findByText(/Video completed/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(status).toHaveBeenCalledTimes(1);
    expect(frame).toHaveBeenCalledTimes(1);
    view.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it('does not offer viewer restart to replay backend-owned monitoring', async () => {
    start.mockResolvedValue({ ...live(), purpose: 'MONITORING', annotationContext: 'confidence:0.7' });
    status.mockResolvedValue({ ...live(), state: 'COMPLETED', purpose: 'MONITORING', annotationContext: 'confidence:0.7' });
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    expect(await screen.findByText(/Deactivate → Activate/)).toBeInTheDocument();
    expect(screen.getByText(/confidence:0.7/)).toBeInTheDocument();
    expect(screen.queryByText(/Stop then start/)).not.toBeInTheDocument();
  });

  it('waits for the worker when an attached monitoring session has not started yet', async () => {
    start.mockResolvedValue({ ...live(), state: 'STARTING', purpose: 'MONITORING' });
    status.mockResolvedValueOnce({ ...live(), state: 'STOPPED' }).mockResolvedValue(live());
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(status.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('refreshes session status when a frame request races a restart', async () => {
    frame.mockRejectedValueOnce(new ApiError(409, 'AI_PREVIEW_NOT_RUNNING', 'Not running'))
      .mockResolvedValueOnce({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), frameSequence: 1, sessionId: sessionB });
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    expect(await screen.findByRole('img', { name: /tracked preview/i })).toBeInTheDocument();
    expect(status.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('aborts requests and revokes the final URL on unmount', async () => {
    let observedSignal: AbortSignal | undefined;
    frame.mockImplementation(async (_cameraId, _viewerLeaseId, signal) => {
      observedSignal = signal;
      return { blob: new Blob(['jpeg'], { type: 'image/jpeg' }), frameSequence: 1, sessionId: sessionA };
    });
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={50} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    view.unmount();

    expect(observedSignal?.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame-1');
    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a', leaseA));
  });

  it('stops the old camera before switching selection', async () => {
    const calls: string[] = [];
    let finishStop!: () => void;
    start.mockImplementation(async (id) => { calls.push(`start:${id}`); return live(id); });
    stop.mockImplementation((id, lease) => {
      calls.push(`stop:${id}:${lease}`);
      return new Promise((resolve) => {
        finishStop = () => resolve({ ...live(id), state: 'STOPPED' });
      });
    });
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={20} />);
    await waitFor(() => expect(calls).toContain('start:camera-a'));

    view.rerender(<AnnotatedPreview cameraId="camera-b" enabled pollInterval={20} />);
    await waitFor(() => expect(calls).toContain(`stop:camera-a:${leaseA}`));
    expect(calls).not.toContain('start:camera-b');
    finishStop();
    await waitFor(() => expect(calls).toContain('start:camera-b'));

    expect(calls.indexOf(`stop:camera-a:${leaseA}`)).toBeLessThan(calls.indexOf('start:camera-b'));
  });

  it('discards a frame that resolves after preview cleanup', async () => {
    let finishFrame!: (value: { blob: Blob; frameSequence: number; sessionId: string }) => void;
    frame.mockImplementation(() => new Promise((resolve) => { finishFrame = resolve; }));
    const view = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={20} />);
    await waitFor(() => expect(frame).toHaveBeenCalled());

    view.rerender(<AnnotatedPreview cameraId="camera-a" enabled={false} pollInterval={20} />);
    finishFrame({ blob: new Blob(['late-jpeg'], { type: 'image/jpeg' }), frameSequence: 1, sessionId: sessionA });

    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a', leaseA));
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

    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a', leaseA));
  });

  it('isolates two viewers of the same camera and releases only the unmounted lease', async () => {
    start.mockResolvedValueOnce(live('camera-a', leaseA)).mockResolvedValueOnce(live('camera-a', leaseB));
    status.mockImplementation(async (_cameraId, viewerLeaseId) => live('camera-a', viewerLeaseId));
    const first = render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);
    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(status.mock.calls.some((call) => call[1] === leaseB)).toBe(true));
    first.unmount();

    await waitFor(() => expect(stop).toHaveBeenCalledWith('camera-a', leaseA));
    expect(stop).not.toHaveBeenCalledWith('camera-a', leaseB);
    await waitFor(() => expect(status.mock.calls.filter((call) => call[1] === leaseB).length).toBeGreaterThan(1));
  });

  it('reattaches once after viewer lease expiry and resets frame generation', async () => {
    start.mockResolvedValueOnce(live('camera-a', leaseA)).mockResolvedValueOnce(live('camera-a', leaseB));
    status.mockRejectedValueOnce(new ApiError(409, 'AI_VIEWER_LEASE_EXPIRED', 'Expired'))
      .mockResolvedValue(live('camera-a', leaseB));

    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(frame.mock.calls.some((call) => call[1] === leaseB && call[3] === 0 && call[4] === null)).toBe(true));
  });

  it('retries monitoring start pending without inventing a lease', async () => {
    start.mockRejectedValueOnce(new ApiError(409, 'AI_MONITORING_START_PENDING', 'Pending'))
      .mockResolvedValueOnce(live('camera-a', leaseA));

    render(<AnnotatedPreview cameraId="camera-a" enabled pollInterval={5} />);

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('img', { name: /tracked preview/i })).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalledWith('camera-a', expect.anything());
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

  it('explains why a Draft preview cannot restart active monitoring', async () => {
    start.mockRejectedValue(new ApiError(409, 'AI_SESSION_MONITORING_OWNED', 'Deactivate monitoring first.'));
    render(<AnnotatedPreview cameraId="camera-a" zoneId="draft-zone" enabled />);
    expect(await screen.findByText(/used by active monitoring in this or another Zone/)).toBeInTheDocument();
  });
});

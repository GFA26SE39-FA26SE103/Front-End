import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecordedVideoUpload } from './RecordedVideoUpload';

describe('RecordedVideoUpload', () => {
  it('sends the selected MP4 as multipart and waits for validation before saving', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ cameraId: 'camera-a', sourceType: 'RECORDED', protocol: 'FILE' })));
    const saved = vi.fn();
    const busy = vi.fn();
    const user = userEvent.setup();
    render(<RecordedVideoUpload cameraId="camera-a" onSaved={saved} onCancel={() => undefined} onBusy={busy} />);
    const file = new File(['video'], 'sample.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByLabelText('Video file'), file);
    await user.click(screen.getByRole('button', { name: 'Save video source' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/cameras/camera-a/recorded-video');
    expect(init?.method).toBe('POST');
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });

  it('rejects empty video locally and displays backend decode errors without claiming success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'STREAM_UNAVAILABLE', detail: 'No video frame was decoded.' }), { status: 422 }));
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<RecordedVideoUpload cameraId="camera-a" onSaved={saved} onCancel={() => undefined} onBusy={() => undefined} />);
    await user.upload(screen.getByLabelText('Video file'), new File([], 'empty.mp4', { type: 'video/mp4' }));
    await user.click(screen.getByRole('button', { name: 'Save video source' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('non-empty video');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText('Video file'), new File(['invalid'], 'bad.mp4', { type: 'video/mp4' }));
    await user.click(screen.getByRole('button', { name: 'Save video source' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No video frame was decoded.');
    expect(saved).not.toHaveBeenCalled();
  });
});

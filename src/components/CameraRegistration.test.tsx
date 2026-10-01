import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CameraRegistration } from './CameraRegistration';

const floorId = '20000000-0000-0000-0000-000000000001';
const cameraId = '30000000-0000-0000-0000-000000000001';

describe('CameraRegistration recovery', () => {
  it('retries only connection configuration when camera creation already succeeded', async () => {
    let configureAttempts = 0;
    let createAttempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === `/api/floors/${floorId}/cameras` && init?.method === 'POST') {
        createAttempts += 1;
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ cameraId, floorId, ...body, healthStatus: 'UNKNOWN', lastSeenAt: null }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (path === `/api/cameras/${cameraId}/connection` && init?.method === 'PUT') {
        configureAttempts += 1;
        if (configureAttempts === 1) return new Response(JSON.stringify({ code: 'AI_SERVICE_UNAVAILABLE', detail: 'Temporary failure.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ cameraId, sourceType: 'LIVE', protocol: 'HTTP', streamUri: 'http://camera/video' }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 500 });
    });
    const registered = vi.fn();
    const user = userEvent.setup();
    render(<CameraRegistration floors={[{ id: floorId, key: 'F1', label: 'Ground floor' }]} onCancel={() => undefined} onRegistered={registered} />);

    await user.type(screen.getByLabelText('Camera code'), 'CAM-PHONE');
    await user.type(screen.getByLabelText('IP Webcam URL'), 'http://camera/video');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Camera exists, but its connection was not saved.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Camera code')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry connection' }));

    expect(createAttempts).toBe(1);
    expect(configureAttempts).toBe(2);
    expect(registered).toHaveBeenCalledTimes(1);
  });

  it('rejects query strings before creating a camera because the backend contract forbids them', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<CameraRegistration floors={[{ id: floorId, key: 'F1', label: 'Ground floor' }]} onCancel={() => undefined} onRegistered={() => undefined} />);

    await user.type(screen.getByLabelText('Camera code'), 'CAM-PHONE');
    await user.type(screen.getByLabelText('IP Webcam URL'), 'http://camera/video?token=secret');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('IP Webcam URL cannot contain a query string or fragment.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

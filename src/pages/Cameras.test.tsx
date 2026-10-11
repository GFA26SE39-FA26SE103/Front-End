import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../auth/session';
import { mockNativeDialogs } from '../test/dialog';
import Cameras from './Cameras';

const storeId = '10000000-0000-0000-0000-000000000001';
const floorId = '20000000-0000-0000-0000-000000000001';
const cameraId = '30000000-0000-0000-0000-000000000001';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

mockNativeDialogs();

describe('Cameras registration', () => {
  beforeEach(() => {
    saveSession({
      accessToken: 'admin-token',
      expiresAt: '2099-01-01T00:00:00Z',
      user: { userId: '1', email: 'admin@example.test', fullName: 'Admin', roleId: '2', role: 'ADMIN', status: 'ACTIVE' },
    }, true);
  });

  it.each([cameraId, 'missing-camera'])('handles a dashboard camera link (%s) without selecting another camera', async requested => {
    const secondFloorId = '20000000-0000-0000-0000-000000000002';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([
        { floorId, floorNumber: 1, name: 'Ground floor' },
        { floorId: secondFloorId, floorNumber: 2, name: 'Upper floor' },
      ]);
      if (path === `/api/floors/${floorId}/cameras`) return json([]);
      if (path === `/api/floors/${secondFloorId}/cameras`) return json([{ cameraId, floorId: secondFloorId, code: 'CAM-TARGET', name: 'Upper aisle camera', manufacturer: null, model: null, serialNumber: null, installedAt: '2026-01-01T00:00:00Z', warrantyExpiresAt: '2027-01-01T00:00:00Z', status: 'ACTIVE', healthStatus: 'UNKNOWN', lastSeenAt: null }]);
      if (path.endsWith('/zones')) return json([]);
      return json({}, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/admin/cameras?cameraId=' + requested]}><Cameras /></MemoryRouter>);
    await screen.findByRole('row', { name: /CAM-TARGET/i });
    if (requested === cameraId) {
      expect(screen.getByText('Upper floor · Upper aisle camera')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue(secondFloorId);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('alert')).toHaveTextContent('The requested camera was not found.');
      expect(screen.queryByText('Upper floor · Upper aisle camera')).not.toBeInTheDocument();
      await user.click(screen.getByRole('row', { name: /CAM-TARGET/i }));
      expect(screen.getByText('Upper floor · Upper aisle camera')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  it('registers a recorded camera without a phone URL, uploads video, then tests and enables it', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, floorNumber: 1, name: 'Ground floor' }]);
      if (path === `/api/floors/${floorId}/zones`) return json([]);
      if (path === `/api/floors/${floorId}/cameras`) {
        if (init?.method !== 'POST') return json([]);
        return json({ cameraId, floorId, ...JSON.parse(String(init.body)), healthStatus: 'UNKNOWN', lastSeenAt: null }, 201);
      }
      if (path === `/api/cameras/${cameraId}/recorded-video`) return json({ cameraId, sourceType: 'RECORDED', protocol: 'FILE' });
      if (path === `/api/cameras/${cameraId}/connection/test`) return json({ cameraId, protocol: 'FILE', lastTestResult: 'SUCCESS', lastTestMessage: 'FRAME_RECEIVED', isEnabled: false });
      if (path === `/api/cameras/${cameraId}/connection/enable`) return json({ cameraId, protocol: 'FILE', isEnabled: true });
      return json({ code: 'UNEXPECTED_REQUEST' }, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findByText('No camera matches “”.');
    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    await user.selectOptions(screen.getByLabelText('Camera source'), 'RECORDED');
    expect(screen.queryByLabelText('IP Webcam URL')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Camera code'), 'CAM-VIDEO');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));
    await screen.findByRole('form', { name: 'Upload recorded video' });
    await user.upload(screen.getByLabelText('Video file'), new File(['video'], 'sample.mp4', { type: 'video/mp4' }));
    await user.click(screen.getByRole('button', { name: 'Save video source' }));
    await screen.findByText('RECORDED · MP4 · test & enable next');
    await user.click(screen.getByRole('button', { name: 'Test & enable' }));
    await screen.findByText('Stream ready · FRAME_RECEIVED');
    expect(calls).not.toContain(`PUT /api/cameras/${cameraId}/connection`);
    expect(calls).toContain(`POST /api/cameras/${cameraId}/recorded-video`);
    expect(calls).toContain(`POST /api/cameras/${cameraId}/connection/enable`);
  });

  it('registers an active camera and its LIVE HTTP connection, then selects it', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/supermarkets') return json([{ supermarketId: storeId, code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (url.pathname === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, supermarketId: storeId, floorNumber: 1, name: 'Ground floor' }]);
      if (url.pathname === `/api/floors/${floorId}/cameras` && (!init?.method || init.method === 'GET')) return json([]);
      if (url.pathname === `/api/floors/${floorId}/zones`) return json([]);
      if (url.pathname === `/api/floors/${floorId}/cameras` && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.code !== 'CAM-PHONE' || body.name !== 'Phone entrance' || body.status !== 'ACTIVE') return json({ code: 'BAD_CAMERA_BODY' }, 400);
        return json({ cameraId, floorId, ...body, healthStatus: 'UNKNOWN', lastSeenAt: null }, 201);
      }
      if (url.pathname === `/api/cameras/${cameraId}/connection` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        if (body.sourceType !== 'LIVE' || body.protocol !== 'HTTP' || body.streamUri !== 'http://192.168.1.25:8080/video') return json({ code: 'BAD_CONNECTION_BODY' }, 400);
        return json({ cameraId, ...body, hasCredentials: false, isEnabled: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null });
      }
      return json({ code: 'UNEXPECTED_REQUEST', path: url.pathname }, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findByText('No camera matches “”.');

    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    await user.type(screen.getByLabelText('Camera code'), 'CAM-PHONE');
    await user.clear(screen.getByLabelText('Camera name'));
    await user.type(screen.getByLabelText('Camera name'), 'Phone entrance');
    await user.type(screen.getByLabelText('IP Webcam URL'), 'http://192.168.1.25:8080/video');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));

    expect((await screen.findAllByText('CAM-PHONE')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Phone entrance/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start AI preview' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Add camera' })).not.toBeInTheDocument());
  });

  it('rejects a non-HTTP IP Webcam URL before creating a camera', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId, code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, supermarketId: storeId, floorNumber: 1, name: 'Ground floor' }]);
      if (path === `/api/floors/${floorId}/cameras` || path === `/api/floors/${floorId}/zones`) return json([]);
      return json({}, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findByText('No camera matches “”.');

    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    await user.type(screen.getByLabelText('Camera code'), 'CAM-PHONE');
    await user.type(screen.getByLabelText('IP Webcam URL'), 'rtsp://192.168.1.25/live');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Use an http:// or https:// IP Webcam URL.');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects credentials embedded in the stream URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId, code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, supermarketId: storeId, floorNumber: 1, name: 'Ground floor' }]);
      if (path === `/api/floors/${floorId}/cameras` || path === `/api/floors/${floorId}/zones`) return json([]);
      return json({}, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findByText('No camera matches “”.');

    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    await user.type(screen.getByLabelText('Camera code'), 'CAM-PHONE');
    await user.type(screen.getByLabelText('IP Webcam URL'), 'http://viewer:secret@192.168.1.25:8080/video');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter camera credentials in the separate username and password fields.');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('stops the selected preview before selecting a newly registered camera', async () => {
    const oldCameraId = '30000000-0000-0000-0000-000000000099';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId, code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, supermarketId: storeId, floorNumber: 1, name: 'Ground floor' }]);
      if (path === `/api/floors/${floorId}/cameras` && (!init?.method || init.method === 'GET')) return json([{ cameraId: oldCameraId, floorId, code: 'CAM-OLD', name: 'Old camera', manufacturer: null, model: null, serialNumber: null, installedAt: '2026-01-01T00:00:00Z', warrantyExpiresAt: '2027-01-01T00:00:00Z', status: 'ACTIVE', healthStatus: 'UNKNOWN', lastSeenAt: null }]);
      if (path === `/api/floors/${floorId}/zones` || path === `/api/cameras/${oldCameraId}/zones`) return json([]);
      if (path === `/api/cameras/${oldCameraId}/ai-preview/start`) return json({ cameraId: oldCameraId, state: 'LIVE', startedAt: null, updatedAt: '2026-01-01T00:00:00Z', frameSequence: 0, errorCode: null });
      if (path === `/api/cameras/${oldCameraId}/ai-preview/status`) return json({ cameraId: oldCameraId, state: 'STOPPED', startedAt: null, updatedAt: '2026-01-01T00:00:00Z', frameSequence: 0, errorCode: null });
      if (path === `/api/cameras/${oldCameraId}/ai-preview/stop`) return json({ cameraId: oldCameraId, state: 'STOPPED', startedAt: null, updatedAt: '2026-01-01T00:00:00Z', frameSequence: 0, errorCode: null });
      if (path === `/api/floors/${floorId}/cameras` && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return json({ cameraId, floorId, ...body, healthStatus: 'UNKNOWN', lastSeenAt: null }, 201);
      }
      if (path === `/api/cameras/${cameraId}/connection` && init?.method === 'PUT') return json({ cameraId, sourceType: 'LIVE', protocol: 'HTTP', streamUri: 'http://camera/video', hasCredentials: false, isEnabled: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null });
      return json({ code: 'UNEXPECTED_REQUEST', path }, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findAllByText('CAM-OLD');
    await user.click(screen.getByRole('button', { name: 'Start AI preview' }));
    expect(screen.getByRole('button', { name: 'Stop AI preview' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    await user.type(screen.getByLabelText('Camera code'), 'CAM-NEW');
    await user.type(screen.getByLabelText('IP Webcam URL'), 'http://camera/video');
    await user.click(screen.getByRole('button', { name: 'Save camera' }));

    expect(await screen.findByRole('button', { name: 'Start AI preview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop AI preview' })).not.toBeInTheDocument();
  });

  it('can configure an existing camera after a reload interrupted registration', async () => {
    const existingCameraId = '30000000-0000-0000-0000-000000000088';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId, code: 'STORE', name: 'Store', address: null, status: 'ACTIVE' }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, supermarketId: storeId, floorNumber: 1, name: 'Ground floor' }]);
      if (path === `/api/floors/${floorId}/cameras`) return json([{ cameraId: existingCameraId, floorId, code: 'CAM-PENDING', name: 'Pending phone', manufacturer: null, model: null, serialNumber: null, installedAt: '2026-01-01T00:00:00Z', warrantyExpiresAt: '2027-01-01T00:00:00Z', status: 'ACTIVE', healthStatus: 'UNKNOWN', lastSeenAt: null }]);
      if (path === `/api/floors/${floorId}/zones` || path === `/api/cameras/${existingCameraId}/zones`) return json([]);
      if (path === `/api/cameras/${existingCameraId}/connection` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        if (body.streamUri !== 'http://192.168.1.25:8080/video') return json({ code: 'BAD_CONNECTION_BODY' }, 400);
        return json({ cameraId: existingCameraId, ...body, hasCredentials: false, isEnabled: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null });
      }
      return json({ code: 'UNEXPECTED_REQUEST', path }, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findAllByText('CAM-PENDING');

    await user.click(screen.getByRole('button', { name: 'Configure connection' }));
    await user.type(screen.getByLabelText('IP Webcam URL'), 'http://192.168.1.25:8080/video');
    await user.click(screen.getByRole('button', { name: 'Save connection' }));

    expect(await screen.findByText('HTTP · configured in backend')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Configure camera connection' })).not.toBeInTheDocument();
  });

  it('edits camera metadata and deactivates it without deleting its record', async () => {
    const patches: Record<string, unknown>[] = [];
    const original = {
      cameraId, floorId, code: 'CAM-EDIT', name: 'Old name', manufacturer: 'Acme', model: 'A1', serialNumber: 'SN-1',
      installedAt: '2026-01-01T00:00:00Z', warrantyExpiresAt: '2027-01-01T00:00:00Z', mapX: 0.25, mapY: 0.75,
      mapRotationDeg: 90, status: 'ACTIVE', healthStatus: 'ONLINE', lastSeenAt: '2026-10-04T01:00:00Z',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/supermarkets') return json([{ supermarketId: storeId }]);
      if (path === `/api/supermarkets/${storeId}/floors`) return json([{ floorId, floorNumber: 1, name: 'Ground floor' }]);
      if (path === `/api/floors/${floorId}/cameras`) return json([original]);
      if (path === `/api/floors/${floorId}/zones` || path === `/api/cameras/${cameraId}/zones`) return json([]);
      if (path === `/api/cameras/${cameraId}` && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patches.push(body);
        return json({ ...original, ...body, healthStatus: body.status === 'INACTIVE' ? 'UNKNOWN' : 'ONLINE' });
      }
      return json({ code: 'UNEXPECTED_REQUEST', path }, 500);
    });
    const user = userEvent.setup();
    render(<MemoryRouter><Cameras /></MemoryRouter>);
    await screen.findAllByText('CAM-EDIT');

    await user.click(screen.getByRole('button', { name: 'Edit camera' }));
    await user.clear(screen.getByLabelText('Camera name'));
    await user.type(screen.getByLabelText('Camera name'), 'Checkout camera');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save camera' }));
    await screen.findByText('Ground floor · Checkout camera');

    expect(patches[0]).toMatchObject({ name: 'Checkout camera', mapX: 0.25, mapY: 0.75, mapRotationDeg: 90, status: 'ACTIVE' });
    await user.click(screen.getByRole('button', { name: 'Deactivate camera' }));
    const confirmation = screen.getByRole('dialog');
    expect(confirmation).toHaveTextContent('health will become UNKNOWN');
    await user.click(within(confirmation).getByRole('button', { name: 'Deactivate camera' }));

    await screen.findByText(/This camera is inactive/);
    expect(patches[1]).toMatchObject({ name: 'Checkout camera', status: 'INACTIVE', mapX: 0.25, mapY: 0.75, mapRotationDeg: 90 });
    expect(screen.getByRole('button', { name: 'Reactivate camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test & enable' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start AI preview' })).toBeDisabled();
  });
});

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { clearSession, saveSession } from '../auth/session';
import { ApiError } from './client';
import type { MapPoint } from './floors';
import {
  createCheckoutCounter,
  deleteCheckoutCounter,
  deleteCheckoutMapping,
  getCheckoutRuntime,
  listCameraCheckoutMappings,
  listCheckoutCounters,
  listCounterCheckoutMappings,
  saveCheckoutMapping,
  updateCheckoutCounter,
  type CheckoutCounter,
  type CheckoutCounterRequest,
  type CheckoutMapping,
  type CheckoutMappingRequest,
} from './checkout';

const apiUrl = 'https://checkout-api.example.test';
const timestamp = '2026-11-11T10:20:30.1234567+07:00';
const encodedTimestamp = '2026-11-11T10%3A20%3A30.1234567%2B07%3A00';
const user = {
  userId: 'user-1', email: 'admin@example.test', fullName: 'Admin',
  roleId: 'role-1', role: 'ADMIN', status: 'ACTIVE',
};
const counter: CheckoutCounter = {
  checkoutCounterId: 'counter-1', zoneId: 'zone-1', code: 'CHECKOUT-01', name: 'Checkout 1',
  isEnabled: true, createdAt: timestamp, updatedAt: timestamp,
};
const laneRoi: MapPoint[] = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.9 }];
const staffRoi: MapPoint[] = [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.4, y: 0.5 }];
const mapping: CheckoutMapping = {
  mappingId: 'mapping-1', cameraId: 'camera-1', checkoutCounterId: 'counter-1',
  laneRoi, staffRoi, isEnabled: false, isQueueSource: true, createdAt: timestamp, updatedAt: timestamp,
};
const counterRequest: CheckoutCounterRequest = {
  code: counter.code, name: counter.name, isEnabled: false, expectedUpdatedAt: timestamp,
};
const mappingRequest: CheckoutMappingRequest = {
  laneRoi, staffRoi, isEnabled: false, isQueueSource: true, expectedUpdatedAt: timestamp,
};

// Reserved characters deliberately exercise encoding of each independent path segment.
const endpoints = [
  {
    name: 'list counters', run: () => listCheckoutCounters('zone/one ?#'),
    path: '/api/zones/zone%2Fone%20%3F%23/checkout-counters', method: 'GET', result: [counter],
  },
  {
    name: 'checkout runtime', run: () => getCheckoutRuntime('zone/one ?#'),
    path: '/api/zones/zone%2Fone%20%3F%23/checkout-runtime', method: 'GET',
    result: { zoneId: 'zone-1', state: 'UNAVAILABLE', queueCount: null, counters: [] },
  },
  {
    name: 'create counter', run: () => createCheckoutCounter('zone/one ?#', counterRequest),
    path: '/api/zones/zone%2Fone%20%3F%23/checkout-counters', method: 'POST',
    body: counterRequest, result: counter, status: 201,
  },
  {
    name: 'update counter', run: () => updateCheckoutCounter('counter/one ?#', counterRequest),
    path: '/api/checkout-counters/counter%2Fone%20%3F%23', method: 'PATCH', body: counterRequest, result: counter,
  },
  {
    name: 'delete counter', run: () => deleteCheckoutCounter('counter/one ?#', timestamp),
    path: `/api/checkout-counters/counter%2Fone%20%3F%23?expectedUpdatedAt=${encodedTimestamp}`,
    method: 'DELETE', result: undefined, status: 204,
  },
  {
    name: 'list mappings by camera', run: () => listCameraCheckoutMappings('camera/one ?#'),
    path: '/api/cameras/camera%2Fone%20%3F%23/checkout-mappings', method: 'GET', result: [mapping],
  },
  {
    name: 'list mappings by counter', run: () => listCounterCheckoutMappings('counter/one ?#'),
    path: '/api/checkout-counters/counter%2Fone%20%3F%23/camera-mappings', method: 'GET', result: [mapping],
  },
  {
    name: 'save mapping', run: () => saveCheckoutMapping('counter/one ?#', 'camera/two &%', mappingRequest),
    path: '/api/checkout-counters/counter%2Fone%20%3F%23/camera-mappings/camera%2Ftwo%20%26%25',
    method: 'PUT', body: mappingRequest, result: mapping,
  },
  {
    name: 'delete mapping', run: () => deleteCheckoutMapping('counter/one ?#', 'camera/two &%', timestamp),
    path: `/api/checkout-counters/counter%2Fone%20%3F%23/camera-mappings/camera%2Ftwo%20%26%25?expectedUpdatedAt=${encodedTimestamp}`,
    method: 'DELETE', result: undefined, status: 204,
  },
] satisfies {
  name: string; run: () => Promise<unknown>; path: string; method: string;
  body?: CheckoutCounterRequest | CheckoutMappingRequest; result: unknown; status?: number;
}[];

describe('checkout API', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', apiUrl);
    saveSession({ accessToken: 'checkout-jwt-token', expiresAt: '2099-01-01T00:00:00Z', user }, true);
  });

  afterEach(() => {
    clearSession();
    vi.unstubAllEnvs();
  });

  it('exports typed records, explicit request booleans, and typed promises', () => {
    expectTypeOf<CheckoutCounter>().toEqualTypeOf<{
      checkoutCounterId: string; zoneId: string; code: string; name: string;
      isEnabled: boolean; createdAt: string; updatedAt: string;
    }>();
    expectTypeOf<CheckoutMapping>().toEqualTypeOf<{
      mappingId: string; cameraId: string; checkoutCounterId: string; laneRoi: MapPoint[]; staffRoi: MapPoint[];
      serviceRoi?: MapPoint[] | null;
      isEnabled: boolean; isQueueSource: boolean; createdAt: string; updatedAt: string;
    }>();
    expectTypeOf<CheckoutCounterRequest>().toEqualTypeOf<{
      code: string; name: string; isEnabled: boolean; expectedUpdatedAt?: string;
    }>();
    expectTypeOf<CheckoutMappingRequest>().toEqualTypeOf<{
      laneRoi: MapPoint[]; staffRoi: MapPoint[]; serviceRoi?: MapPoint[] | null;
      isEnabled: boolean; isQueueSource: boolean; expectedUpdatedAt?: string;
    }>();
    expectTypeOf<ReturnType<typeof listCheckoutCounters>>().toEqualTypeOf<Promise<CheckoutCounter[]>>();
    expectTypeOf<ReturnType<typeof createCheckoutCounter>>().toEqualTypeOf<Promise<CheckoutCounter>>();
    expectTypeOf<ReturnType<typeof updateCheckoutCounter>>().toEqualTypeOf<Promise<CheckoutCounter>>();
    expectTypeOf<ReturnType<typeof deleteCheckoutCounter>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<typeof listCameraCheckoutMappings>>().toEqualTypeOf<Promise<CheckoutMapping[]>>();
    expectTypeOf<ReturnType<typeof listCounterCheckoutMappings>>().toEqualTypeOf<Promise<CheckoutMapping[]>>();
    expectTypeOf<ReturnType<typeof saveCheckoutMapping>>().toEqualTypeOf<Promise<CheckoutMapping>>();
    expectTypeOf<ReturnType<typeof deleteCheckoutMapping>>().toEqualTypeOf<Promise<void>>();
  });

  it.each(endpoints)('$name uses the backend route, verb, body, auth, and unmodified timestamps', async (endpoint) => {
    const status = endpoint.status ?? 200;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      status === 204 ? null : JSON.stringify(endpoint.result), { status },
    ));

    await expect(endpoint.run()).resolves.toEqual(endpoint.result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiUrl}${endpoint.path}`);
    expect(init?.method ?? 'GET').toBe(endpoint.method);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer checkout-jwt-token');
    if ('body' in endpoint) {
      expect(init?.body).toBe(JSON.stringify(endpoint.body));
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    } else {
      expect(init?.body).toBeUndefined();
    }
    if (endpoint.method === 'DELETE') {
      expect(new URL(String(url)).searchParams.get('expectedUpdatedAt')).toBe(timestamp);
    }
  });

  it('omits absent concurrency tokens without adding undefined query values', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(counter)),
    );
    const request: CheckoutCounterRequest = { code: 'CHECKOUT-02', name: 'Checkout 2', isEnabled: true };
    const roiRequest: CheckoutMappingRequest = { laneRoi, staffRoi, isEnabled: true, isQueueSource: false };

    await createCheckoutCounter('zone-1', request);
    await updateCheckoutCounter('counter-1', request);
    await saveCheckoutMapping('counter-1', 'camera-1', roiRequest);
    await deleteCheckoutCounter('counter-1');
    await deleteCheckoutMapping('counter-1', 'camera-1');

    expect(fetchMock.mock.calls.slice(0, 3).map(([, init]) => JSON.parse(String(init?.body))))
      .toEqual([request, request, roiRequest]);
    expect(fetchMock.mock.calls[3][0]).toBe(`${apiUrl}/api/checkout-counters/counter-1`);
    expect(fetchMock.mock.calls[4][0]).toBe(`${apiUrl}/api/checkout-counters/counter-1/camera-mappings/camera-1`);
  });

  it.each([
    { isEnabled: false, isQueueSource: false },
    { isEnabled: false, isQueueSource: true },
    { isEnabled: true, isQueueSource: false },
    { isEnabled: true, isQueueSource: true },
  ])('preserves explicit mapping flags $isEnabled/$isQueueSource', async (flags) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(mapping)));
    const request = { ...mappingRequest, ...flags };

    await saveCheckoutMapping('counter-1', 'camera-1', request);

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(request);
  });

  const readers = [
    { name: 'counters', run: (signal: AbortSignal) => listCheckoutCounters('zone-1', signal) },
    { name: 'camera mappings', run: (signal: AbortSignal) => listCameraCheckoutMappings('camera-1', signal) },
    { name: 'counter mappings', run: (signal: AbortSignal) => listCounterCheckoutMappings('counter-1', signal) },
  ];

  it.each(readers)('forwards cancellation and propagates aborts for $name', async ({ run }) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const controller = new AbortController();
    const reason = new DOMException('Cancelled by caller', 'AbortError');
    const result = run(controller.signal);
    const rejected = expect(result).rejects.toBe(reason);

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    controller.abort(reason);

    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  describe.each(endpoints)('$name errors', ({ run }) => {
    it.each([400, 401, 403, 404, 409, 503])('propagates HTTP %i without swallowing the problem', async (status) => {
      const problem = { code: `CHECKOUT_${status}`, detail: `Checkout failure ${status}` };
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(problem), { status }));

      const result = run();
      await expect(result).rejects.toBeInstanceOf(ApiError);
      await expect(result).rejects.toMatchObject({ status, code: problem.code, message: problem.detail });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('propagates network errors unchanged', async () => {
      const error = new TypeError('Network unavailable');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

      await expect(run()).rejects.toBe(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

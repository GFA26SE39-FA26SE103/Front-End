import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../../auth/session';
import type { AnalyticsPeriod, AnalyticsSummary } from '../../api/analytics';
import Analytics from './Analytics';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const summary = (): AnalyticsSummary => ({
  events: { total: 12, active: 2, cleared: 10, latestCritical: 3, clearTime: { samples: 10, averageSeconds: 180 } },
  incidents: { recorded: 4, total: 3, open: 1, closed: 2, dismissed: 1, resolutionTime: { samples: 2, averageSeconds: 1200 } },
  tasks: {
    total: 8, byStatus: { OFFERED: 1, ACCEPTED: 1, IN_PROGRESS: 1, SUBMITTED: 1, VERIFIED: 3, CANCELLED: 1 },
    responseTime: { samples: 6, averageSeconds: 45 }, completionTime: { samples: 3, averageSeconds: 600 },
    responseSla: { evaluated: 6, met: 5, breached: 1, pending: 0, unavailable: 1, metPercent: 100 * 5 / 6 },
    resolutionSla: { evaluated: 3, met: 3, breached: 0, pending: 3, unavailable: 1, metPercent: 100 },
  },
});
const period: AnalyticsPeriod = { from: '2026-10-31', to: '2026-11-06', timeZone: 'Asia/Ho_Chi_Minh',
  fromUtc: '2026-10-30T17:00:00Z', toUtcExclusive: '2026-11-06T17:00:00Z', generatedAt: '2026-11-06T07:00:00Z', zoneId: null };
let fail: string;
let stats: AnalyticsSummary;
let calls: { url: URL; headers: Headers; signal: AbortSignal | null | undefined }[];

beforeEach(() => {
  fail = '';
  stats = summary();
  calls = [];
  saveSession({ accessToken: 'manager-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'manager', email: 'manager@test.example', fullName: 'Manager', roleId: 'mgr', role: 'MANAGER', status: 'ACTIVE' } }, true);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, headers: new Headers(init?.headers), signal: init?.signal });
    if (fail && url.pathname.endsWith(fail)) return json({ detail: 'Analytics data is temporarily unavailable. Retry later.', code: 'ANALYTICS_UNAVAILABLE' }, 503);
    const metadata = { ...period, from: url.searchParams.get('from') || period.from, to: url.searchParams.get('to') || period.to, zoneId: url.searchParams.get('zoneId') };
    if (url.pathname.endsWith('/overview')) return json({ period: metadata, summary: stats });
    if (url.pathname.endsWith('/trends')) return json({ period: metadata, days: [{ date: metadata.from, summary: stats }] });
    if (url.pathname.endsWith('/zones')) return json({ period: metadata, zones: [
      { zoneId: 'checkout', zoneName: 'Checkout', summary: stats },
      { zoneId: 'old-zone', zoneName: 'Old zone (inactive)', summary: stats },
    ].filter(zone => !metadata.zoneId || zone.zoneId === metadata.zoneId) });
    return json({}, 404);
  });
});

function show() { return render(<MemoryRouter><Analytics /></MemoryRouter>); }

describe('Manager analytics', () => {
  it('loads all three authenticated endpoints and presents real values, sample counts and accessible daily data', async () => {
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading analytics');
    await screen.findByRole('heading', { name: 'Daily activity' });
    expect(calls.map(call => call.url.pathname)).toEqual(['/api/manager/analytics/overview', '/api/manager/analytics/trends', '/api/manager/analytics/zones']);
    expect(calls.every(call => call.headers.get('Authorization') === 'Bearer manager-token')).toBe(true);
    expect(screen.getByLabelText('From')).toHaveValue(period.from);
    expect(within(screen.getByRole('region', { name: 'Response SLA' })).getByText('83.3%')).toBeInTheDocument();
    expect(screen.getByText('45 sec')).toBeInTheDocument();
    expect(screen.getByText('6 samples')).toBeInTheDocument();
    expect(screen.getByText('1 open · 1 dismissed excluded')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Zone analytics' })).toHaveTextContent('Old zone (inactive)');
    fireEvent.click(screen.getByText('View daily data'));
    expect(screen.getByRole('table', { name: /Daily records/ })).toHaveTextContent('2026-10-31');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/manager/analytics');
    expect(screen.getByRole('link', { name: 'View 12 events in this period' })).toHaveAttribute('href', '/manager/events?from=2026-10-31&to=2026-11-06');
  });

  it('applies identical filters to overview, trends and zones and retains the full zone selector', async () => {
    show();
    await screen.findByRole('heading', { name: 'Daily activity' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-04' } });
    fireEvent.change(screen.getByLabelText('Zone'), { target: { value: 'checkout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByRole('heading', { name: 'Daily activity' });
    const filtered = calls.slice(-3);
    expect(filtered).toHaveLength(3);
    for (const call of filtered) expect(Object.fromEntries(call.url.searchParams)).toEqual({ from: '2026-11-01', to: '2026-11-04', zoneId: 'checkout' });
    expect(screen.getByRole('option', { name: 'Old zone (inactive)' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Zone analytics' })).not.toHaveTextContent('Old zone (inactive)');
    fireEvent.change(screen.getByLabelText('Trend metric'), { target: { value: 'tasks' } });
    expect(screen.getByRole('img', { name: /Tasks created by day/ })).toBeInTheDocument();
  });

  it('validates reversed and oversized ranges without sending more requests', async () => {
    show(); await screen.findByRole('heading', { name: 'Daily activity' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-06' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1–93 days');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(calls).toHaveLength(3);
  });

  it('hides earlier figures when any refresh endpoint fails and restores them only after retry succeeds', async () => {
    show(); await screen.findByRole('heading', { name: 'Daily activity' });
    fail = '/trends';
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('83.3%')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Zone analytics' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
    fail = '';
    fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    await screen.findByRole('heading', { name: 'Daily activity' });
    expect(within(screen.getByRole('region', { name: 'Response SLA' })).getByText('83.3%')).toBeInTheDocument();
  });

  it('distinguishes an empty cohort from unavailable averages and keeps a true zero-second sample', async () => {
    const sla = { evaluated: 0, met: 0, breached: 0, pending: 0, unavailable: 0, metPercent: null };
    const unavailable = { samples: 0, averageSeconds: null };
    stats = { events: { total: 0, active: 0, cleared: 0, latestCritical: 0, clearTime: unavailable },
      incidents: { recorded: 0, total: 0, open: 0, closed: 0, dismissed: 0, resolutionTime: unavailable },
      tasks: { total: 0, byStatus: { OFFERED: 0 }, responseTime: unavailable, completionTime: unavailable, responseSla: sla, resolutionSla: sla } };
    show();
    await screen.findByText(/No records in this period/);
    const response = screen.getByRole('region', { name: 'Response SLA' });
    expect(response).toHaveTextContent('—');
    expect(response).not.toHaveTextContent('0.0%');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    stats.tasks.responseTime = { samples: 1, averageSeconds: 0 };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('0 sec')).toBeInTheDocument();
  });

  it('aborts all requests when the page unmounts', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers), signal: init?.signal });
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    });
    const view = show(); await waitFor(() => expect(calls).toHaveLength(3));
    view.unmount();
    await waitFor(() => expect(calls.every(call => call.signal?.aborted)).toBe(true));
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../../auth/session';
import type { OperationalEvent } from '../../api/operationalEvents';
import OperationalEvents, { OperationalEventDetail } from './OperationalEvents';

const event: OperationalEvent = { eventId: 'event-1', sourceCode: 'EVT-12345678', eventTypeId: 'type-1', eventTypeCode: 'LONG_QUEUE', eventTypeName: 'Long queue', zoneId: 'zone-1', zoneName: 'Checkout', cameraId: 'cam-1', cameraCode: 'CAM-01', cameraName: 'Checkout camera', priority: 'WARNING', status: 'CLEARED', metricValue: 4, measurementType: 'QUEUE_LENGTH', detectedAt: '2026-11-03T03:00:00Z', lastObservedAt: '2026-11-03T03:05:00Z', clearedAt: '2026-11-03T03:05:00Z', updatedAt: '2026-11-03T03:05:00Z', taskCount: 1 };
let calls: URL[]; let fail: boolean;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  calls = []; fail = false;
  saveSession({ accessToken: 'operator-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'operator', roleId: 'op', role: 'OPERATOR', fullName: 'Operator', email: 'operator@example.test', status: 'ACTIVE' } }, true);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname.endsWith('/zones')) return json([{ zoneId: 'zone-1', name: 'Checkout', status: 'INACTIVE' }]);
    if (fail) return json({ detail: 'Operational event data is temporarily unavailable.' }, 503);
    if (url.pathname.endsWith('/event-1')) return json({ event, tasks: [{ taskId: 'task-1', title: 'Assist queue', status: 'IN_PROGRESS', priority: 'WARNING', assigneeName: 'Staff A', createdAt: event.detectedAt }], hasMoreTasks: false });
    return json({ items: [event], totalCount: 21, page: Number(url.searchParams.get('page') || 1), pageSize: 20, generatedAt: event.updatedAt, timeZone: 'Asia/Ho_Chi_Minh' });
  });
});
function show(path = '/operator/events', workspace: 'operator' | 'manager' = 'operator') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path={`/${workspace}/events`} element={<OperationalEvents workspace={workspace} />} />
    <Route path={`/${workspace}/events/:eventId`} element={<OperationalEventDetail workspace={workspace} />} />
  </Routes></MemoryRouter>);
}
describe('Operational Event history', () => {
  it.each([false, true])('lets Manager review inline and keeps the selected event page (existing: %s)', async existing => {
    const active = { ...event, status: 'ACTIVE', clearedAt: null };
    const recommendation = { recommendationId: 'recommendation-1', eventId: event.eventId, status: 'AVAILABLE',
      title: 'Monitor the condition', description: 'Review the queue.', generatedAt: event.updatedAt, expiresAt: null, guidance: null };
    const generate = vi.fn();
    vi.mocked(globalThis.fetch).mockImplementation(async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/zones')) return json([]);
      if (url.pathname.endsWith('/generate')) {
        generate(JSON.parse(String(options?.body)));
        return json({ recommendation, reason: null });
      }
      if (url.pathname.endsWith('/decision')) {
        expect(JSON.parse(String(options?.body))).toEqual({ decision: 'ACCEPTED', reason: null });
        return json({ ...recommendation, status: 'ACCEPTED' });
      }
      if (url.pathname.endsWith('/recommendation-1')) return json(recommendation);
      if (url.pathname.endsWith('/recommendations')) return json({ items: existing && url.searchParams.get('status') === 'AVAILABLE' ? [recommendation] : [], hasMore: false });
      return json({ items: [active], totalCount: 21, page: 2, pageSize: 20, generatedAt: event.updatedAt, timeZone: 'Asia/Ho_Chi_Minh' });
    });
    show('/manager/events?status=ACTIVE&page=2', 'manager');
    const trigger = await screen.findByRole('button', { name: `AI recommendation for ${event.sourceCode}` });
    fireEvent.click(trigger);
    const panel = screen.getByRole('complementary', { name: 'AI recommendation' });
    expect(screen.getByRole('table', { name: 'Operational event history' })).toBeInTheDocument();
    if (!existing) fireEvent.click(await within(panel).findByRole('button', { name: 'Generate recommendation' }));
    expect(await within(panel).findByRole('heading', { name: recommendation.title })).toBeInTheDocument();
    if (existing) expect(generate).not.toHaveBeenCalled();
    else expect(generate).toHaveBeenCalledWith({ eventId: event.eventId });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save decision' }));
    expect(await within(panel).findByText('Accepted and available for Operator review.')).toBeInTheDocument();
    fireEvent.keyDown(within(panel).getByRole('button', { name: 'Close' }), { key: 'Escape' });
    expect(panel).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText('Event status')).toHaveValue('ACTIVE');
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it('defaults to All statuses, priorities, dates and zones and opens the linked task from detail', async () => {
    show();
    expect(await screen.findByRole('link', { name: 'Long queue' })).toBeInTheDocument();
    expect(screen.getByLabelText('Event status')).toHaveValue('ALL');
    expect(screen.getByLabelText('Event priority')).toHaveValue('ALL');
    expect(screen.getByLabelText('Detected from')).toHaveValue('');
    expect(within(screen.getByRole('row', { name: /Long queue/ })).getByText('Cleared')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Long queue' }));
    expect(await screen.findByRole('link', { name: 'Assist queue' })).toHaveAttribute('href', '/operator/tasks/task-1');
    expect(screen.getByText(/Clearing an event does not verify/)).toBeInTheDocument();
  });
  it('applies combined server filters, paginates them and clears to All history', async () => {
    show(); await screen.findByRole('link', { name: 'Long queue' });
    fireEvent.change(screen.getByLabelText('Event status'), { target: { value: 'ACTIVE' } });
    fireEvent.change(screen.getByLabelText('Event priority'), { target: { value: 'CRITICAL' } });
    fireEvent.change(screen.getByLabelText('Event zone'), { target: { value: 'zone-1' } });
    fireEvent.change(screen.getByLabelText('Detected from'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Detected to'), { target: { value: '2026-11-06' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(calls.at(-1)?.searchParams.get('priority')).toBe('CRITICAL'));
    expect(calls.at(-1)?.searchParams.get('zoneId')).toBe('zone-1');
    await screen.findByRole('link', { name: 'Long queue' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(calls.at(-1)?.searchParams.get('page')).toBe('2'));
    expect(calls.at(-1)?.searchParams.get('from')).toBe('2026-11-01');
    await screen.findByRole('link', { name: 'Long queue' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(calls.at(-1)?.searchParams.get('status')).toBe('ALL'));
    expect(calls.at(-1)?.searchParams.has('from')).toBe(false);
    expect(calls.at(-1)?.searchParams.has('zoneId')).toBe(false);
  });
  it('restores analytics deep-link dates and gives Manager read-only linked tasks', async () => {
    show('/manager/events?from=2026-11-01&to=2026-11-06&zoneId=zone-1', 'manager');
    await screen.findByRole('link', { name: 'Long queue' });
    expect(screen.getByLabelText('Detected from')).toHaveValue('2026-11-01');
    fireEvent.click(screen.getByRole('link', { name: 'Long queue' }));
    await screen.findByText('Assist queue');
    expect(screen.queryByRole('link', { name: 'Assist queue' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Event history/ })).toHaveAttribute('href', '/manager/events?from=2026-11-01&to=2026-11-06&zoneId=zone-1');
  });
  it('does not show a stale table as a successful empty list when loading fails and retries', async () => {
    show(); await screen.findByRole('link', { name: 'Long queue' }); fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh events' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('table', { name: 'Operational event history' })).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }));
    await screen.findByRole('link', { name: 'Long queue' });
  });
  it('rejects reversed dates before calling the API', async () => {
    show(); await screen.findByRole('link', { name: 'Long queue' });
    const count = calls.length;
    fireEvent.change(screen.getByLabelText('Detected from'), { target: { value: '2026-11-06' } });
    fireEvent.change(screen.getByLabelText('Detected to'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(within(screen.getByRole('alert')).getByText('From must be on or before To.')).toBeInTheDocument();
    expect(calls).toHaveLength(count);
  });
});

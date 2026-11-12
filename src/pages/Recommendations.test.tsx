import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation } from '../api/recommendations';
import { saveSession } from '../auth/session';
import { OperatorNotifications } from './NotificationInbox';
import { RecommendationDetail, Recommendations } from './Recommendations';
import { OperationalEventDetail } from './operator/OperationalEvents';

const id = 'c065cf2b-c187-49c3-a70b-f6a2d92d3e95';
const now = '2026-11-12T09:00:00Z';
const event = { eventId: 'ev-1', eventTypeName: 'Long queue', sourceCode: 'EVT-1', zoneName: 'Checkout', cameraName: 'Camera A', cameraCode: 'A',
  metricValue: 7, measurementType: 'QUEUE_LENGTH', eventTypeCode: 'LONG_QUEUE', priority: 'WARNING', status: 'ACTIVE', detectedAt: now,
  lastObservedAt: now, clearedAt: null, updatedAt: now, taskCount: 0 };
const row: Recommendation = { recommendationId: id, eventId: event.eventId, zoneId: 'zone-1', recommendationType: 'REVIEW_CHECKOUT_CAPACITY',
  title: 'Review checkout capacity', description: 'Check whether additional checkout support is appropriate.', status: 'AVAILABLE',
  generatedAt: now, expiresAt: '2026-11-12T09:05:00Z', reviewedByUserId: null, reviewedAt: null,
  evidence: { observedAt: now, confidence: 'HIGH', slaPolicyVersion: 3, signal: { eventType: 'LONG_QUEUE', alertLevel: 'WARNING', metric: 7,
    unit: 'PEOPLE', warningThreshold: 5, criticalThreshold: 10, sustainSeconds: 30, slaPriority: 'MEDIUM' } } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function signIn(role: 'MANAGER' | 'OPERATOR') {
  saveSession({ accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', user: { userId: 'user', email: 'test@example.test',
    fullName: 'User', roleId: 'role', role, status: 'ACTIVE' } }, false);
}

function view(initial: string) {
  return render(<MemoryRouter initialEntries={[initial]}><Routes>
    <Route path="/manager/events/:eventId" element={<OperationalEventDetail workspace="manager" />} />
    <Route path="/manager/recommendations" element={<Recommendations workspace="manager" />} />
    <Route path="/manager/recommendations/:id" element={<RecommendationDetail workspace="manager" />} />
    <Route path="/operator/notifications" element={<OperatorNotifications />} />
    <Route path="/operator/recommendations/:id" element={<RecommendationDetail workspace="operator" />} />
  </Routes></MemoryRouter>);
}

describe('D14 recommendation screens', () => {
  beforeEach(() => { signIn('MANAGER'); });

  it('generates from an active event and lets a Manager accept after reviewing the evidence', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/api/operational-events/ev-1') return json({ event, tasks: [], hasMoreTasks: false });
      if (path.endsWith('/generate')) {
        expect(JSON.parse(String(options?.body))).toEqual({ eventId: event.eventId });
        return json({ recommendation: row, reason: null });
      }
      if (path.endsWith('/decision')) {
        expect(JSON.parse(String(options?.body))).toEqual({ decision: 'ACCEPTED', reason: null });
        return json({ ...row, status: 'ACCEPTED', reviewedAt: now });
      }
      if (path === `/api/manager/recommendations/${id}`) return json(row);
      throw new Error(`Unexpected path ${path}`);
    });
    view('/manager/events/ev-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Generate recommendation' }));
    expect(await screen.findByRole('heading', { name: row.title })).toBeInTheDocument();
    expect(screen.getByText('7 PEOPLE')).toBeInTheDocument();
    expect(screen.getByText('Model confidence (self-assessed)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText('Accepted and available for Operator review.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save decision' })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url, options]) => String(url).endsWith('/decision') && options?.method === 'POST')).toBe(true);
  });

  it('explains why an active event produced no recommendation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/generate')
      ? json({ recommendation: null, reason: 'INSUFFICIENT_VALID_EVIDENCE' }) : json({ event, tasks: [], hasMoreTasks: false }));
    view('/manager/events/ev-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Generate recommendation' }));
    expect(await screen.findByText(/needs a recent, valid observation/)).toBeInTheDocument();
  });

  it('requires a nonblank reason for defer and updates the displayed status', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, options) => options?.method === 'POST'
      ? json({ ...row, status: 'DEFERRED', reviewedAt: now }) : json(row));
    view(`/manager/recommendations/${id}`);
    await userEvent.selectOptions(await screen.findByLabelText('Decision'), 'DEFERRED');
    const save = screen.getByRole('button', { name: 'Save decision' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Reason/), '  Review later  ');
    await userEvent.click(save);
    expect(await screen.findByText('Deferred')).toBeInTheDocument();
    const post = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ decision: 'DEFERRED', reason: 'Review later' });
    expect(screen.queryByRole('option', { name: 'Defer' })).not.toBeInTheDocument();
  });

  it('opens the accepted recommendation from the Operator inbox without Manager actions', async () => {
    signIn('OPERATOR');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/api/me/notifications')
      ? json([{ notificationId: 'n-1', type: 'RECOMMENDATION_ACCEPTED', title: 'Recommendation accepted',
        message: `Review recommendation ${id}: ${row.title}`, createdAt: now, readAt: null, taskId: null, eventId: event.eventId }])
      : json({ ...row, status: 'ACCEPTED' }));
    view('/operator/notifications');
    await userEvent.click(await screen.findByRole('link', { name: /Recommendation accepted/ }));
    expect(await screen.findByRole('heading', { name: row.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open task board' })).toHaveAttribute('href', '/operator/tasks');
    expect(screen.queryByRole('button', { name: 'Save decision' })).not.toBeInTheDocument();
  });
});

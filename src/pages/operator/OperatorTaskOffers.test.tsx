import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listTaskOffers } from '../../api/tasks';
import OperatorTaskOffers from './OperatorTaskOffers';

vi.mock('../../api/tasks', () => ({ listTaskOffers: vi.fn() }));

describe('Operator TaskOffer activity', () => {
  beforeEach(() => vi.mocked(listTaskOffers).mockResolvedValue([{ offerId: 'offer-1', taskId: 'task-1', origin: 'OPERATIONAL_EVENT', sourceCode: 'EVT-1234', eventTypeCode: 'LONG_QUEUE', title: 'Open checkout', instructions: null, priority: 'WARNING', zoneId: 'zone-1', zoneName: 'Checkout', cameraCode: 'CAM-1', cameraName: 'Checkout', metricValue: 6, measurementMode: 'QUEUE_LENGTH', measurementUnit: 'PEOPLE', createdAt: '2026-11-06T01:00:00Z', recipients: 2, attempt: 1, maxAttempts: 3, nextAlertAt: null, status: 'PENDING', closedReason: null, eventClearedAt: null, staffUserId: 'staff-1', staffName: 'Linh', dispatchCycleId: 'cycle-1', waveNumber: 1, dispatchScope: 'SAME_ZONE', expiresAt: '2026-11-06T01:01:00Z', respondedAt: null }]));

  it('shows V7 offer status and filters on the server', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><OperatorTaskOffers /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Open checkout' })).toHaveAttribute('href', '/operator/tasks/task-1');
    expect(screen.getAllByText('PENDING')).toHaveLength(2);
    expect(screen.getByText('Linh')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Offer status'), 'DECLINED');
    await waitFor(() => expect(listTaskOffers).toHaveBeenLastCalledWith({ status: 'DECLINED' }, expect.any(AbortSignal)));
  });
});

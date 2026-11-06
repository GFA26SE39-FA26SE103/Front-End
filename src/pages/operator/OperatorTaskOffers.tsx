import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTaskOffers, type TaskOffer } from '../../api/tasks';
import { OperatorLayout } from '../../components/OperatorLayout';
import { Button, Card, CardHeader, Chip } from '../../components/ui';
import { useTaskPolling } from './useTaskPolling';
import s from './OperatorTasks.module.css';

const statuses = ['', 'PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'];
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const tone = (offer: TaskOffer) => offer.status === 'ACCEPTED' ? 'success' : offer.status === 'PENDING' ? 'primary' : offer.status === 'DECLINED' ? 'warning' : 'neutral';

export default function OperatorTaskOffers() {
  const [status, setStatus] = useState('');
  const load = useCallback((signal: AbortSignal) => listTaskOffers({ status: status || undefined }, signal), [status]);
  const { data, error, checkedAt, refresh } = useTaskPolling(load);
  return <OperatorLayout title="Task offers" subtitle="V7 dispatch activity and Staff responses">
    <div className={s.page}><div className={s.heading}><div><h2>Offer activity</h2><p className={s.muted}>Read-only dispatch evidence. Staff still responds from the Staff app.</p></div><Button variant="secondary" onClick={refresh}>Refresh offers</Button></div>
      <Card><CardHeader title="Recent offers" subtitle={checkedAt ? `Updated ${date(checkedAt.toISOString())}` : 'Waiting for backend'} />
        <div className={s.tools}><label>Status <select aria-label="Offer status" value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option key={value || 'ALL'} value={value}>{value || 'All statuses'}</option>)}</select></label></div>
        {error && <p className={s.error} role="alert">{error}</p>}{!data && !error && <p className={s.message}>Loading offers…</p>}{data?.length === 0 && <p className={s.message}>No offers match this filter.</p>}
        {!!data?.length && <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Task</th><th>Staff</th><th>Wave</th><th>Status</th><th>Offered</th><th>Expires / responded</th></tr></thead><tbody>
          {data.map(offer => <tr key={offer.offerId}><td><Link className={s.taskLink} to={`/operator/tasks/${offer.taskId}`}>{offer.title}</Link><p className={s.muted}>{offer.sourceCode} · {offer.zoneName}</p></td><td>{offer.staffName ?? offer.staffUserId}</td><td>{offer.waveNumber} · {offer.dispatchScope}</td><td><Chip tone={tone(offer)}>{offer.status}</Chip>{offer.closedReason && <p className={s.muted}>{offer.closedReason}</p>}</td><td>{date(offer.createdAt)}</td><td>{date(offer.respondedAt ?? offer.expiresAt)}</td></tr>)}
        </tbody></table></div>}
      </Card>
    </div>
  </OperatorLayout>;
}

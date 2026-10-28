import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listNotifications, markAllNotificationsRead, type NotificationItem } from '../api/notifications';
import { ManagerLayout } from '../components/ManagerLayout';
import { OperatorLayout } from '../components/OperatorLayout';
import { Button } from '../components/ui';
import s from './NotificationCenter.module.css';

export function OperatorNotifications() {
  return <OperatorLayout title="Notifications" subtitle="Task assignments and escalations"><Inbox role="operator" /></OperatorLayout>;
}

export function ManagerNotifications() {
  return <ManagerLayout title="Notifications" subtitle="Schedule and shift-swap updates"><Inbox role="manager" /></ManagerLayout>;
}

function Inbox({ role }: { role: 'operator' | 'manager' }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setItems(await listNotifications()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    listNotifications().then((value) => {
      if (active) setItems(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const readAll = async () => {
    setBusy(true); setError('');
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications could not be marked read.'); }
    finally { setBusy(false); }
  };

  const unread = items.filter((item) => !item.readAt).length;
  return <section className={s.inbox} aria-labelledby="notification-feed-title">
    <div className={s.inboxHeader}>
      <div><h2 id="notification-feed-title">Notification feed</h2><p>{unread ? `${unread} unread` : 'You are all caught up'}</p></div>
      <div className={s.inboxActions}><Button variant="secondary" onClick={() => void load()} disabled={loading || busy}>Refresh</Button><Button onClick={() => void readAll()} disabled={!unread || busy}>{busy ? 'Updating…' : 'Mark all as read'}</Button></div>
    </div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {loading ? <p className={s.state} role="status">Loading notifications…</p> : items.length === 0 ? <p className={s.state}>No notifications yet.</p> : (
      <ul className={s.list}>{items.map((item) => <NotificationRow key={item.notificationId} item={item} role={role} />)}</ul>
    )}
  </section>;
}

function NotificationRow({ item, role }: { item: NotificationItem; role: 'operator' | 'manager' }) {
  const destination = role === 'operator'
    ? item.taskId ? `/operator/tasks/${item.taskId}` : '/operator/tasks'
    : item.type.startsWith('SWAP_') ? '/manager/swaps' : '/manager/schedule';
  const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt));
  return <li className={`${s.notification} ${item.readAt ? '' : s.unread}`}>
    <Link to={destination} aria-label={`${item.title}: ${item.message}`}>
      <span className={s.indicator} aria-hidden="true" />
      <span className={s.notificationContent}><strong>{item.title}</strong><span>{item.message}</span><time dateTime={item.createdAt}>{time}</time></span>
      <span className={s.open}>Open</span>
    </Link>
  </li>;
}

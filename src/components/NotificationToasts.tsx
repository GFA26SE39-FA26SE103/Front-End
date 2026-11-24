import { Link } from 'react-router-dom';
import { dismissNotificationToast, useNotificationFeed } from './notificationFeed';
import s from './NotificationToasts.module.css';

/** Bottom-right pop-ups for notifications that arrive while the user is on any page. */
export function NotificationToasts({ inboxPath }: { inboxPath: string }) {
  const { toasts } = useNotificationFeed();
  return <div className={s.stack} role="region" aria-label="New notifications" aria-live="polite">
    {toasts.map((toast) => <Link key={toast.id} to={inboxPath} className={s.toast} onClick={() => dismissNotificationToast(toast.id)}>
      <strong>{toast.title}</strong>
      <span>{toast.message}</span>
    </Link>)}
  </div>;
}

/** Unread count next to the Notifications link in the sidebar. */
export function NotificationBadge() {
  const { unread } = useNotificationFeed();
  if (unread === 0) return null;
  return <span className={s.badge} aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>;
}

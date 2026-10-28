import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from '../api/notifications';
import { AdminLayout } from '../components/AdminLayout';
import { Button, Card, CardHeader, Callout, Toggle } from '../components/ui';
import s from './NotificationCenter.module.css';

type Draft = Pick<NotificationSettings, 'pushEnabled' | 'taskOfferPushEnabled' | 'taskUpdatePushEnabled' | 'shiftSwapPushEnabled'>;
const draftOf = (value: NotificationSettings): Draft => ({
  pushEnabled: value.pushEnabled,
  taskOfferPushEnabled: value.taskOfferPushEnabled,
  taskUpdatePushEnabled: value.taskUpdatePushEnabled,
  shiftSwapPushEnabled: value.shiftSwapPushEnabled,
});

export default function GlobalSettings() {
  const [saved, setSaved] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setError('');
    try {
      const value = await getNotificationSettings();
      setSaved(value);
      setDraft(draftOf(value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Notification settings could not be loaded.');
    }
  };

  useEffect(() => {
    let active = true;
    getNotificationSettings().then((value) => {
      if (!active) return;
      setSaved(value);
      setDraft(draftOf(value));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Notification settings could not be loaded.');
    });
    return () => { active = false; };
  }, []);
  const dirty = useMemo(() => saved && draft ? JSON.stringify(draftOf(saved)) !== JSON.stringify(draft) : false, [saved, draft]);

  const save = async () => {
    if (!saved || !draft) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const value = await updateNotificationSettings({ ...draft, expectedUpdatedAt: saved.updatedAt });
      setSaved(value); setDraft(draftOf(value)); setMessage('Notification settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Notification settings could not be saved.');
    } finally { setBusy(false); }
  };

  return (
    <AdminLayout title="Global settings" subtitle="Control notification delivery without disabling operational records">
      <div className={s.settingsPage}>
        <Card>
          <CardHeader title="Notifications" subtitle="Global FCM delivery policy for Staff mobile devices" />
          {!saved || !draft ? (
            <div className={s.state}>
              {error ? <><p role="alert">{error}</p><Button variant="secondary" onClick={() => void load()}>Retry</Button></> : <p role="status">Loading notification settings…</p>}
            </div>
          ) : (
            <div className={s.settingsBody}>
              {!saved.pushConfigured && (
                <Callout tone="warning" icon="alert-warning">
                  <strong>FCM is not configured on the server.</strong> Push controls stay locked until credentials and the delivery service pass staging approval.
                </Callout>
              )}
              <SettingRow title="Enable FCM push notifications" detail="Master switch for Staff mobile push delivery.">
                <Toggle size="md" label="Enable FCM push notifications" on={draft.pushEnabled} disabled={!saved.pushConfigured || busy}
                  onChange={(pushEnabled) => setDraft({ ...draft, pushEnabled })} />
              </SettingRow>
              <div className={s.categoryGroup} aria-label="Push categories">
                <SettingRow title="Task offers" detail="New task offers sent to eligible Staff devices.">
                  <Toggle label="Task offers" on={draft.taskOfferPushEnabled} disabled={!saved.pushConfigured || !draft.pushEnabled || busy}
                    onChange={(taskOfferPushEnabled) => setDraft({ ...draft, taskOfferPushEnabled })} />
                </SettingRow>
                <SettingRow title="Task updates" detail="Assignments, withdrawals, escalations and event-clear updates.">
                  <Toggle label="Task updates" on={draft.taskUpdatePushEnabled} disabled={!saved.pushConfigured || !draft.pushEnabled || busy}
                    onChange={(taskUpdatePushEnabled) => setDraft({ ...draft, taskUpdatePushEnabled })} />
                </SettingRow>
                <SettingRow title="Shifts & swaps" detail="Published schedules, shift changes and swap updates.">
                  <Toggle label="Shifts & swaps" on={draft.shiftSwapPushEnabled} disabled={!saved.pushConfigured || !draft.pushEnabled || busy}
                    onChange={(shiftSwapPushEnabled) => setDraft({ ...draft, shiftSwapPushEnabled })} />
                </SettingRow>
              </div>
              <Callout tone="info" icon="info">In-app records and web inboxes remain enabled even when FCM push is off.</Callout>
              {error && <p className={s.error} role="alert">{error}</p>}
              {message && <p className={s.success} role="status">{message}</p>}
              <div className={s.actions}>
                <Button variant="secondary" disabled={!dirty || busy} onClick={() => { setDraft(draftOf(saved)); setError(''); setMessage(''); }}>Cancel</Button>
                <Button disabled={!dirty || busy || !saved.pushConfigured} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <div className={s.settingRow}><div><h3>{title}</h3><p>{detail}</p></div>{children}</div>;
}

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAccount, listAccounts, listRoles, setAccountEnabled, updateAccount, type AccountRecord, type RoleRecord } from '../api/accounts';
import { ApiError } from '../api/client';
import { roleLabel } from '../auth/roles';
import { clearSession, loadSession, updateSessionUser } from '../auth/session';
import { AdminLayout } from '../components/AdminLayout';
import { Button, Card, CardHeader, Chip, type Tone } from '../components/ui';
import s from './UsersRoles.module.css';

type Editor = { userId: string | null; fullName: string; email: string; password: string; roleId: string };
const roleTone: Record<string, Tone> = { ADMIN: 'primary', OPERATOR: 'primary', MANAGER: 'purple', STAFF: 'warning' };
const scopes: Record<string, string> = {
  ADMIN: 'Account administration and store, floor, zone and camera configuration.',
  OPERATOR: 'Operational monitoring, incident review and task coordination.',
  MANAGER: 'Shift planning and operational reports.',
  STAFF: 'Assigned tasks, check-in and evidence submission.',
};

function editUser(user: AccountRecord): Editor {
  return { userId: user.userId, fullName: user.fullName, email: user.email, password: '', roleId: user.roleId };
}
function newUser(roles: RoleRecord[]): Editor {
  return { userId: null, fullName: '', email: '', password: '', roleId: roles.find((role) => role.name === 'STAFF')?.roleId ?? roles[0]?.roleId ?? '' };
}
function errorMessage(reason: unknown): string {
  if (reason instanceof ApiError) {
    if (reason.code === 'LAST_ACTIVE_ADMIN') return 'The last active Administrator cannot be disabled or assigned another role. Refresh the account list and try again.';
    if (reason.code === 'DUPLICATE') return 'An account with this email already exists.';
    if (reason.status === 403) return 'Only an Administrator can manage accounts.';
    return reason.message;
  }
  return 'Could not complete the request. Check your connection and try again.';
}

function AccountDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className={s.dialogHeader}>
      <h2 id={titleId}>{title}</h2>
      <button type="button" className={s.dialogClose} aria-label="Close account form" disabled={busy} onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>;
}

export default function UsersRoles() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([listAccounts(controller.signal), listRoles(controller.signal)]).then(([users, availableRoles]) => {
      if (controller.signal.aborted) return;
      setAccounts(users);
      setRoles(availableRoles);
      setReady(true);
      setLoadError('');
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(reason));
    });
    return () => controller.abort();
  }, [reload]);

  const selected = accounts.find((user) => user.userId === editor?.userId);
  const activeAdmins = accounts.filter((user) => user.role === 'ADMIN' && user.status === 'ACTIVE').length;
  const lastAdmin = selected?.role === 'ADMIN' && selected.status === 'ACTIVE' && activeAdmins <= 1;
  const self = selected?.userId === loadSession()?.user.userId;
  const visible = accounts.filter((user) => `${user.fullName} ${user.email} ${user.role}`.toLowerCase().includes(query.trim().toLowerCase()));

  function choose(next: Editor) {
    setEditor(next);
    setError('');
    setNotice('');
  }
  function closeEditor() {
    if (busy) return;
    setEditor(null);
    setError('');
  }
  function accept(updated: AccountRecord, message: string) {
    setAccounts((current) => current.some((user) => user.userId === updated.userId)
      ? current.map((user) => user.userId === updated.userId ? updated : user)
      : [...current, updated]);
    setEditor(null);
    setNotice(message);
    const currentUser = loadSession()?.user;
    if (currentUser?.userId === updated.userId) {
      if (updated.status !== 'ACTIVE' || updated.role !== currentUser.role) {
        clearSession();
        navigate('/login?reason=access-changed', { replace: true });
      } else updateSessionUser(updated);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    if (!editor.fullName.trim() || !editor.roleId) {
      setError('Enter a full name and select a role.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const request = { fullName: editor.fullName.trim(), roleId: editor.roleId };
      const updated = editor.userId
        ? await updateAccount(editor.userId, request)
        : await createAccount({ ...request, email: editor.email.trim(), password: editor.password });
      accept(updated, editor.userId ? 'Account changes saved.' : 'Account created. The user can now sign in.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function changeStatus() {
    if (!selected || busy || lastAdmin) return;
    setBusy(true);
    setError('');
    setNotice('');
    const enabled = selected.status !== 'ACTIVE';
    try {
      accept(await setAccountEnabled(selected.userId, enabled), enabled ? 'Account enabled.' : 'Account disabled. Its existing tokens are rejected by the backend.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  function refresh() {
    setEditor(null);
    setReady(false);
    setLoadError('');
    setError('');
    setNotice('');
    setReload((value) => value + 1);
  }

  return (
    <AdminLayout title="Users & Roles" subtitle={ready ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${roles.length} roles` : 'Account administration'}>
      <div className={s.workspace}>
        <Card className={s.users}>
          <CardHeader title="Users" subtitle="Create accounts and manage their access.">
            <Button variant="secondary" disabled={busy || !ready} onClick={refresh}>Refresh</Button>
            <Button disabled={busy || !ready || !roles.length} onClick={() => choose(newUser(roles))}>Create account</Button>
          </CardHeader>
          {notice && <p className={s.success} role="status">{notice}</p>}
          {loadError ? <div className={s.feedback} role="alert"><p>{loadError}</p><Button variant="secondary" onClick={refresh}>Retry loading accounts</Button></div>
            : !ready ? <p role="status" className={s.note}>Loading accounts and roles…</p>
            : <>
              <label className={s.search}>Search accounts<input type="search" placeholder="Name, email or role" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th><span className={s.srOnly}>Actions</span></th></tr></thead>
                  <tbody>{visible.map((user) => <tr key={user.userId} className={selected?.userId === user.userId ? s.rowSelected : ''}>
                    <td className={s.person}>{user.fullName}{user.userId === loadSession()?.user.userId && <span className={s.you}>You</span>}</td>
                    <td className={s.email}>{user.email}</td>
                    <td><Chip tone={roleTone[user.role] ?? 'neutral'} pill>{roleLabel(user.role)}</Chip></td>
                    <td><Chip tone={user.status === 'ACTIVE' ? 'success' : 'neutral'}>{user.status === 'ACTIVE' ? 'Active' : 'Disabled'}</Chip></td>
                    <td><Button variant="secondary" disabled={busy} aria-label={`Edit ${user.email}`} onClick={() => choose(editUser(user))}>Edit</Button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              {!visible.length && <p className={s.note}>{accounts.length ? 'No accounts match your search.' : 'No accounts yet. Create an account to get started.'}</p>}
              <p className={s.note}>Disabling an account blocks sign-in and invalidates its existing tokens. Keep at least one active Administrator.</p>
            </>}
        </Card>

        {ready && <Card className={s.roles}>
          <CardHeader title="Roles" subtitle="System roles and their responsibilities." />
          <div className={s.roleGrid}>
            {roles.map((role) => <div className={s.role} key={role.roleId}>
              <Chip tone={roleTone[role.name] ?? 'neutral'} pill>{roleLabel(role.name)}</Chip>
              <p>{role.description || scopes[role.name] || 'Access is defined by the system.'}</p>
            </div>)}
          </div>
        </Card>}

        {ready && editor && <AccountDialog title={editor.userId ? 'Edit account' : 'Create account'} busy={busy} onClose={closeEditor}>
            {self && <p className={s.note}>You are editing your own account.</p>}
            <form className={s.form} onSubmit={save} aria-busy={busy}>
              <fieldset disabled={busy}>
                <label>Full name<input autoComplete="name" required maxLength={150} value={editor.fullName} onChange={(event) => setEditor({ ...editor, fullName: event.target.value })} /></label>
                <label>Email<input type="email" autoComplete="off" required maxLength={255} readOnly={Boolean(editor.userId)} value={editor.email} onChange={(event) => setEditor({ ...editor, email: event.target.value })} /></label>
                {!editor.userId && <label>Password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={editor.password} onChange={(event) => setEditor({ ...editor, password: event.target.value })} /><span className={s.note}>12–128 characters. Share the initial password with the account owner privately.</span></label>}
                <label>Role<select required value={editor.roleId} onChange={(event) => setEditor({ ...editor, roleId: event.target.value })}>
                  {roles.map((role) => <option key={role.roleId} value={role.roleId} disabled={lastAdmin && role.name !== 'ADMIN'}>{roleLabel(role.name)}</option>)}
                </select></label>
                {lastAdmin && <p className={s.note}>This is the last active Administrator. Its role and active status must be preserved.</p>}
                {self && !lastAdmin && <p className={s.note}>Changing your own role or disabling your account signs you out immediately.</p>}
                <div className={s.formActions}>
                  <Button variant="secondary" disabled={busy} onClick={closeEditor}>Cancel</Button>
                  <Button type="submit" disabled={busy || !roles.length}>{busy ? 'Saving…' : editor.userId ? 'Save changes' : 'Create account'}</Button>
                </div>
                {selected && <Button block variant={selected.status === 'ACTIVE' ? 'dangerGhost' : 'secondary'} disabled={busy || lastAdmin} onClick={() => void changeStatus()}>{selected.status === 'ACTIVE' ? 'Disable account' : 'Enable account'}</Button>}
              </fieldset>
              {error && <p className={s.error} role="alert">{error}</p>}
            </form>
        </AccountDialog>}
      </div>
    </AdminLayout>
  );
}

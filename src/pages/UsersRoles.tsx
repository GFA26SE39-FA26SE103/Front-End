import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { Icon } from '../components/Icon';
import { Button, Card, Checkbox, Chip, type Tone } from '../components/ui';
import { defaultPermissions, permissions, users, type Role } from '../data/mock';
import s from './UsersRoles.module.css';

const roleTone: Record<Role, Tone> = { Administrator: 'primary', Manager: 'purple', Operator: 'primary', Staff: 'warning' };

export default function UsersRoles() {
  const [role, setRole] = useState<Role>('Operator');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [perms, setPerms] = useState(defaultPermissions);
  const [saved, setSaved] = useState(false);

  function togglePermission(p: string) {
    setPerms((all) => ({ ...all, [role]: all[role].includes(p) ? all[role].filter((x) => x !== p) : [...all[role], p] }));
    setSaved(false);
  }

  return (
    <AdminLayout title="Users & Roles" subtitle={`${users.length} users · 4 roles`}>
      <Card className={s.users}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Users</h2>
          <Button icon="mail-white" style={{ height: 30, fontSize: 11 }}>Invite user</Button>
        </div>
        <div role="table">
          <div className={`${s.row} ${s.head}`} role="row">
            <span>NAME</span>
            <span>EMAIL</span>
            <span>ROLE</span>
            <span>STATUS</span>
          </div>
          {users.map((u) => (
            <button
              key={u.email}
              role="row"
              className={`${s.row} ${selectedUser === u.email ? s.rowSelected : ''}`}
              onClick={() => { setSelectedUser(u.email); setRole(u.role); setSaved(false); }}
            >
              <span className={s.person}>
                <span className={s.avatar}><Icon name="user-avatar" size={17} /></span>
                {u.name}
              </span>
              <span className={s.email}>{u.email}</span>
              <span><Chip tone={roleTone[u.role]} pill>{u.role}</Chip></span>
              <span className={s.status} style={{ color: u.status === 'Active' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                <Icon name={u.status === 'Active' ? 'dot-success-lg' : 'dot-warning-lg'} size={8} />
                {u.status}
              </span>
            </button>
          ))}
        </div>
        <p className={s.note}>Deactivating a staff account anonymises their evidence photos, check-in times and performance records (personal-data law).</p>
      </Card>

      <Card className={s.perms}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Role permissions</h2>
          <Chip tone={roleTone[role]} pill>{role.toUpperCase()}</Chip>
        </div>
        {permissions.map((p) => {
          const on = perms[role].includes(p);
          return (
            <div key={p} className={`${s.perm} ${on ? s.permOn : ''}`}>
              <Checkbox checked={on} onChange={() => togglePermission(p)} label={p} />
              {p}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        {saved && <p className={s.saved}>Permissions saved for {role}.</p>}
        <Button size="lg" block style={{ height: 42, fontSize: 13 }} onClick={() => setSaved(true)}>Save permissions</Button>
      </Card>
    </AdminLayout>
  );
}

export type AppRole = 'ADMIN' | 'OPERATOR' | 'MANAGER' | 'STAFF';

export const roleLabels: Record<AppRole, string> = {
  ADMIN: 'Administrator', OPERATOR: 'Operator', MANAGER: 'Manager', STAFF: 'Staff',
};

export function isAppRole(role: string): role is AppRole {
  return Object.hasOwn(roleLabels, role);
}

export function roleHome(role: string): string {
  switch (role) {
    case 'ADMIN': return '/admin/dashboard';
    case 'OPERATOR': return '/operator/dashboard';
    case 'MANAGER': return '/manager/dashboard';
    case 'STAFF': return '/staff/dashboard';
    default: return '/access-denied';
  }
}

export function roleLabel(role: string): string {
  return isAppRole(role) ? roleLabels[role] : role;
}

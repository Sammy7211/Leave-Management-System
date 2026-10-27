// src/dashboards.js
// Each role's dashboard, used by the login redirect and the sidebar link.
export const DASHBOARDS = {
  employee: { to: '/employee', label: 'My Dashboard', role: 'Employee' },
  manager: { to: '/manager', label: 'Manager Dashboard', role: 'Manager' },
  hr: { to: '/hr', label: 'HR Dashboard', role: 'HR' },
  admin: { to: '/admin', label: 'Admin Dashboard', role: 'Admin' },
};

// Where a user goes after logging in
export function homePath(user) {
  if (user?.mustChangePassword) return '/change-password';
  return DASHBOARDS[user?.role]?.to || '/login';
}

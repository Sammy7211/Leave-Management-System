// src/services/authService.js

// Mock user database
// IDs match the employee list in AdminDashboard so CSV exports resolve names.
const users = [
  { id: 'EMP001', name: 'Alice', email: 'manager@example.com', password: '1234', role: 'manager' },
  { id: 'EMP002', name: 'Bob', email: 'hr@example.com', password: '1234', role: 'hr' },
  { id: 'EMP003', name: 'Jane Employee', email: 'employee@example.com', password: '1234', role: 'employee' },
  { id: 'EMP004', name: 'Admin User', email: 'admin@example.com', password: '1234', role: 'admin' },
];

// Simulate login
export async function login(email, password) {
  // In real app: call API with fetch/axios
  const match = users.find(u => u.email === email && u.password === password);

  if (!match) {
    throw new Error('Invalid credentials');
  }

  // Never keep the password around
  const { password: _password, ...user } = match;

  // Simulate token
  const token = 'mockToken-' + Date.now();

  // Save to localStorage
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));

  return user;
}

// Read the logged-in user back from localStorage (survives page reloads)
export function getCurrentUser() {
  if (!localStorage.getItem('authToken')) return null;
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

// Logout
export function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('role'); // left over from older logins
}

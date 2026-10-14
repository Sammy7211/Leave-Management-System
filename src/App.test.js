import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';

function renderApp(path = '/') {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <RequestsProvider>
        <App />
      </RequestsProvider>
    </AuthProvider>
  );
}

beforeEach(() => localStorage.clear());

test('shows the login page when not logged in', () => {
  renderApp('/employee');
  expect(screen.getByText(/LeaveSys™ Login/)).toBeInTheDocument();
});

test('employee only sees their own leave requests', () => {
  localStorage.setItem('authToken', 'mockToken');
  localStorage.setItem('user', JSON.stringify({ id: 'EMP003', name: 'Jane Employee', role: 'employee' }));
  localStorage.setItem('requests', JSON.stringify([
    { id: 1, employeeId: 'EMP003', employee: 'Jane Employee', role: 'Employee', type: 'Annual Leave', reason: 'Mine', status: 'Pending Manager Approval' },
    { id: 2, employeeId: 'EMP999', employee: 'Someone Else', role: 'Employee', type: 'Sick Leave', reason: 'Not mine', status: 'Approved (Final)' },
  ]));

  renderApp('/employee');

  expect(screen.getByText('Mine')).toBeInTheDocument();
  expect(screen.queryByText('Not mine')).not.toBeInTheDocument();
});

test('employee cannot open another role\'s dashboard', () => {
  localStorage.setItem('authToken', 'mockToken');
  localStorage.setItem('user', JSON.stringify({ id: 'EMP003', name: 'Jane Employee', role: 'employee' }));

  renderApp('/admin');
  expect(screen.getByText(/LeaveSys™ Login/)).toBeInTheDocument();
});

test('manager can review HR leave requests', () => {
  localStorage.setItem('authToken', 'mockToken');
  localStorage.setItem('user', JSON.stringify({ id: 'EMP001', name: 'Alice', role: 'manager' }));
  localStorage.setItem('requests', JSON.stringify([
    { id: 1, employeeId: 'EMP002', employee: 'Bob', role: 'HR', type: 'Annual Leave', reason: 'HR trip', status: 'Pending Manager Approval' },
  ]));

  renderApp('/manager');

  expect(screen.getByText('HR trip')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
});

test('rejecting a request requires a reason, which is saved to its history', () => {
  localStorage.setItem('authToken', 'mockToken');
  localStorage.setItem('user', JSON.stringify({ id: 'EMP001', name: 'Alice', role: 'manager' }));
  localStorage.setItem('requests', JSON.stringify([
    { id: 1, employeeId: 'EMP003', employee: 'Jane Employee', role: 'Employee', type: 'Annual Leave', from: '2099-01-05', to: '2099-01-06', days: 2, reason: 'Trip', status: 'Pending Manager Approval', history: [] },
  ]));

  renderApp('/manager');
  userEvent.click(screen.getByRole('button', { name: 'Review' }));
  userEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please give a reason');

  userEvent.type(screen.getByRole('textbox'), 'Team is short-staffed that week');
  userEvent.click(screen.getByRole('button', { name: 'Reject' }));

  const [saved] = JSON.parse(localStorage.getItem('requests'));
  expect(saved.status).toBe('Rejected by Manager');
  expect(saved.history.at(-1)).toMatchObject({ by: 'Alice', comment: 'Team is short-staffed that week' });
});

test('sidebar only links to the user\'s own dashboard', () => {
  localStorage.setItem('authToken', 'mockToken');
  localStorage.setItem('user', JSON.stringify({ id: 'EMP003', name: 'Jane Employee', role: 'employee' }));

  renderApp('/employee');
  expect(screen.getByRole('link', { name: 'My Dashboard' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
});

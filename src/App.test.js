import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';
import * as authService from './services/authService';

// No real server in these tests: the auth calls are faked
jest.mock('./services/authService');

const JANE = { id: 3, staffNo: 'EMP003', name: 'Jane Employee', role: 'employee' };
const ALICE = { id: 1, staffNo: 'EMP001', name: 'Alice', role: 'manager' };

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

const loggedInAs = (user) => authService.getCurrentUser.mockResolvedValue(user);

beforeEach(() => {
  localStorage.clear();
  authService.getCurrentUser.mockResolvedValue(null);
});

test('shows the login page when not logged in', async () => {
  renderApp('/employee');
  expect(await screen.findByText(/LeaveSys™ Login/)).toBeInTheDocument();
});

test('logging in sends the user to their dashboard', async () => {
  authService.login.mockResolvedValue(JANE);
  renderApp('/login');

  userEvent.type(await screen.findByPlaceholderText('Email'), 'employee@example.com');
  userEvent.type(screen.getByPlaceholderText('Password'), 'secret-password');
  userEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Employee Dashboard')).toBeInTheDocument();
  expect(authService.login).toHaveBeenCalledWith('employee@example.com', 'secret-password');
});

test('a failed login shows the server\'s error', async () => {
  authService.login.mockRejectedValue(new Error('Invalid email or password.'));
  renderApp('/login');

  userEvent.type(await screen.findByPlaceholderText('Email'), 'employee@example.com');
  userEvent.type(screen.getByPlaceholderText('Password'), 'wrong');
  userEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
});

test('employee only sees their own leave requests', async () => {
  loggedInAs(JANE);
  localStorage.setItem('requests', JSON.stringify([
    { id: 1, employeeId: 3, employee: 'Jane Employee', role: 'Employee', type: 'Annual Leave', reason: 'Mine', status: 'Pending Manager Approval' },
    { id: 2, employeeId: 99, employee: 'Someone Else', role: 'Employee', type: 'Sick Leave', reason: 'Not mine', status: 'Approved (Final)' },
  ]));

  renderApp('/employee');

  expect(await screen.findByText('Mine')).toBeInTheDocument();
  expect(screen.queryByText('Not mine')).not.toBeInTheDocument();
});

test('employee cannot open another role\'s dashboard', async () => {
  loggedInAs(JANE);
  renderApp('/admin');
  expect(await screen.findByText(/LeaveSys™ Login/)).toBeInTheDocument();
});

test('manager can review HR leave requests', async () => {
  loggedInAs(ALICE);
  localStorage.setItem('requests', JSON.stringify([
    { id: 1, employeeId: 2, employee: 'Bob', role: 'HR', type: 'Annual Leave', reason: 'HR trip', status: 'Pending Manager Approval' },
  ]));

  renderApp('/manager');

  expect(await screen.findByText('HR trip')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
});

test('rejecting a request requires a reason, which is saved to its history', async () => {
  loggedInAs(ALICE);
  localStorage.setItem('requests', JSON.stringify([
    { id: 1, employeeId: 3, employee: 'Jane Employee', role: 'Employee', type: 'Annual Leave', from: '2099-01-05', to: '2099-01-06', days: 2, reason: 'Trip', status: 'Pending Manager Approval', history: [] },
  ]));

  renderApp('/manager');
  userEvent.click(await screen.findByRole('button', { name: 'Review' }));
  userEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please give a reason');

  userEvent.type(screen.getByRole('textbox'), 'Team is short-staffed that week');
  userEvent.click(screen.getByRole('button', { name: 'Reject' }));

  const [saved] = JSON.parse(localStorage.getItem('requests'));
  expect(saved.status).toBe('Rejected by Manager');
  expect(saved.history.at(-1)).toMatchObject({ by: 'Alice', comment: 'Team is short-staffed that week' });
});

test('sidebar only links to the user\'s own dashboard', async () => {
  loggedInAs(JANE);
  renderApp('/employee');
  expect(await screen.findByRole('link', { name: 'My Dashboard' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';
import * as authService from './services/authService';
import * as requestsService from './services/requestsService';

// No real server in these tests: the API calls are faked
jest.mock('./services/authService');
jest.mock('./services/requestsService');

const JANE = { id: 3, staffNo: 'EMP003', name: 'Jane Employee', role: 'employee' };
const ALICE = { id: 1, staffNo: 'EMP001', name: 'Alice', role: 'manager' };

const janesRequest = (overrides = {}) => ({
  id: 1, employeeId: 3, staffNo: 'EMP003', employee: 'Jane Employee', role: 'Employee',
  type: 'Annual Leave', from: '2099-03-02', to: '2099-03-03', days: 2, reason: 'Trip',
  attachment: null, status: 'Pending Manager Approval', history: [], ...overrides,
});

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
const serverHas = (requests) => requestsService.fetchRequests.mockResolvedValue(requests);

beforeEach(() => {
  authService.getCurrentUser.mockResolvedValue(null);
  serverHas([]);
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

test('employee dashboard shows their requests from the server', async () => {
  loggedInAs(JANE);
  serverHas([janesRequest({ reason: 'Mine' })]);

  renderApp('/employee');

  expect(await screen.findByText('Mine')).toBeInTheDocument();
  expect(requestsService.fetchRequests).toHaveBeenCalled();
});

test('employee cannot open another role\'s dashboard', async () => {
  loggedInAs(JANE);
  renderApp('/admin');
  expect(await screen.findByText(/LeaveSys™ Login/)).toBeInTheDocument();
});

async function fillLeaveForm() {
  userEvent.click(await screen.findByRole('button', { name: '+ Apply for Leave' }));
  userEvent.selectOptions(screen.getByLabelText(/^Leave Type/), 'Annual Leave');
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2099-03-02' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2099-03-03' } });
  userEvent.type(screen.getByLabelText('Reason'), 'Family visit');
  userEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
}

test('applying for leave sends the request to the server', async () => {
  loggedInAs(JANE);
  requestsService.createRequest.mockResolvedValue(janesRequest({ reason: 'Family visit' }));
  renderApp('/employee');

  await fillLeaveForm();

  expect(await screen.findByText('Leave request submitted successfully')).toBeInTheDocument();
  expect(requestsService.createRequest).toHaveBeenCalledWith({
    type: 'Annual Leave', from: '2099-03-02', to: '2099-03-03', reason: 'Family visit', attachment: null,
  });
  expect(screen.getByText('Family visit')).toBeInTheDocument(); // now in the table
});

test('if the server refuses a leave request, the form shows why', async () => {
  loggedInAs(JANE);
  requestsService.createRequest.mockRejectedValue(new Error('You only have 1 days of Annual Leave left for 2099.'));
  renderApp('/employee');

  await fillLeaveForm();

  expect(await screen.findByRole('alert')).toHaveTextContent('You only have 1 days');
});

test('manager can review HR leave requests', async () => {
  loggedInAs(ALICE);
  serverHas([janesRequest({ id: 2, employeeId: 2, employee: 'Bob', role: 'HR', reason: 'HR trip' })]);

  renderApp('/manager');

  expect(await screen.findByText('HR trip')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
});

test('rejecting a request requires a reason, which is sent to the server', async () => {
  loggedInAs(ALICE);
  serverHas([janesRequest()]);
  requestsService.decideRequest.mockResolvedValue(janesRequest({ status: 'Rejected by Manager' }));

  renderApp('/manager');
  userEvent.click(await screen.findByRole('button', { name: 'Review' }));
  userEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please give a reason');
  expect(requestsService.decideRequest).not.toHaveBeenCalled();

  userEvent.type(screen.getByRole('textbox'), 'Team is short-staffed that week');
  userEvent.click(screen.getByRole('button', { name: 'Reject' }));

  expect(await screen.findByText('Request Rejected')).toBeInTheDocument();
  expect(requestsService.decideRequest).toHaveBeenCalledWith(1, 'reject', 'Team is short-staffed that week');
  expect(screen.getByText('Rejected by Manager')).toBeInTheDocument();
});

test('if the server refuses a decision, the review dialog shows why', async () => {
  loggedInAs(ALICE);
  serverHas([janesRequest()]);
  requestsService.decideRequest.mockRejectedValue(new Error('This request has already been decided.'));

  renderApp('/manager');
  userEvent.click(await screen.findByRole('button', { name: 'Review' }));
  userEvent.click(screen.getByRole('button', { name: 'Recommend' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('This request has already been decided.');
  await waitFor(() => expect(requestsService.fetchRequests).toHaveBeenCalledTimes(2)); // reloaded to show the current state
});

test('shows an error with a retry button if requests cannot be loaded', async () => {
  loggedInAs(JANE);
  requestsService.fetchRequests.mockRejectedValueOnce(new Error('Cannot reach the server. Is it running?'));

  renderApp('/employee');

  expect(await screen.findByText(/Could not load leave requests/)).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByText(/Could not load leave requests/)).not.toBeInTheDocument());
});

test('sidebar only links to the user\'s own dashboard', async () => {
  loggedInAs(JANE);
  renderApp('/employee');
  expect(await screen.findByRole('link', { name: 'My Dashboard' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
});

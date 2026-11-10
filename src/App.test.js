import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { RequestsProvider } from './context/RequestsContext';
import { PolicyProvider } from './context/PolicyContext';
import * as authService from './services/authService';
import * as requestsService from './services/requestsService';
import * as usersService from './services/usersService';
import * as policyService from './services/policyService';
import * as reportsService from './services/reportsService';
import * as attachmentsService from './services/attachmentsService';

// No real server in these tests: the API calls are faked
jest.mock('./services/authService');
jest.mock('./services/requestsService');
jest.mock('./services/usersService');
jest.mock('./services/policyService');
jest.mock('./services/reportsService');
// Keep the real file checks; fake only the calls to the server
jest.mock('./services/attachmentsService', () => ({
  ...jest.requireActual('./services/attachmentsService'),
  uploadAttachment: jest.fn(),
  downloadAttachment: jest.fn(),
}));

const JANE = { id: 3, staffNo: 'EMP003', name: 'Jane Employee', role: 'employee' };
const ALICE = { id: 1, staffNo: 'EMP001', name: 'Alice', role: 'manager' };
const ADMIN = { id: 4, staffNo: 'EMP004', name: 'Admin User', role: 'admin' };

const leaveType = (id, name, overrides = {}) => ({
  id, name, entitlement: 21, unit: 'working', attachmentRequiredOver: null, active: true, ...overrides,
});
const POLICY = {
  leaveTypes: [
    leaveType(1, 'Annual Leave'),
    leaveType(2, 'Sick Leave', { entitlement: 14, attachmentRequiredOver: 2 }),
    leaveType(3, 'Old Leave', { active: false }),
  ],
  holidays: [],
};

const janesRequest = (overrides = {}) => ({
  id: 1, employeeId: 3, staffNo: 'EMP003', employee: 'Jane Employee', role: 'Employee',
  type: 'Annual Leave', from: '2099-03-02', to: '2099-03-03', days: 2, reason: 'Trip',
  attachment: null, status: 'Pending Manager Approval', history: [], ...overrides,
});

function renderApp(path = '/') {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <PolicyProvider>
        <RequestsProvider>
          <App />
        </RequestsProvider>
      </PolicyProvider>
    </AuthProvider>
  );
}

const loggedInAs = (user) => authService.getCurrentUser.mockResolvedValue(user);
const serverHas = (requests) => requestsService.fetchRequests.mockResolvedValue(requests);

beforeEach(() => {
  authService.getCurrentUser.mockResolvedValue(null);
  serverHas([]);
  policyService.fetchPolicy.mockResolvedValue(POLICY);
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
    type: 'Annual Leave', from: '2099-03-02', to: '2099-03-03', reason: 'Family visit', attachmentId: null,
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

test('a user with a temporary password must change it before using the app', async () => {
  loggedInAs({ ...JANE, mustChangePassword: true });
  authService.changePassword.mockResolvedValue({ ...JANE, mustChangePassword: false });

  renderApp('/employee');

  expect(await screen.findByText(/You are using a temporary password/)).toBeInTheDocument();
  expect(requestsService.fetchRequests).not.toHaveBeenCalled(); // the server would refuse

  userEvent.type(screen.getByLabelText(/Temporary password/), 'temp-pass-123');
  userEvent.type(screen.getByLabelText(/^New password/), 'my-own-password');
  userEvent.type(screen.getByLabelText(/^Confirm new password/), 'my-own-password');
  userEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  expect(await screen.findByText('Employee Dashboard')).toBeInTheDocument();
  expect(authService.changePassword).toHaveBeenCalledWith('temp-pass-123', 'my-own-password');
});

test('the change-password form checks the new passwords match', async () => {
  loggedInAs(JANE);
  renderApp('/change-password');

  userEvent.type(await screen.findByLabelText(/Current password/), 'old-password');
  userEvent.type(screen.getByLabelText(/^New password/), 'my-own-password');
  userEvent.type(screen.getByLabelText(/^Confirm new password/), 'something-else');
  userEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  expect(screen.getByRole('alert')).toHaveTextContent('do not match');
  expect(authService.changePassword).not.toHaveBeenCalled();
});

test('admin sees staff from the server and can add a staff member', async () => {
  loggedInAs(ADMIN);
  usersService.fetchUsers.mockResolvedValue([
    { id: 1, staffNo: 'EMP001', name: 'Alice', email: 'manager@example.com', role: 'manager', managerId: null, managerName: null, active: true },
    { id: 3, staffNo: 'EMP003', name: 'Jane Employee', email: 'employee@example.com', role: 'employee', managerId: 1, managerName: 'Alice', active: true },
  ]);
  usersService.createUser.mockResolvedValue({ id: 9, name: 'Wanjiru Kamau' });

  renderApp('/admin');

  expect(await screen.findByText('employee@example.com')).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: '+ Add Staff Member' }));
  userEvent.type(screen.getByLabelText('Staff number'), 'KAL-100');
  userEvent.type(screen.getByLabelText('Full name'), 'Wanjiru Kamau');
  userEvent.type(screen.getByLabelText('Email'), 'wanjiru@example.com');
  userEvent.selectOptions(screen.getByLabelText(/^Line manager/), 'Alice (EMP001)');
  userEvent.type(screen.getByLabelText(/^Temporary password/), 'temp-pass-123');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText(/Account created for Wanjiru Kamau/)).toBeInTheDocument();
  expect(usersService.createUser).toHaveBeenCalledWith({
    staffNo: 'KAL-100', name: 'Wanjiru Kamau', email: 'wanjiru@example.com', role: 'employee',
    managerId: 1, temporaryPassword: 'temp-pass-123',
  });
});

test('if the server refuses a new account, the form shows why', async () => {
  loggedInAs(ADMIN);
  usersService.fetchUsers.mockResolvedValue([]);
  usersService.createUser.mockRejectedValue(new Error('Another account already uses that email address.'));

  renderApp('/admin');
  userEvent.click(await screen.findByRole('button', { name: '+ Add Staff Member' }));
  userEvent.type(screen.getByLabelText('Staff number'), 'KAL-100');
  userEvent.type(screen.getByLabelText('Full name'), 'Wanjiru Kamau');
  userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
  userEvent.type(screen.getByLabelText(/^Temporary password/), 'temp-pass-123');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('already uses that email');
});

test('the leave form offers the active leave types from the server', async () => {
  loggedInAs(JANE);
  renderApp('/employee');

  userEvent.click(await screen.findByRole('button', { name: '+ Apply for Leave' }));

  const options = Array.from(screen.getByLabelText(/^Leave Type/).options).map(o => o.textContent);
  expect(options).toEqual(['Select Leave Type', 'Annual Leave', 'Sick Leave']); // not the inactive one
});

test('admin can add a gazetted holiday', async () => {
  loggedInAs(ADMIN);
  usersService.fetchUsers.mockResolvedValue([]);
  policyService.addHoliday.mockResolvedValue({
    ...POLICY, holidays: [{ id: 1, date: '2099-03-04', name: 'Idd-ul-Fitr' }], recalculated: 2,
  });

  renderApp('/admin');

  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2099-03-04' } });
  userEvent.type(screen.getByLabelText('Name'), 'Idd-ul-Fitr');
  userEvent.click(screen.getByRole('button', { name: 'Add Holiday' }));

  expect(await screen.findByText(/Idd-ul-Fitr was added as a public holiday. 2 booked request\(s\) were recounted/)).toBeInTheDocument();
  expect(policyService.addHoliday).toHaveBeenCalledWith('2099-03-04', 'Idd-ul-Fitr');
  expect(screen.getAllByText('Idd-ul-Fitr').length).toBeGreaterThan(0); // in the holidays table
  await waitFor(() => expect(requestsService.fetchRequests).toHaveBeenCalledTimes(2)); // requests reloaded
});

test('admin can change a leave entitlement', async () => {
  loggedInAs(ADMIN);
  usersService.fetchUsers.mockResolvedValue([]);
  policyService.updateLeaveType.mockResolvedValue({ ...POLICY, recalculated: 0 });

  renderApp('/admin');

  await screen.findByText('Leave Types');
  const annualRow = screen.getAllByText('Annual Leave').map(el => el.closest('tr')).find(row => row?.textContent.includes('Working days'));
  userEvent.click(within(annualRow).getByRole('button', { name: 'Edit' }));
  const days = screen.getByLabelText('Days per year');
  userEvent.clear(days);
  userEvent.type(days, '24');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Annual Leave was saved.')).toBeInTheDocument();
  expect(policyService.updateLeaveType).toHaveBeenCalledWith(1, {
    name: 'Annual Leave', entitlement: 24, unit: 'working', attachmentRequiredOver: null, active: true,
  });
});

test('HR can download reports for a chosen year', async () => {
  loggedInAs({ id: 2, staffNo: 'EMP002', name: 'Bob', role: 'hr' });
  reportsService.downloadReport.mockResolvedValueOnce().mockRejectedValueOnce(new Error('Choose a valid year.'));
  const lastYear = new Date().getFullYear() - 1;

  renderApp('/hr');

  userEvent.selectOptions(await screen.findByLabelText('Year'), String(lastYear));
  userEvent.click(screen.getByRole('button', { name: 'Download Leave Balances (CSV)' }));
  await waitFor(() => expect(reportsService.downloadReport).toHaveBeenCalledWith('balances', lastYear));

  userEvent.click(await screen.findByRole('button', { name: 'Download Leave Requests (CSV)' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid year.');
});

async function startSickLeave() {
  userEvent.click(await screen.findByRole('button', { name: '+ Apply for Leave' }));
  userEvent.selectOptions(screen.getByLabelText(/^Leave Type/), 'Sick Leave');
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2099-03-02' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2099-03-06' } }); // 5 days: needs a document
  userEvent.type(screen.getByLabelText('Reason'), 'Flu');
}

test('a sick note is uploaded before the request is sent', async () => {
  loggedInAs(JANE);
  attachmentsService.uploadAttachment.mockResolvedValue({ id: 7, name: 'note.pdf', size: 1000, type: 'application/pdf' });
  requestsService.createRequest.mockResolvedValue(janesRequest({ type: 'Sick Leave', reason: 'Flu' }));
  renderApp('/employee');

  await startSickLeave();
  expect(screen.getByRole('alert')).toHaveTextContent('supporting document');

  const file = new File(['%PDF-1.4'], 'note.pdf', { type: 'application/pdf' });
  userEvent.upload(screen.getByLabelText(/^Attachment/), file);
  userEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

  expect(await screen.findByText('Leave request submitted successfully')).toBeInTheDocument();
  expect(attachmentsService.uploadAttachment).toHaveBeenCalledWith(file);
  expect(requestsService.createRequest).toHaveBeenCalledWith({
    type: 'Sick Leave', from: '2099-03-02', to: '2099-03-06', reason: 'Flu', attachmentId: 7,
  });
});

test('if the request is refused after uploading, a retry reuses the uploaded file', async () => {
  loggedInAs(JANE);
  attachmentsService.uploadAttachment.mockResolvedValue({ id: 7, name: 'note.pdf', size: 1000, type: 'application/pdf' });
  requestsService.createRequest
    .mockRejectedValueOnce(new Error('Cannot reach the server. Is it running?'))
    .mockResolvedValueOnce(janesRequest({ type: 'Sick Leave', reason: 'Flu' }));
  renderApp('/employee');

  await startSickLeave();
  userEvent.upload(screen.getByLabelText(/^Attachment/), new File(['%PDF-1.4'], 'note.pdf', { type: 'application/pdf' }));
  userEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');

  userEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
  expect(await screen.findByText('Leave request submitted successfully')).toBeInTheDocument();
  expect(attachmentsService.uploadAttachment).toHaveBeenCalledTimes(1);
});

test('unsupported files are flagged before uploading', async () => {
  loggedInAs(JANE);
  renderApp('/employee');

  await startSickLeave();
  userEvent.upload(screen.getByLabelText(/^Attachment/), new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }), undefined, { applyAccept: false });

  expect(screen.getByRole('alert')).toHaveTextContent('Only PDF, JPEG, PNG and Word documents');
  expect(screen.getByRole('button', { name: 'Submit Request' })).toBeDisabled();
  expect(attachmentsService.uploadAttachment).not.toHaveBeenCalled();
});

test('reviewers can download the supporting document', async () => {
  loggedInAs(ALICE);
  serverHas([janesRequest({ type: 'Sick Leave', attachment: { id: 7, name: 'note.pdf', size: 2048, type: 'application/pdf' } })]);
  attachmentsService.downloadAttachment.mockResolvedValue();

  renderApp('/manager');
  userEvent.click(await screen.findByRole('button', { name: 'Review' }));
  expect(screen.getByText(/note\.pdf \(2 KB\)/)).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Download' }));

  await waitFor(() => expect(attachmentsService.downloadAttachment).toHaveBeenCalledWith(1, 'note.pdf'));
});

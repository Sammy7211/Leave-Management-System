// server/test/users.test.js
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { TEST_PASSWORD, resetDb, createUser, closeDb } from './helpers.js';

let admin, alice, jane, asAdmin;

beforeEach(async () => {
  await resetDb();
  admin = await createUser({ name: 'Admin', role: 'admin' });
  alice = await createUser({ name: 'Alice', role: 'manager' });
  jane = await createUser({ name: 'Jane', role: 'employee', managerId: alice.id });
  asAdmin = await loginAs(admin);
});
after(closeDb);

async function loginAs(user, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return agent;
}

const newStaff = (overrides = {}) => ({
  staffNo: 'KAL-100', name: 'Wanjiru Kamau', email: 'Wanjiru@Example.com', role: 'employee',
  managerId: alice.id, temporaryPassword: 'temporary-pass', ...overrides,
});

test('only admins can manage staff', async () => {
  const asManager = await loginAs(alice);
  assert.equal((await asManager.get('/api/users')).status, 403);
  assert.equal((await asManager.post('/api/users').send(newStaff())).status, 403);
  assert.equal((await request(app).get('/api/users')).status, 401);
});

test('lists staff with their line manager, and never password hashes', async () => {
  const res = await asAdmin.get('/api/users');

  assert.equal(res.status, 200);
  const janeRow = res.body.users.find(u => u.id === jane.id);
  assert.equal(janeRow.managerName, 'Alice');
  assert.equal(JSON.stringify(res.body).includes('password_hash'), false);
  assert.equal(JSON.stringify(res.body).includes('$2'), false); // bcrypt hashes start with $2
});

test('a new account logs in with its temporary password and must change it', async () => {
  const res = await asAdmin.post('/api/users').send(newStaff());

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.user.email, 'wanjiru@example.com'); // stored lowercase
  assert.equal(res.body.user.mustChangePassword, true);
  assert.equal(res.body.user.managerName, 'Alice');

  const agent = await loginAs({ email: 'wanjiru@example.com' }, 'temporary-pass');
  assert.equal((await agent.get('/api/requests')).body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('duplicate emails and staff numbers are refused with a clear message', async () => {
  const sameEmail = await asAdmin.post('/api/users').send(newStaff({ email: jane.email.toUpperCase() }));
  assert.equal(sameEmail.status, 409);
  assert.match(sameEmail.body.error, /email/);

  const sameStaffNo = await asAdmin.post('/api/users').send(newStaff({ staffNo: jane.staffNo }));
  assert.equal(sameStaffNo.status, 409);
  assert.match(sameStaffNo.body.error, /staff number/);
});

test('invalid details are refused', async () => {
  const expectError = async (overrides, pattern) => {
    const res = await asAdmin.post('/api/users').send(newStaff(overrides));
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, pattern);
  };
  await expectError({ email: 'not-an-email' }, /email/);
  await expectError({ role: 'boss' }, /role/);
  await expectError({ temporaryPassword: 'short' }, /at least 8/);
  await expectError({ name: '  ' }, /name/);
  await expectError({ managerId: jane.id }, /Manager role/); // Jane isn't a manager
  await expectError({ role: 'manager' }, /Only employees and HR/); // managers have no line manager
});

test('admins can move staff to a new line manager', async () => {
  const omar = await createUser({ name: 'Omar', role: 'manager' });

  const res = await asAdmin.patch(`/api/users/${jane.id}`).send({ managerId: omar.id });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.managerName, 'Omar');
  // Omar now sees Jane's requests; Alice no longer does
  const janeAgent = await loginAs(jane);
  await janeAgent.post('/api/requests').send({ type: 'Annual Leave', from: '2099-03-02', to: '2099-03-03', reason: 'Trip' });
  assert.equal((await (await loginAs(omar)).get('/api/requests')).body.requests.length, 1);
  assert.equal((await (await loginAs(alice)).get('/api/requests')).body.requests.length, 0);
});

test('a manager with active staff cannot be demoted or deactivated', async () => {
  const demote = await asAdmin.patch(`/api/users/${alice.id}`).send({ role: 'employee' });
  assert.equal(demote.status, 409);
  assert.match(demote.body.error, /line manager of 1 active staff/);

  assert.equal((await asAdmin.patch(`/api/users/${alice.id}`).send({ active: false })).status, 409);

  // Once Jane has no line manager, Alice can be changed
  await asAdmin.patch(`/api/users/${jane.id}`).send({ managerId: null });
  assert.equal((await asAdmin.patch(`/api/users/${alice.id}`).send({ role: 'employee' })).status, 200);
});

test('changing someone to a role without a line manager clears it', async () => {
  const res = await asAdmin.patch(`/api/users/${jane.id}`).send({ role: 'manager' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.managerId, null);
});

test('deactivating an account logs it out and stops it logging in', async () => {
  const janeAgent = await loginAs(jane);

  const res = await asAdmin.patch(`/api/users/${jane.id}`).send({ active: false });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.active, false);
  assert.equal((await janeAgent.get('/api/auth/me')).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: jane.email, password: TEST_PASSWORD })).status, 401);
});

test('admins cannot lock themselves out', async () => {
  assert.equal((await asAdmin.patch(`/api/users/${admin.id}`).send({ active: false })).status, 400);
  assert.equal((await asAdmin.patch(`/api/users/${admin.id}`).send({ role: 'employee' })).status, 400);
  assert.equal((await asAdmin.patch(`/api/users/${admin.id}`).send({ name: 'Renamed Admin' })).status, 200);
});

test('resetting a password logs the user out and requires a new password', async () => {
  const janeAgent = await loginAs(jane);

  const res = await asAdmin.post(`/api/users/${jane.id}/reset-password`).send({ temporaryPassword: 'reset-temp-pass' });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.mustChangePassword, true);
  assert.equal((await janeAgent.get('/api/auth/me')).status, 401);
  const relogged = await loginAs(jane, 'reset-temp-pass');
  assert.equal((await relogged.get('/api/requests')).status, 403);
});

test('unknown users are 404', async () => {
  assert.equal((await asAdmin.patch('/api/users/999').send({ name: 'X' })).status, 404);
  assert.equal((await asAdmin.post('/api/users/abc/reset-password').send({ temporaryPassword: 'whatever-123' })).status, 404);
});
